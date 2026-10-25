create table public.archive_invites (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  remaining_uses integer not null check (remaining_uses between 0 and 10),
  expires_at timestamptz not null
);
alter table public.archive_invites enable row level security;
revoke all on public.archive_invites from public,anon,authenticated;
grant all on public.archive_invites to service_role;

-- Atomic reservation protects against parallel signups using the same invitation.
create function public.reserve_archive_invite(invite_hash text) returns boolean
language sql security invoker set search_path='' as $$
  with reserved as (
    update public.archive_invites set remaining_uses=remaining_uses-1
    where code_hash=invite_hash and remaining_uses>0 and expires_at>now()
    returning code_hash
  ) select exists(select 1 from reserved);
$$;
create function public.refund_archive_invite(invite_hash text) returns void
language sql security invoker set search_path='' as $$
  update public.archive_invites set remaining_uses=least(remaining_uses+1,10) where code_hash=invite_hash;
$$;
revoke all on function public.reserve_archive_invite(text),public.refund_archive_invite(text) from public,anon,authenticated;
grant execute on function public.reserve_archive_invite(text),public.refund_archive_invite(text) to service_role;

-- Vault encrypts these secrets at rest. The function exposes exactly these four
-- names to service_role only; ordinary users cannot execute it or read Vault.
create function public.read_playback_config() returns jsonb
language sql security invoker set search_path='' as $$
  select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb)
  from vault.decrypted_secrets where name in ('archive_r2_account_id','archive_r2_access_key_id','archive_r2_secret_access_key','archive_r2_bucket');
$$;
revoke all on function public.read_playback_config() from public,anon,authenticated;
grant execute on function public.read_playback_config() to service_role;
