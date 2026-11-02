-- Run as database owner. Only synthetic accounts and records; always roll back.
begin;
do $fixture$
declare actor uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,aud,role) values(actor,'discovery-'||actor::text||'@fixture.invalid','authenticated','authenticated');
 insert into public.archive_members(user_id,display_name) values(actor,'Discovery fixture');
 perform set_config('discovery_test.actor',actor::text,true);
end;
$fixture$;
set local role authenticated;
do $assertions$
declare actor uuid:=current_setting('discovery_test.actor')::uuid;
 saved public.playlists;
 original_time timestamptz;
 changed integer;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.likes(user_id,track_id,liked_at) values(actor,'t001',now()-interval '1 day');
 select liked_at into original_time from public.likes where user_id=actor and track_id='t001';
 insert into public.likes(user_id,track_id) values(actor,'t001') on conflict(user_id,track_id) do nothing;
 assert (select liked_at=original_time from public.likes where user_id=actor and track_id='t001'), 'repeated like preserves original time';
 insert into public.likes(user_id,track_id) values(actor,'t002');
 assert (select track_id from public.likes where user_id=actor order by liked_at desc nulls last,track_id limit 1)='t002', 'new like sorts first';
 assert (select liked_at=now() from public.likes where user_id=actor and track_id='t002'), 'database supplies new like time';
 insert into public.playlists(owner_id,title,track_ids) values(actor,'Discovery fixture',array['t001']) returning * into saved;
 update public.playlists set track_ids=array['t001','t002'] where id=saved.id and updated_at=saved.updated_at;
 -- A stale client version never matches, and the latest content remains intact.
 update public.playlists set track_ids='{}' where id=saved.id and updated_at=saved.updated_at-interval '1 second';
 get diagnostics changed=row_count;
 assert changed=0, 'stale playlist write rejected';
 assert (select track_ids=array['t001','t002'] from public.playlists where id=saved.id), 'playlist contents preserved';
end;
$assertions$;
reset role;
rollback;
select 'database-timed idempotent likes and playlist revision guard passed; fixtures rolled back' as result;
