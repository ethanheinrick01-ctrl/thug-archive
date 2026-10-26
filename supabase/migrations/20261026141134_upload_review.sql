-- Roles are server-managed, never inferred from editable profile metadata.
create table public.archive_upload_roles (
 user_id uuid primary key references public.archive_members(user_id) on delete cascade,
 role text not null check(role in ('admin','contributor'))
);
alter table public.archive_upload_roles enable row level security;
create policy upload_role_self on public.archive_upload_roles for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.archive_upload_roles from public,anon,authenticated;
grant select on public.archive_upload_roles to authenticated;
grant all on public.archive_upload_roles to service_role;
alter table public.archive_invites add column upload_role text check(upload_role in ('admin','contributor'));

create function public.finish_archive_registration(invite_hash text, member_id uuid, member_name text) returns void
language plpgsql security invoker set search_path='' as $$
declare r text;
begin
 select upload_role into r from public.archive_invites where code_hash=invite_hash;
 if not found then raise exception 'Invitation not found'; end if;
 insert into public.archive_members(user_id,display_name) values(member_id,member_name);
 if r is not null then insert into public.archive_upload_roles values(member_id,r); end if;
end $$;
revoke all on function public.finish_archive_registration(text,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_archive_registration(text,uuid,text) to service_role;

create table public.archive_submissions (
 id uuid primary key,
 owner_id uuid not null references public.archive_members(user_id),
 filename text not null check(length(filename) between 1 and 240),
 title text not null check(length(trim(title)) between 1 and 300),
 note text not null default '' check(length(note)<=1000),
 bytes integer not null check(bytes between 1024 and 31457280),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'uploading' check(status in ('uploading','pending','publishing','published','rejected')),
 duration double precision,
 track_id text unique,
 review_note text not null default '' check(length(review_note)<=500),
 reviewed_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(sha256)
);
create index submissions_owner on public.archive_submissions(owner_id);
alter table public.archive_submissions enable row level security;
create policy submissions_read on public.archive_submissions for select to authenticated using(
 exists(select 1 from public.archive_upload_roles r where r.user_id=(select auth.uid()) and (r.role='admin' or owner_id=r.user_id))
);
revoke all on public.archive_submissions from public,anon,authenticated;
grant select on public.archive_submissions to authenticated;
grant all on public.archive_submissions to service_role;

-- Service-only transaction: serialized reservations enforce quotas under concurrency.
create function public.reserve_archive_submission(actor uuid, submission_id uuid, file_name text, song_title text, file_bytes integer, file_hash text, uploader_note text)
returns public.archive_submissions language plpgsql security invoker set search_path='' as $$
declare item public.archive_submissions;
begin
 perform pg_advisory_xact_lock(816232);
 if not exists(select 1 from public.archive_upload_roles where user_id=actor) then raise exception 'Upload access required'; end if;
 select * into item from public.archive_submissions where sha256=file_hash;
 if found then
   if item.owner_id<>actor then raise exception 'This file has already been submitted'; end if;
   return item;
 end if;
 if (select count(*) from public.archive_submissions where owner_id=actor and status in ('uploading','pending','publishing'))>=30 then raise exception 'Your review queue is full (30 files). Wait for review before adding more.'; end if;
 if (select count(*) from public.archive_submissions where owner_id=actor and created_at>now()-interval '1 hour')>=30 then raise exception 'Upload limit reached. Try again in an hour.'; end if;
 -- Conservative lifetime allowance. Increasing it requires an explicit storage audit.
 if (select coalesce(sum(bytes),0) from public.archive_submissions)+file_bytes>524288000 then raise exception 'Uploads are paused: the storage allowance is full. Ask Ethan to review storage.'; end if;
 insert into public.archive_submissions(id,owner_id,filename,title,bytes,sha256,note)
 values(submission_id,actor,file_name,song_title,file_bytes,file_hash,uploader_note) returning * into item;
 return item;
end $$;

create function public.begin_archive_publish(actor uuid, submission_id uuid, song_title text)
returns public.archive_submissions language plpgsql security invoker set search_path='' as $$
declare item public.archive_submissions; next_id integer;
begin
 perform pg_advisory_xact_lock(816232);
 if not exists(select 1 from public.archive_upload_roles where user_id=actor and role='admin') then raise exception 'Admin access required'; end if;
 select * into item from public.archive_submissions where id=submission_id for update;
 if not found then raise exception 'Submission not found'; end if;
 if item.status in ('published','publishing') then return item; end if;
 if item.status<>'pending' then raise exception 'Only a checked, pending file can be published'; end if;
 select greatest(coalesce((select max(substring(id from 2)::integer) from public.tracks),0),coalesce((select max(substring(track_id from 2)::integer) from public.archive_submissions),0))+1 into next_id;
 if next_id>999 then raise exception 'Archive ID capacity reached. Ask Ethan to expand it.'; end if;
 update public.archive_submissions set status='publishing',title=trim(song_title),track_id='t'||lpad(next_id::text,3,'0'),reviewed_by=actor,updated_at=now() where id=submission_id returning * into item;
 return item;
end $$;

create function public.finish_archive_publish(actor uuid, submission_id uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare item public.archive_submissions;
begin
 perform pg_advisory_xact_lock(816232);
 if not exists(select 1 from public.archive_upload_roles where user_id=actor and role='admin') then raise exception 'Admin access required'; end if;
 select * into item from public.archive_submissions where id=submission_id for update;
 if item.status='published' then return item.track_id; end if;
 if item.status is distinct from 'publishing' then raise exception 'Publication was not started'; end if;
 insert into public.tracks(id,title,group_key,aliases,duration,audio_key,available,archive_order)
 values(item.track_id,item.title,lower(item.title),array[item.filename],item.duration,item.track_id||'.mp3',true,(select coalesce(max(archive_order),0)+1 from public.tracks));
 update public.archive_submissions set status='published',updated_at=now() where id=submission_id;
 return item.track_id;
end $$;
revoke all on function public.reserve_archive_submission(uuid,uuid,text,text,integer,text,text),public.begin_archive_publish(uuid,uuid,text),public.finish_archive_publish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_archive_submission(uuid,uuid,text,text,integer,text,text),public.begin_archive_publish(uuid,uuid,text),public.finish_archive_publish(uuid,uuid) to service_role;

create function public.read_upload_config() returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb) from vault.decrypted_secrets
 where name in ('archive_r2_account_id','archive_r2_bucket','archive_upload_access_key_id','archive_upload_secret_access_key');
$$;
revoke all on function public.read_upload_config() from public,anon,authenticated;
grant execute on function public.read_upload_config() to service_role;
