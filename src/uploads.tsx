import { useEffect, useRef, useState } from 'preact/hooks';
import { supabase } from './data';
import { player } from './player';
import { inspectMp3, digest } from '../supabase/functions/uploads/mp3';
export type Submission = {id:string;filename:string;title:string;note:string;status:'uploading'|'pending'|'publishing'|'published'|'rejected';review_note:string;bytes:number;created_at:string;track_id:string|null};
const labels={uploading:'Upload unfinished',pending:'Waiting for review',publishing:'Publishing unfinished',published:'Added to library',rejected:'Not approved'};
async function action(body:Record<string,unknown>) {
 if(!supabase)throw new Error('Sign in again.');
 const {data,error}=await supabase.functions.invoke('uploads',{body});
 if(error){
  let message='Could not connect. Check your connection and retry.';
  try{const response=await error.context?.json();if(response?.error)message=response.error;}catch{}
  throw new Error(message);
 }
 if(data?.error)throw new Error(data.error);
 return data;
}
function sendFile(url:string,file:File,progress:(n:number)=>void) {
 return new Promise<void>((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.timeout=180000;
  xhr.setRequestHeader('Content-Type','audio/mpeg');xhr.setRequestHeader('If-None-Match','*');
  xhr.upload.onprogress=e=>{if(e.lengthComputable)progress(Math.round(100*e.loaded/e.total));};
  xhr.onload=()=>{if((xhr.status>=200&&xhr.status<300)||xhr.status===412)resolve();else reject(new Error('Upload did not finish. Select the same file and retry.'));};
  xhr.onerror=xhr.ontimeout=()=>reject(new Error('Connection interrupted. Keep this page open and retry the same file.'));
  xhr.send(file);
 });
}
export function Uploads({onPublished,onBusy}:{onPublished:()=>void;onBusy:(busy:boolean)=>void}) {
 const [role,setRole]=useState(''),[ready,setReady]=useState(false),[loading,setLoading]=useState(true);
 const [items,setItems]=useState<Submission[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [files,setFiles]=useState<File[]>([]),[note,setNote]=useState(''),[messages,setMessages]=useState<string[]>([]);
 const [progress,setProgress]=useState(''),[filter,setFilter]=useState('active'),[chosen,setChosen]=useState<Submission|null>(null);
 const [title,setTitle]=useState(''),[reason,setReason]=useState(''),[confirm,setConfirm]=useState(false),[preview,setPreview]=useState('');
 const lock=useRef(false),alive=useRef(true),audioHost=useRef<HTMLDivElement>(null);
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;player.endReview();};},[]);
 useEffect(()=>{if(preview&&audioHost.current)audioHost.current.appendChild(player.audio);},[preview]);
 async function refresh(){
  setError('');setLoading(true);
  try{
   const status=await action({action:'status'});
   const result=await supabase!.from('archive_submissions').select('*').order('created_at',{ascending:false}).limit(100);
   if(result.error)throw result.error;
   if(alive.current){setRole(status.role);setReady(status.ready);setItems(result.data as Submission[]);}
  }catch(e){if(alive.current)setError((e as Error).message);}
  finally{if(alive.current)setLoading(false);}
 }
 async function run(work:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);onBusy(true);setError('');
  const prevent=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',prevent);
  try{await work();}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);onBusy(false);window.removeEventListener('beforeunload',prevent);}
 }
 async function upload(){
  await run(async()=>{
   const failed:File[]=[];setMessages([]);
   for(let i=0;i<files.length;i++){
    const file=files[i];
    try{
     if(!file.name.toLowerCase().endsWith('.mp3'))throw new Error('MP3 only. Convert this file to MP3 first.');
     if(file.size<1024||file.size>31457280)throw new Error('Choose a file between 1 KB and 30 MB.');
     setProgress(`${i+1} of ${files.length}: checking ${file.name}`);
     const bytes=new Uint8Array(await file.arrayBuffer());inspectMp3(bytes);
     const sha256=await digest(bytes);
     const reserved=await action({action:'reserve',id:crypto.randomUUID(),filename:file.name,title:file.name.replace(/\.mp3$/i,'').trim()||'Untitled',bytes:file.size,sha256,note});
     if(reserved.url){await sendFile(reserved.url,file,n=>setProgress(`${i+1} of ${files.length}: ${file.name} · ${n}%`));setProgress(`Checking uploaded audio: ${file.name}`);await action({action:'complete',id:reserved.item.id});}
     const state=reserved.item.status==='uploading'?'Waiting for review':labels[reserved.item.status as Submission['status']];
     setMessages(old=>[...old,`${file.name}: ${state}.`]);
    }catch(e){failed.push(file);setMessages(old=>[...old,`${file.name}: ${(e as Error).message}`]);}
   }
   setFiles(failed);setProgress(failed.length?'Some files need attention. Fix the messages above, then retry.':'All files submitted. Nothing is published until an admin approves it.');await refresh();
  });
 }
 async function review(kind:'preview'|'publish'|'reject'|'complete'){
  if(!chosen)return;
  await run(async()=>{
   const result=await action({action:kind,id:chosen.id,title,note:reason,confirm});
   if(kind==='preview'){player.startReview(result.url,title);setPreview(chosen.id);return;}
   player.endReview();setPreview('');setChosen(null);setConfirm(false);setMessages([]);setProgress(kind==='publish'?'Song added to the library.':kind==='reject'?'Submission declined. The reason is saved in All submissions.':'File checked and ready for review.');await refresh();if(kind==='publish')onPublished();
  });
 }
 const visible=items.filter(x=>filter==='all'||['pending','publishing','uploading'].includes(x.status));
 return <section class="uploads-panel">
  <p class="muted">Choose files → Submit → Review → Add to library</p>
  <p>Uploads stay private. Only an admin can add them to the collection.</p>
  {error&&<p class="upload-error" role="alert">{error}</p>}
  {loading&&<p role="status">Loading submissions…</p>}
  {!loading&&!role&&<button class="secondary" onClick={()=>void refresh()}>Try again</button>}
  {role&&<>
   {!ready&&<p class="upload-error" role="status">Storage setup is still in progress. Uploads will be available here when it is connected.</p>}
   <fieldset disabled={busy||!ready} class="upload-picker">
    <legend>1. Choose MP3 files</legend>
    <p class="muted">Up to 10 files at once · 30 MB per file · 30 minutes per song. Keep this page open until submission finishes.</p>
    <label class="upload-file-label">Choose audio files<input type="file" accept=".mp3,audio/mpeg" multiple onChange={e=>{const next=Array.from(e.currentTarget.files||[]);if(next.length>10){setError('Choose up to 10 files at a time.');e.currentTarget.value='';return;}setFiles(next);e.currentTarget.value='';setMessages([]);setError('');setProgress('');}}/></label>
    {files.length>0&&<ul>{files.map(f=><li key={`${f.name}-${f.size}`}>{f.name} · {(f.size/1048576).toFixed(1)} MB</li>)}</ul>}
    <label>Note for the reviewer (optional)<textarea maxLength={1000} value={note} onInput={e=>setNote(e.currentTarget.value)} placeholder="Versions, spelling, or anything the reviewer should know."/></label>
    <button class="primary wide" disabled={!files.length||busy} onClick={()=>void upload()}>{busy?'Working…':`2. Submit ${files.length||''} ${files.length===1?'file':'files'} for review`}</button>
   </fieldset>
   <div role="status" aria-live="polite"><p>{progress}</p>{messages.length>0&&<ul class="upload-results">{messages.map((m,i)=><li key={i}>{m}</li>)}</ul>}</div>
   <div class="upload-list-heading"><h3>{role==='admin'?'Review queue':'Your submissions'}</h3><button class="text-button" disabled={busy||loading} onClick={()=>void refresh()}>Refresh</button></div>
   <label>Show<select value={filter} disabled={busy} onChange={e=>setFilter(e.currentTarget.value)}><option value="active">Needs attention</option><option value="all">All submissions (latest 100)</option></select></label>
   {!visible.length&&!loading&&<p class="muted">Nothing waiting here. Submitted files will appear in this list.</p>}
   <div class="upload-list">{visible.map(item=><button class={`submission-card ${chosen?.id===item.id?'selected':''}`} disabled={busy} key={item.id} onClick={()=>{player.endReview();setPreview('');setChosen(item);setTitle(item.title);setReason('');setConfirm(false);setError('');}}><strong>{item.title}</strong><span>{labels[item.status]}</span><small>{new Date(item.created_at).toLocaleDateString()} · {(item.bytes/1048576).toFixed(1)} MB</small>{item.review_note&&<small>Reason: {item.review_note}</small>}</button>)}</div>
   {chosen&&<section class="submission-review" aria-label="Selected submission">
    <h3>{chosen.title}</h3><p class="muted">{chosen.filename}</p>{chosen.note&&<p>Uploader’s note: {chosen.note}</p>}
    {['pending','publishing','published'].includes(chosen.status)&&<button class="secondary wide" disabled={busy} onClick={()=>void review('preview')}>Listen before deciding</button>}
    {preview&&<div class="review-audio"><p>Private preview. Press play to listen.</p><div ref={audioHost}/></div>}
    {chosen.status==='uploading'&&<><p>This upload was interrupted. Select the same file above to resume, or check whether it already finished.</p><button class="secondary" disabled={busy} onClick={()=>void review('complete')}>Check uploaded file</button></>}
    {role==='admin'&&['pending','publishing'].includes(chosen.status)&&<>
     <label>Song title<input maxLength={300} value={title} disabled={busy||chosen.status==='publishing'} onInput={e=>{setTitle(e.currentTarget.value);setConfirm(false);}}/></label>
     <label class="upload-confirm"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.currentTarget.checked)}/>I reviewed this file and want to add it to everyone’s library.</label>
     <button class="primary wide" disabled={busy||!confirm||!title.trim()} onClick={()=>void review('publish')}>{chosen.status==='publishing'?'Retry publishing':'Approve & add to library'}</button>
    </>}
    {role==='admin'&&['uploading','pending'].includes(chosen.status)&&<details><summary>Don’t add this file</summary><label>Reason for declining<textarea maxLength={500} value={reason} disabled={busy} onInput={e=>setReason(e.currentTarget.value)} placeholder="Duplicate version, wrong file, or other reason"/></label><button class="secondary wide" disabled={busy||!reason.trim()} onClick={()=>void review('reject')}>Decline submission</button></details>}
   </section>}
  </>}
 </section>;
}
