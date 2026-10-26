import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// This endpoint accepts an invitation and creates a pseudonymous username/password
// identity. Synthetic .invalid emails are never mailed or represented as verified
// real-world contact addresses. Passwords are handled only by Supabase Auth.
const allowed=(Deno.env.get('ALLOWED_ORIGINS')||'https://ethanheinrick01-ctrl.github.io,http://127.0.0.1:8893,http://127.0.0.1:8894').split(',');
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
 if(allowed.includes(origin)) headers['Access-Control-Allow-Origin']=origin;
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);
 if(Number(req.headers.get('Content-Length'))>8192)return reply({error:'Request too large'},413);
 let input;
 try{input=await req.json();}catch{return reply({error:'Invalid request'},400);}
 const username=typeof input.username==='string'?input.username.toLowerCase().trim():'';
 const password=input.password,invite=input.invite_code;
 if(!/^[a-z0-9_]{3,24}$/.test(username))return reply({error:'Choose a username with 3–24 letters, numbers, or underscores.'},400);
 if(typeof password!=='string'||password.length<10||new TextEncoder().encode(password).length>72)return reply({error:'Use a password with at least 10 characters and at most 72 bytes.'},400);
 if(typeof invite!=='string'||invite.trim().length<16||invite.length>100)return reply({error:'Enter the invite code Ethan shared with you.'},403);
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(invite.trim()));
 const hash=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const reserved=await admin.rpc('reserve_archive_invite',{invite_hash:hash});
 if(reserved.error||reserved.data!==true)return reply({error:'This invite code is invalid, expired, or already used. Ask Ethan for a new one.'},403);
 const refund=async()=>{await admin.rpc('refund_archive_invite',{invite_hash:hash});};
 const created=await admin.auth.admin.createUser({email:`${username}@thug-archive.invalid`,password,email_confirm:true,user_metadata:{display_name:username}});
 if(created.error||!created.data.user){await refund();return reply({error:'Couldn’t create this account. Try another username or a stronger password.'},400);}
 const member=await admin.rpc('finish_archive_registration',{invite_hash:hash,member_id:created.data.user.id,member_name:username});
 if(member.error){await admin.auth.admin.deleteUser(created.data.user.id);await refund();return reply({error:'Couldn’t finish your invitation. Please try again.'},503);}
 return reply({created:true,username});
});
