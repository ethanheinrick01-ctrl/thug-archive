-- Database-owner regression check. All test identities, rooms and messages roll back.
begin;
do $fixture$
declare actor uuid;
begin
  for i in 1..3 loop
    actor:=gen_random_uuid();
    insert into auth.users(id,email,aud,role)
      values(actor,'chat-regression-'||actor::text||'@fixture.invalid','authenticated','authenticated');
    insert into public.archive_members(user_id,display_name) values(actor,'Chat fixture '||i);
    perform set_config('chat_test.actor_'||i,actor::text,true);
  end loop;
end;
$fixture$;
set local role authenticated;
do $assertions$
declare
  host uuid:=current_setting('chat_test.actor_1')::uuid;
  guest uuid:=current_setting('chat_test.actor_2')::uuid;
  outsider uuid:=current_setting('chat_test.actor_3')::uuid;
  room uuid;
  message_id uuid:=gen_random_uuid();
  sent jsonb;
begin
  perform set_config('request.jwt.claim.sub',host::text,true);
  room:=(public.listening_room('create',null,'{}')->'room'->>'id')::uuid;
  perform set_config('chat_test.room',room::text,true);
  sent:=public.send_room_message(room,message_id,'  <b>Hello</b> 😂  ');
  assert sent->>'body'='<b>Hello</b> 😂', 'message whitespace is normalized; markup is stored as text';
  assert sent->>'display_name'='Chat fixture 1', 'sender comes from trusted membership';
  assert (sent->>'user_id')::uuid=host, 'sender cannot be spoofed';
  assert public.send_room_message(room,message_id,'<b>Hello</b> 😂')=sent, 'retry returns the same message';
  assert (select count(*) from public.listening_room_messages where room_id=room)=1, 'retry does not duplicate';
  begin
    perform public.send_room_message(room,gen_random_uuid(),'too fast');
    raise exception 'rate limit failed' using errcode='XX000';
  exception when raise_exception then assert sqlerrm like 'Give it a second%', 'rate limit is enforced'; end;
  begin
    perform public.send_room_message(room,gen_random_uuid(),repeat('x',1001));
    raise exception 'length limit failed' using errcode='XX000';
  exception when raise_exception then assert sqlerrm like 'Write a message%', 'length is enforced'; end;
  begin
    perform public.send_room_message(room,gen_random_uuid(),'   ');
    raise exception 'empty message accepted' using errcode='XX000';
  exception when raise_exception then assert sqlerrm like 'Write a message%', 'empty message rejected'; end;
  begin
    insert into public.listening_room_messages(id,room_id,user_id,display_name,body)
      values(gen_random_uuid(),room,guest,'Forged name','forged');
    raise exception 'direct insert allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  assert (select count(*) from public.listening_room_messages where room_id=room)=0, 'outsider cannot read chat';
  begin
    perform public.send_room_message(room,gen_random_uuid(),'not a member');
    raise exception 'outsider send allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',guest::text,true);
  perform public.listening_room('join',room,'{}');
  assert (select count(*) from public.listening_room_messages where room_id=room)=1, 'joined guest sees history';
  perform public.send_room_message(room,gen_random_uuid(),'guest reply');
  perform public.listening_room('leave',room,'{}');
  assert (select count(*) from public.listening_room_messages where room_id=room)=0, 'leaving revokes read access';
  begin
    perform public.send_room_message(room,gen_random_uuid(),'left room');
    raise exception 'left member send allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end;
$assertions$;
reset role;
-- Older messages exercise retention without waiting or manufacturing hundreds of requests.
update public.listening_room_messages set created_at=clock_timestamp()-interval '2 minutes'
  where room_id=current_setting('chat_test.room')::uuid;
insert into public.listening_room_messages(id,room_id,user_id,display_name,body,created_at)
select gen_random_uuid(),current_setting('chat_test.room')::uuid,current_setting('chat_test.actor_1')::uuid,
  'Chat fixture 1','History '||i,clock_timestamp()-interval '2 hours'+i*interval '1 second'
from generate_series(1,205) i;
set local role authenticated;
do $retention$
begin
  perform set_config('request.jwt.claim.sub',current_setting('chat_test.actor_1'),true);
  perform public.send_room_message(current_setting('chat_test.room')::uuid,gen_random_uuid(),'latest');
  assert (select count(*) from public.listening_room_messages where room_id=current_setting('chat_test.room')::uuid)=200, 'room history is capped';
  perform public.listening_room('leave',current_setting('chat_test.room')::uuid,'{}');
  assert (select count(*) from public.listening_room_messages where room_id=current_setting('chat_test.room')::uuid)=0, 'ended room chat is hidden';
  begin
    perform public.send_room_message(current_setting('chat_test.room')::uuid,gen_random_uuid(),'ended');
    raise exception 'ended room send allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end;
$retention$;
reset role;
set local role anon;
do $anonymous$
begin
  begin
    perform public.send_room_message(current_setting('chat_test.room')::uuid,gen_random_uuid(),'anonymous');
    raise exception 'anonymous send allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end;
$anonymous$;
reset role;
rollback;
select 'chat isolation, validation, idempotency, rate limits, retention and room exit passed; fixtures rolled back' as result;
