import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from 'npm:@aws-sdk/client-s3@3.1156.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.1156.0';
import { inspectMp3, digest } from './mp3.ts';
const allowed=(Deno.env.get('ALLOWED_ORIGINS')||'https://ethanheinrick01-ctrl.github.io,http://127.0.0.1:8893,http://127.0.0.1:8894').split(',');
const uuid=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
 if(allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!token)return reply({error:'Sign in to upload.'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await db.auth.getUser(token);
 if(authError||!user)return reply({error:'Your session expired. Sign in again.'},401);
 const role=await db.from('archive_upload_roles').select('role').eq('user_id',user.id).maybeSingle();
 if(role.error||!role.data)return reply({error:'This account does not have upload access.'},403);
 let input;
 try{const body=await req.text();if(body.length>8192)return reply({error:'Request too large'},413);input=JSON.parse(body);}catch{return reply({error:'Invalid request'},400);}
 try{
  const config=await db.rpc('read_upload_config');
  const account=Deno.env.get('R2_ACCOUNT_ID')||config.data?.archive_r2_account_id;
  const bucket=Deno.env.get('R2_BUCKET')||config.data?.archive_r2_bucket;
  const accessKeyId=Deno.env.get('R2_UPLOAD_ACCESS_KEY_ID')||config.data?.archive_upload_access_key_id;
  const secretAccessKey=Deno.env.get('R2_UPLOAD_SECRET_ACCESS_KEY')||config.data?.archive_upload_secret_access_key;
  const ready=!!(account&&bucket&&accessKeyId&&secretAccessKey);
  if(input.action==='status')return reply({role:role.data.role,ready});
  if(!ready)return reply({error:'Uploads are not connected yet. Ethan needs to finish storage setup.'},503);
  const s3=new S3Client({region:'auto',endpoint:`https://${account}.r2.cloudflarestorage.com`,credentials:{accessKeyId,secretAccessKey},requestChecksumCalculation:'WHEN_REQUIRED'});
  if(input.action==='reserve'){
   if(!uuid(input.id)||typeof input.filename!=='string'||input.filename.length>240||!input.filename.toLowerCase().endsWith('.mp3')||typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>300||!Number.isInteger(input.bytes)||input.bytes<1024||input.bytes>31457280||typeof input.sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256)||typeof input.note!=='string'||input.note.length>1000)return reply({error:'Choose an MP3 up to 30 MB and give it a title.'},400);
   const r=await db.rpc('reserve_archive_submission',{actor:user.id,submission_id:input.id,file_name:input.filename,song_title:input.title.trim(),file_bytes:input.bytes,file_hash:input.sha256,uploader_note:input.note});
   if(r.error)return reply({error:r.error.message},400);
   const item=r.data;
   if(item.status!=='uploading')return reply({item});
   const url=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:`incoming/${item.id}.mp3`,ContentType:'audio/mpeg',ContentLength:item.bytes,IfNoneMatch:'*'}),{expiresIn:900,signableHeaders:new Set(['content-type','content-length','if-none-match'])});
   return reply({item,url});
  }
  if(!uuid(input.id))return reply({error:'Choose a submission.'},400);
  const result=await db.from('archive_submissions').select('*').eq('id',input.id).maybeSingle();
  if(result.error)throw new Error('Could not read the submission. Try again.');
  let item=result.data;
  if(!item || (role.data.role!=='admin'&&item.owner_id!==user.id))return reply({error:'Submission not found.'},404);
  const verifiedKey=`review/${item.id}.mp3`;
  if(input.action==='complete'){
   if(item.status!=='uploading')return reply({item});
   const object=await s3.send(new GetObjectCommand({Bucket:bucket,Key:`incoming/${item.id}.mp3`}));
   if(object.ContentLength!==item.bytes || !object.Body)throw new Error('The file did not finish uploading. Select it again and retry.');
   const bytes=await object.Body.transformToByteArray();
   if(await digest(bytes)!==item.sha256)throw new Error('The uploaded file did not match. Try the original file again.');
   const checked=inspectMp3(bytes);
   try{await s3.send(new PutObjectCommand({Bucket:bucket,Key:verifiedKey,Body:checked.audio,ContentType:'audio/mpeg',IfNoneMatch:'*',Metadata:{source_sha256:item.sha256}}));}
   catch(e){if((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==412)throw e;}
   const update=await db.from('archive_submissions').update({status:'pending',duration:checked.duration,updated_at:new Date().toISOString()}).eq('id',item.id).eq('status','uploading').select().maybeSingle();
   if(update.error)throw new Error('Audio checked, but status could not be saved. Retry to finish safely.');
   if(!update.data)throw new Error('This submission changed. Refresh before reviewing it.');
   return reply({item:update.data});
  }
  if(input.action==='preview'){
   if(!['pending','publishing','published'].includes(item.status))throw new Error('This file is not ready to preview.');
   const url=await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:verifiedKey}),{expiresIn:300});
   return reply({url});
  }
  if(role.data.role!=='admin')return reply({error:'Only an admin can review or publish.'},403);
  if(input.action==='reject'){
   if(!['pending','uploading'].includes(item.status))throw new Error('This submission can no longer be rejected.');
   if(typeof input.note!=='string'||!input.note.trim()||input.note.length>500)throw new Error('Add a short reason so the uploader knows what to fix.');
   const update=await db.from('archive_submissions').update({status:'rejected',review_note:input.note.trim(),reviewed_by:user.id,updated_at:new Date().toISOString()}).eq('id',item.id).in('status',['pending','uploading']).select().single();
   if(update.error)throw new Error('This submission changed. Refresh before reviewing it.');
   return reply({item:update.data});
  }
  if(input.action==='publish'){
   if(input.confirm!==true||typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>300)throw new Error('Confirm the song title before publishing.');
   const begin=await db.rpc('begin_archive_publish',{actor:user.id,submission_id:item.id,song_title:input.title});
   if(begin.error)throw new Error(begin.error.message);
   item=begin.data;
   if(item.status==='published')return reply({item});
   const object=await s3.send(new GetObjectCommand({Bucket:bucket,Key:verifiedKey}));
   if(!object.Body||!object.ContentLength||object.ContentLength>31457280)throw new Error('The checked audio is missing. Contact Ethan.');
   const checked=inspectMp3(await object.Body.transformToByteArray());
   try{await s3.send(new PutObjectCommand({Bucket:bucket,Key:`${item.track_id}.mp3`,Body:checked.audio,ContentType:'audio/mpeg',IfNoneMatch:'*',Metadata:{submission_id:item.id,source_sha256:item.sha256}}));}
   catch(e){
    if((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==412)throw e;
    const existing=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:`${item.track_id}.mp3`}));
    if(existing.Metadata?.submission_id!==item.id||existing.Metadata?.source_sha256!==item.sha256||existing.ContentLength!==checked.audio.length)throw new Error('A different file already uses this track ID. Contact Ethan; nothing was overwritten.');
   }
   const finish=await db.rpc('finish_archive_publish',{actor:user.id,submission_id:item.id});
   if(finish.error)throw new Error('Audio is saved. Tap Retry publishing to finish adding it to the library.');
   return reply({item:{...item,status:'published'}});
  }
  return reply({error:'Unknown action'},400);
 }catch(e){
  const message=e instanceof Error?e.message:'';
  // Never leak provider diagnostics, bucket details, keys, or signed URLs.
  const safe=/^(Choose |Invalid MP3|MP3 artwork|This file |Unsupported MP3|The MP3 |Unexpected data|The file |The uploaded |Audio checked|This submission|Add a short|Confirm |Only a checked|Archive ID|The checked|A different file|Audio is saved|Could not read|Admin access)/.test(message);
  return reply({error:safe?message:'Could not finish this step. Check your connection and retry; your submission will not be duplicated.'},400);
 }
});
