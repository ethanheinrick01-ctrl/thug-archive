import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

function fixture(preview=false) {
  const calls:any[]=[];
  const db:any={from:(name:string)=>{calls.push(['from',name]);return db;}};
  for(const method of ['upsert','delete','update','eq','select'])db[method]=(...args:any[])=>{calls.push([method,...args]);return db;};
  db.maybeSingle=async()=>({data:null,error:null});
  const exports:any={};
  const source=readFileSync(new URL('../src/data.ts',import.meta.url),'utf8').replace(/import .*?from .*?;\n/g,'').replaceAll(/import\.meta\.env\.[A-Z_]+/g,'true');
  const code=stripTypeScriptTypes(source,{mode:'strip'}).replace(/export /g,'');
  runInNewContext(code+'\nObject.assign(exports,{setLike,updatePlaylist,createPlaylist,loadLibrary});',{
    exports,createClient:()=>db,deviceAuthStorage:{},location:{hostname:preview?'localhost':'example.test',search:'?preview'},URLSearchParams,
    localStorage:{getItem:()=>null,setItem:()=>{}},crypto,structuredClone,fetch:async()=>({ok:true,json:async()=>[]}),
  });
  return {api:exports,calls};
}
test('like writes use database time and ignore duplicate inserts',async()=>{
 const {api,calls}=fixture();await api.setLike('user','t001',true);
 const call=calls.find(x=>x[0]==='upsert');
 assert.equal(call[1].liked_at,undefined);
 assert.equal(call[2].ignoreDuplicates,true);
});
test('a stale playlist edit fails visibly and uses its original revision',async()=>{
 const {api,calls}=fixture();const updated_at='2026-11-01T00:00:00Z';
 await assert.rejects(api.updatePlaylist({id:'p',owner_id:'u',updated_at},{track_ids:['t002']}),/changed on another device/);
 assert.ok(calls.some(x=>x[0]==='eq'&&x[1]==='updated_at'&&x[2]===updated_at));
});
test('preview likes preserve newest first, duplicate likes and unlike then relike',async()=>{
 const {api}=fixture(true);
 await api.setLike('u','t001',true);await api.setLike('u','t002',true);await api.setLike('u','t001',true);
 assert.equal((await api.loadLibrary()).likes.join(','),'t002,t001');
 await api.setLike('u','t001',false);await api.setLike('u','t001',true);
 assert.equal((await api.loadLibrary()).likes.join(','),'t001,t002');
 const original=await api.createPlaylist('u','Fixture',['t001']);
 await api.updatePlaylist(original,{track_ids:['t001','t002']});
 await assert.rejects(api.updatePlaylist(original,{track_ids:[]}),/changed on another device/);
 assert.equal((await api.loadLibrary()).playlists[0].track_ids.join(','),'t001,t002');
});

function refreshFixture(){
 const source=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const start=source.indexOf('  async function refresh('),end=source.indexOf('  useEffect(',start);
 const pending:{resolve:(value:any)=>void,reject:(error:Error)=>void}[]=[];
 const values:any[]=[],errors:string[]=[];
 const state={liveUser:{current:'first'},libraryRequest:{current:0},mutating:{current:false}};
 const exports:any={};
 runInNewContext(stripTypeScriptTypes(source.slice(start,end),{mode:'strip'})+'\nObject.assign(exports,{refresh,run});',{
  ...state,exports,loadLibrary:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),setLib:(v:any)=>values.push(v),setLoadError:(v:string)=>errors.push(v),player:{connect:()=>{}},setBusy:()=>{},toast:()=>{},
 });return {...exports,...state,pending,values,errors};
}
test('late library success, failure and old-account reads cannot replace newer state',async()=>{
 const f=refreshFixture();const old=f.refresh(),fresh=f.refresh();
 f.pending[1].resolve({tracks:[],name:'fresh'});await fresh;f.pending[0].resolve({tracks:[],name:'old'});await old;
 assert.equal(f.values.length,1);assert.equal(f.values[0].name,'fresh');
 const error=f.refresh(),newer=f.refresh();f.pending[3].resolve({tracks:[]});await newer;f.pending[2].reject(new Error('old failure'));await error;
 assert.ok(!f.errors.includes('old failure'));
 const account=f.refresh();f.liveUser.current='second';f.pending[4].resolve({tracks:[],name:'wrong user'});await account;
 assert.equal(f.values.length,2);
});
test('a mutation invalidates pending reads and only its post-write refresh applies',async()=>{
 const f=refreshFixture();const old=f.refresh();let finish:()=>void=()=>{};
 const write=f.run(()=>new Promise<void>(resolve=>{finish=resolve;}));
 f.pending[0].resolve({tracks:[],name:'before write'});await old;assert.equal(f.values.length,0);
 await f.refresh();assert.equal(f.pending.length,1);
 finish();await new Promise(resolve=>setImmediate(resolve));f.pending[1].resolve({tracks:[],name:'after write'});await write;
 assert.equal(f.values[0].name,'after write');assert.equal(f.mutating.current,false);
});

test('submission filtering happens before pagination so old pending uploads stay visible',async()=>{
 const source=readFileSync(new URL('../src/uploads.tsx',import.meta.url),'utf8');
 const start=source.indexOf(' async function refresh()'),end=source.indexOf(' async function run(',start);
 const catalog=[...Array.from({length:102},(_,i)=>({id:String(i),status:'published'})),{id:'old-pending',status:'pending'}];
 const outputs:any[]=[];
 let selected=catalog;
 const query:any={select:()=>query,order:()=>query,in:(_key:string,statuses:string[])=>{selected=selected.filter(x=>statuses.includes(x.status));return query;},range:async(from:number,to:number)=>({data:selected.slice(from,to+1),error:null})};
 const api:any={};
 runInNewContext(stripTypeScriptTypes(source.slice(start,end),{mode:'strip'})+'\nexports.refresh=refresh;',{
  exports:api,request:{current:0},alive:{current:true},filter:'active',page:0,action:async()=>({role:'admin',ready:true}),supabase:{from:()=>query},
  setError:()=>{},setLoading:()=>{},setHasMore:()=>{},setItems:(v:any)=>outputs.push(v),setRole:()=>{},setReady:()=>{},
 });
 await api.refresh();assert.equal(outputs.at(-1)[0].id,'old-pending');assert.equal(outputs.at(-1).length,1);
});
