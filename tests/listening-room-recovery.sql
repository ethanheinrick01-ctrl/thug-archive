-- Run as the database owner against a configured archive project.
-- The synthetic user, membership, and room are rolled back; no existing user is touched.
begin;
do $fixture$
declare actor uuid := gen_random_uuid();
begin
  insert into auth.users(id,email,aud,role)
  values(actor,'room-sql-'||actor::text||'@fixture.invalid','authenticated','authenticated');
  insert into public.archive_members(user_id,display_name) values(actor,'SQL regression fixture');
  perform set_config('request.jwt.claim.sub',actor::text,true);
end;
$fixture$;
set local role authenticated;
do $assertions$
declare
  state jsonb;
  first_advance jsonb;
  duplicate_advance jsonb;
  room_id uuid;
  anchor text;
  duration double precision;
begin
  state := public.listening_room('create',null,'{"queue":["t001","t002","t003"],"playing":true}');
  room_id := (state->'room'->>'id')::uuid;
  anchor := state->'room'->>'anchor_at';
  first_advance := public.listening_room('next',room_id,jsonb_build_object('ended',true,'expected_anchor',anchor));
  duplicate_advance := public.listening_room('next',room_id,jsonb_build_object('ended',true,'expected_anchor',anchor));
  assert (first_advance->'room'->>'queue_index')::integer=1, 'first host device advances once';
  assert duplicate_advance->'room'->>'queue_index'=first_advance->'room'->>'queue_index', 'second device must not skip another song';
  assert duplicate_advance->'room'->>'revision'=first_advance->'room'->>'revision', 'duplicate end event must not mutate the room';
  state := public.listening_room('next',room_id,'{"ended":true}');
  assert state->'room'->>'revision'=first_advance->'room'->>'revision', 'automatic advances require an expected anchor';

  perform public.listening_room('playQueue',room_id,'{"queue":["t001"]}');
  select tracks.duration into duration from public.tracks where id='t001';
  perform public.listening_room('seek',room_id,jsonb_build_object('position',duration));
  perform public.listening_room('pause',room_id);
  state := public.listening_room('play',room_id);
  assert (state->'room'->>'position')::double precision=0, 'Play resets an exhausted recording to its start';
  assert (state->'room'->>'playing')::boolean, 'Play resumes the room';

  perform public.listening_room('repeat',room_id);
  state := public.listening_room('repeat',room_id);
  anchor := state->'room'->>'anchor_at';
  first_advance := public.listening_room('next',room_id,jsonb_build_object('ended',true,'expected_anchor',anchor));
  duplicate_advance := public.listening_room('next',room_id,jsonb_build_object('ended',true,'expected_anchor',anchor));
  assert duplicate_advance->'room'->>'revision'=first_advance->'room'->>'revision', 'repeat-one also ignores a second device end event';
end;
$assertions$;
reset role;
rollback;
select 'automatic advancement and exhausted-queue restart regressions passed; fixture rolled back' as result;
