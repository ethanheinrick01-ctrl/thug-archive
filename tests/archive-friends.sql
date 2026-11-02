-- Database-owner regression: synthetic people, conversations and catalog rows all roll back.
begin;
do $fixture$
declare actor uuid; track text;
begin
  for i in 1..4 loop
    actor:=gen_random_uuid();
    insert into auth.users(id,email,aud,role) values(actor,'friend-test-'||actor::text||'@fixture.invalid','authenticated','authenticated');
    if i<4 then insert into public.archive_members(user_id,display_name) values(actor,'Friend fixture '||i); end if;
    perform set_config('friend_test.actor_'||i,actor::text,true);
  end loop;
  select 't'||lpad(n::text,3,'0') into track from generate_series(0,999) n
    where not exists(select 1 from public.tracks where id='t'||lpad(n::text,3,'0')) order by n desc limit 1;
  assert track is not null,'fixture needs a free track ID';
  insert into public.tracks(id,title,group_key,audio_key,available,archive_order) values(track,'Friend test recording',track,track||'.mp3',true,99999);
  perform set_config('friend_test.track',track,true);
end;
$fixture$;
set local role authenticated;
do $flow$
declare
  a uuid:=current_setting('friend_test.actor_1')::uuid;
  b uuid:=current_setting('friend_test.actor_2')::uuid;
  c uuid:=current_setting('friend_test.actor_3')::uuid;
  outsider uuid:=current_setting('friend_test.actor_4')::uuid;
  message uuid:=gen_random_uuid(); result jsonb; room uuid;
begin
  perform set_config('request.jwt.claim.sub',a::text,true);
  result:=public.friend_directory('Friend fixture','all',0);
  assert jsonb_array_length(result->'members')=2,'directory excludes self and nonmembers';
  assert not exists(select 1 from jsonb_array_elements(result->'members') m where m?'email'),'directory never includes email addresses';
  perform public.change_friendship(b,'request',0);
  assert (select m->>'relationship' from jsonb_array_elements(public.friend_directory('Friend fixture 2','requests',0)->'members') m)='outgoing','request is outgoing';
  begin
    perform public.change_friendship(b,'request',0);
    raise exception 'stale action accepted' using errcode='XX000';
  exception when raise_exception then assert sqlerrm like 'This friendship changed%', 'stale request cannot overwrite'; end;
  begin
    perform public.send_friend_message(b,message,'hello',null,null);
    raise exception 'pending friend send allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',b::text,true);
  assert (select m->>'relationship' from jsonb_array_elements(public.friend_directory('Friend fixture 1','requests',0)->'members') m)='incoming','request is incoming';
  begin
    perform public.change_friendship(a,'cancel',1);
    raise exception 'recipient canceled sender request' using errcode='XX000';
  exception when raise_exception then assert sqlerrm like 'This friendship changed%', 'recipient must accept or decline'; end;
  perform public.change_friendship(a,'accept',1);
  perform set_config('request.jwt.claim.sub',a::text,true);
  result:=public.send_friend_message(b,message,'  <b>hello</b> 😂  ',null,null);
  assert result->>'sent'='true','friends can send text';
  assert public.send_friend_message(b,message,'<b>hello</b> 😂',null,null)=result,'retry is idempotent';
  result:=public.friend_conversation(b);
  assert jsonb_array_length(result->'messages')=1,'retry creates only one message';
  assert result->'messages'->0->>'body'='<b>hello</b> 😂','markup remains plain text';
  assert (result->'messages'->0->>'sender_id')::uuid=a,'sender comes from auth';
  begin
    perform public.send_friend_message(b,gen_random_uuid(),'too soon',null,null);
    raise exception 'rate limit failed' using errcode='XX000';
  exception when raise_exception then assert sqlerrm like 'Give it a second%', 'sender rate limit works'; end;
  begin
    perform public.send_friend_message(b,gen_random_uuid(),repeat('x',1001),null,null);
    raise exception 'length accepted' using errcode='XX000';
  exception when raise_exception then assert sqlerrm like 'Write a message%', 'length enforced'; end;
  begin
    perform public.send_friend_message(b,gen_random_uuid(),' ',null,null);
    raise exception 'empty accepted' using errcode='XX000';
  exception when raise_exception then assert sqlerrm like 'Write a message%', 'empty rejected'; end;
  begin
    perform public.send_friend_message(b,gen_random_uuid(),'invite',gen_random_uuid(),null);
    raise exception 'fake room accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform public.send_friend_message(b,gen_random_uuid(),'song',null,'missing');
    raise exception 'fake song accepted' using errcode='XX000';
  exception when raise_exception then assert sqlerrm like 'Choose an available%', 'song validated'; end;
  begin
    perform 1 from archive_private.friend_messages;
    raise exception 'direct message read allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',c::text,true);
  begin
    perform public.friend_conversation(a);
    raise exception 'unrelated member read allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform public.send_friend_message(a,gen_random_uuid(),'intruder',null,null);
    raise exception 'unrelated member send allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin
    perform public.friend_directory('','all',0);
    raise exception 'nonmember directory allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  room:=(public.listening_room('create',null,'{}')->'room'->>'id')::uuid;
  perform set_config('friend_test.room',room::text,true);
end;
$flow$;
reset role;
update archive_private.friend_messages set created_at=clock_timestamp()-interval '2 minutes'
 where sender_id=current_setting('friend_test.actor_1')::uuid;
set local role authenticated;
do $attachments$
declare a uuid:=current_setting('friend_test.actor_1')::uuid; b uuid:=current_setting('friend_test.actor_2')::uuid; result jsonb; id uuid:=gen_random_uuid();
begin
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.send_friend_message(b,id,'Come listen',current_setting('friend_test.room')::uuid,null);
  result:=public.friend_conversation(b);
  assert result->'messages'->1->>'is_invite'='true','invitation is structured';
  assert result->'messages'->1->>'room_active'='true','active room can be joined';
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.send_friend_message(a,gen_random_uuid(),'',null,current_setting('friend_test.track'));
  result:=public.friend_conversation(a);
  assert result->'messages'->2->>'track_id'=current_setting('friend_test.track'),'song preserves its exact ID';
  assert result->'messages'->2->>'is_song'='true','song without a caption is valid';
  perform public.listening_room('join',current_setting('friend_test.room')::uuid,'{}');
  perform public.change_friendship(a,'block',2);
  begin
    perform public.friend_conversation(a);
    raise exception 'blocker still reads messages' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert jsonb_array_length(public.friend_directory('Friend fixture 2','all',0)->'members')=0,'blocked person cannot discover blocker';
  begin
    perform public.send_friend_message(b,gen_random_uuid(),'blocked',null,null);
    raise exception 'blocked sender accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform public.change_friendship(b,'unblock',3);
    raise exception 'other person block removed' using errcode='XX000';
  exception when raise_exception then assert sqlerrm like 'This friendship changed%', 'cannot remove another person block'; end;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.change_friendship(a,'unblock',3);
  begin
    perform public.friend_conversation(a);
    raise exception 'unblock restored friendship' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  perform public.change_friendship(a,'request',4);
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.change_friendship(b,'decline',5);
  perform public.change_friendship(b,'request',6);
  perform public.change_friendship(b,'cancel',7);
  perform public.change_friendship(b,'request',8);
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.change_friendship(a,'accept',9);
  perform public.change_friendship(a,'remove',10);
end;
$attachments$;
reset role;
-- Retention uses synthetic messages; never wait between 500 network sends.
update archive_private.friendships set status='accepted' where user_low=least(current_setting('friend_test.actor_1')::uuid,current_setting('friend_test.actor_2')::uuid)
 and user_high=greatest(current_setting('friend_test.actor_1')::uuid,current_setting('friend_test.actor_2')::uuid);
update archive_private.friend_messages set created_at=clock_timestamp()-interval '2 minutes' where sender_id in (current_setting('friend_test.actor_1')::uuid,current_setting('friend_test.actor_2')::uuid);
insert into archive_private.friend_messages(id,user_low,user_high,sender_id,body,created_at)
select gen_random_uuid(),least(current_setting('friend_test.actor_1')::uuid,current_setting('friend_test.actor_2')::uuid),
 greatest(current_setting('friend_test.actor_1')::uuid,current_setting('friend_test.actor_2')::uuid),current_setting('friend_test.actor_1')::uuid,
 'History '||i,clock_timestamp()-interval '2 days'+i*interval '1 second' from generate_series(1,505) i;
set local role authenticated;
do $retention$
begin
  perform set_config('request.jwt.claim.sub',current_setting('friend_test.actor_1'),true);
  perform public.send_friend_message(current_setting('friend_test.actor_2')::uuid,gen_random_uuid(),'latest',null,null);
  assert jsonb_array_length(public.friend_conversation(current_setting('friend_test.actor_2')::uuid)->'messages')=100,'conversation reads are bounded';
end;
$retention$;
reset role;
do $bound$
begin
  assert (select count(*) from archive_private.friend_messages where user_low=least(current_setting('friend_test.actor_1')::uuid,current_setting('friend_test.actor_2')::uuid)
    and user_high=greatest(current_setting('friend_test.actor_1')::uuid,current_setting('friend_test.actor_2')::uuid))=500,'stored conversation is bounded';
end;
$bound$;
set local role anon;
do $anonymous$
begin
  begin perform public.friend_directory('','all',0); raise exception 'anonymous directory allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin perform public.send_friend_message(current_setting('friend_test.actor_1')::uuid,gen_random_uuid(),'anonymous',null,null); raise exception 'anonymous send allowed' using errcode='XX000';
  exception when insufficient_privilege then null; end;
end;
$anonymous$;
reset role;
rollback;
select 'friends, request revisions, blocking, message isolation, attachments, retries, rate limits and retention passed; fixtures rolled back' as result;
