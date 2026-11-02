import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscoveryIndex,emptyFilters,matchesDiscovery,selectRecordings,rankedChoices,activeFilters} from '../src/discovery';
import type {Track} from '../src/model';
const track=(id:string,extra:Partial<Track>={})=>({id,title:id,artist:null,features:[],aliases:[],version:null,group_key:id,tags:[],duration:180,artwork:null,audio_key:null,available:true,archive_order:1,...extra}) as Track;
const tracks=[track('a',{artist:'Young Thug',features:['Gunna'],tags:['pace-slower']}),track('b',{artist:'Young Thug',tags:['pace-upbeat','pace-harder']}),track('c',{artist:'Lil Uzi Vert',tags:['pace-upbeat']}),track('d')];
const index=createDiscoveryIndex(tracks);
test('pace choices combine within the section and intersect with artists',()=>{
 const result=selectRecordings(tracks,'',{artists:['Young Thug'],styles:['pace-upbeat','pace-slower']},'archive',index);
 assert.deepEqual(result.map(t=>t.id),['a','b']);
 assert.deepEqual(selectRecordings(tracks,'',{artists:['Gunna'],styles:['pace-upbeat']},'archive',index),[]);
});
test('search normalizes titles aliases and credited collaborators without inventing artists',()=>{
 assert.equal(matchesDiscovery(tracks[0],'GUNNA',emptyFilters(),index),true);
 assert.equal(matchesDiscovery(tracks[3],'Young Thug',emptyFilters(),index),false);
 const t=track('e',{title:'Qué!',aliases:['Old Name']});const ix=createDiscoveryIndex([t]);
 assert.equal(matchesDiscovery(t,'que',emptyFilters(),ix),true);
 assert.equal(matchesDiscovery(t,'old name',emptyFilters(),ix),true);
});
test('filtering preserves distinct versions, duplicate queue occurrences and source order',()=>{
 const a=track('a',{group_key:'same',artist:'Young Thug'}),b=track('b',{group_key:'same',artist:'Young Thug'});
 const source=[b,a,b],ix=createDiscoveryIndex([a,b]);
 assert.deepEqual(selectRecordings(source,'',{artists:['Young Thug'],styles:[]},'archive',ix).map(t=>t.id),['b','a','b']);
 assert.deepEqual(source.map(t=>t.id),['b','a','b']);
});
test('choices rank by matching count with stable alphabetical ties',()=>{
 const counts:Record<string,number>={g:19,a:2,z:2};
 assert.deepEqual(rankedChoices([{id:'z',label:'Zed'},{id:'a',label:'Alpha'},{id:'g',label:'Gunna'}],id=>counts[id]).map(o=>o.id),['g','a','z']);
 const f={artists:['Gunna'],styles:['pace-upbeat']};
 assert.deepEqual(activeFilters(f)[0].remove,{artists:[],styles:['pace-upbeat']});
 assert.deepEqual(f,{artists:['Gunna'],styles:['pace-upbeat']});
});
test('unknown styles stay unassigned and artist sorting leaves saved order intact',()=>{
 assert.deepEqual(index.facts.get('d')?.styles,[]);
 assert.deepEqual(selectRecordings(tracks,'',emptyFilters(),'artist',index).map(t=>t.id),['c','a','b','d']);
 assert.deepEqual(tracks.map(t=>t.id),['a','b','c','d']);
});
