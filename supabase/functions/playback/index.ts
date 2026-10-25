import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.1156.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.1156.0';

// Signed URLs are bearer capabilities. Keep them out of logs, caches, and analytics.
// Audio streams directly from R2; this function returns only small JSON responses.
const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'https://ethanheinrick01-ctrl.github.io,http://127.0.0.1:8893,http://127.0.0.1:8894').split(',');
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers: Record<string,string> = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin' };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers});
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (req.method !== 'POST') return reply({error:'Method not allowed'},405);
  if (origin && !allowed.includes(origin)) return reply({error:'Origin not allowed'},403);
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply({error:'Sign in first'},401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error:authError} = await db.auth.getUser(authorization.slice(7));
  if (authError || !user) return reply({error:'Sign in again'},401);
  const member = await db.from('archive_members').select('user_id').eq('user_id',user.id).maybeSingle();
  if (member.error || !member.data) return reply({error:'Archive invitation required'},403);
  let ids: unknown;
  try { if (Number(req.headers.get('Content-Length')) > 8192) return reply({error:'Request too large'},413); ids=(await req.json()).track_ids; } catch { return reply({error:'Invalid request'},400); }
  if (!Array.isArray(ids) || ids.length<1 || ids.length>50 || !ids.every(id=>typeof id==='string' && /^t\d{3}$/.test(id))) return reply({error:'Choose between 1 and 50 archive tracks'},400);
  const result = await db.from('tracks').select('id,audio_key').in('id',[...new Set(ids)]).eq('available',true);
  if (result.error) return reply({error:'Could not look up tracks'},503);
  if (!result.data?.length) return reply({urls:{},expires_in:3600});
  // Prefer runtime environment secrets; Vault is the encrypted connected-tool setup.
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const config=await admin.rpc('read_playback_config');
  const account=Deno.env.get('R2_ACCOUNT_ID')||config.data?.archive_r2_account_id,
    accessKeyId=Deno.env.get('R2_ACCESS_KEY_ID')||config.data?.archive_r2_access_key_id,
    secretAccessKey=Deno.env.get('R2_SECRET_ACCESS_KEY')||config.data?.archive_r2_secret_access_key,
    bucket=Deno.env.get('R2_BUCKET')||config.data?.archive_r2_bucket;
  if (!account || !accessKeyId || !secretAccessKey || !bucket) return reply({error:'Audio hosting setup is not complete'},503);
  const s3 = new S3Client({region:'auto',endpoint:`https://${account}.r2.cloudflarestorage.com`,credentials:{accessKeyId,secretAccessKey}});
  try {
    const pairs = await Promise.all(result.data.map(async t=>[t.id,await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:t.audio_key}),{expiresIn:3600})]));
    return reply({urls:Object.fromEntries(pairs),expires_in:3600});
  } catch { return reply({error:'Could not prepare playback. Try again.'},503); }
});
