-- Run as database owner. Synthetic accounts and rooms roll back.
begin;
do $fixture$
declare actor uuid;
begin
  for i in 1..2 loop
    actor:=gen_random_uuid();
    insert into auth.users(id,email,aud,role) values(actor,'queue-regression-'||actor::text||'@fixture.invalid','authenticated','authenticated');
    insert into public.archive_members(user_id,display_name) values(actor,'Queue fixture '||i);
    perform set_config('queue_test.actor_'||i,actor::text,true);
  end loop;
end;
$fixture$;
set local role authenticated;
do $assertions$
declare
  original jsonb;
  updated jsonb;
  room_id uuid;
  empty_room uuid;
  first_song text;
begin
  perform set_config('request.jwt.claim.sub',current_setting('queue_test.actor_1'),true);
  original:=public.listening_room('create',null,jsonb_build_object('queue',array_fill('t001'::text,array[245]),'index',42,'position',12,'playing',true));
  room_id:=(original->'room'->>'id')::uuid;
  updated:=public.listening_room('add',room_id,'{"id":"t002","next":false}');
  assert updated->'room'->'queue'->>43='t002', 'host addition is immediately after current song';
  assert jsonb_array_length(updated->'room'->'queue')=246, 'existing songs are preserved';
  assert updated->'room'->>'queue_index'='42', 'current song index does not jump';
  assert updated->'room'->>'anchor_at'=original->'room'->>'anchor_at', 'addition preserves playback clock';
  assert updated->'room'->>'position'=original->'room'->>'position', 'addition preserves playback position';
  assert updated->'room'->>'playing'='true', 'current song keeps playing';
  perform set_config('request.jwt.claim.sub',current_setting('queue_test.actor_2'),true);
  perform public.listening_room('join',room_id,'{}');
  updated:=public.listening_room('add',room_id,'{"id":"t003"}');
  assert updated->'room'->'queue'->>43='t003', 'guest addition also goes first';
  assert updated->'room'->'queue'->>44='t002', 'previous addition follows the newest request';
  assert updated->'room'->'queue'->>45='t001', 'the original remaining queue follows requests';
  assert jsonb_array_length(updated->'room'->'queue')=247, 'both additions and all 245 original entries remain';
  perform set_config('request.jwt.claim.sub',current_setting('queue_test.actor_1'),true);
  updated:=public.listening_room('next',room_id,'{}');
  assert updated->'room'->'queue'->>((updated->'room'->>'queue_index')::integer)='t003', 'skip advances to requested song';
  empty_room:=(public.listening_room('create',null,'{}')->'room'->>'id')::uuid;
  updated:=public.listening_room('add',empty_room,'{"id":"t002"}');
  assert updated->'room'->'queue'='["t002"]'::jsonb and updated->'room'->>'queue_index'='0', 'empty queue accepts its first entry';
end;
$assertions$;
reset role;
rollback;
select 'host and guest insert before long queues; current playback preserved; empty queue passed; fixtures rolled back' as result;
