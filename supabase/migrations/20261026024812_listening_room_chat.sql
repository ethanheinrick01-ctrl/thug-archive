-- Private chat shares the listening room's existing membership boundary.
create table public.listening_room_messages (
  id uuid primary key,
  room_id uuid not null references public.listening_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  body text not null check(char_length(body) between 1 and 1000 and body=btrim(body)),
  created_at timestamptz not null default clock_timestamp()
);
create index listening_messages_room_time_idx on public.listening_room_messages(room_id,created_at desc,id desc);
create index listening_messages_user_time_idx on public.listening_room_messages(user_id,created_at desc);
create index listening_messages_time_idx on public.listening_room_messages(created_at);
alter table public.listening_room_messages enable row level security;
revoke all on public.listening_room_messages from public,anon,authenticated;
grant select on public.listening_room_messages to authenticated;
grant all on public.listening_room_messages to service_role;
create policy listening_messages_read on public.listening_room_messages for select to authenticated
using(archive_private.in_listening_room(room_id) and exists(
  select 1 from public.listening_rooms r where r.id=room_id and r.ended_at is null and r.expires_at>now()
));

create function archive_private.send_room_message(p_room uuid,p_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  actor_name text;
  r public.listening_rooms%rowtype;
  message public.listening_room_messages%rowtype;
  cleaned text := btrim(p_body);
  stamp timestamptz;
begin
  select display_name into actor_name from public.archive_members where user_id=actor;
  if actor is null or actor_name is null then
    raise exception 'Sign in with an invited archive account.' using errcode='42501';
  end if;
  -- Same lock as leaving/ending a room: membership cannot change during a send.
  select * into r from public.listening_rooms where id=p_room for update;
  stamp:=clock_timestamp();
  if not found or r.ended_at is not null or r.expires_at<=stamp
    or not archive_private.in_listening_room(p_room) then
    raise exception 'Join an active listening room to chat.' using errcode='42501';
  end if;
  if p_id is null or cleaned is null or char_length(cleaned) not between 1 and 1000 then
    raise exception 'Write a message between 1 and 1,000 characters.';
  end if;
  select * into message from public.listening_room_messages where id=p_id;
  if found then
    if message.room_id=p_room and message.user_id=actor and message.body=cleaned then
      return to_jsonb(message);
    end if;
    raise exception 'Please try sending a new message.';
  end if;
  -- Serialize per sender across rooms, too. Limits remain effective on multiple devices.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,771));
  if exists(select 1 from public.listening_room_messages where user_id=actor and created_at>stamp-interval '1 second')
    or (select count(*) from public.listening_room_messages where user_id=actor and created_at>stamp-interval '1 minute')>=30 then
    raise exception 'Give it a second before sending another message.';
  end if;
  insert into public.listening_room_messages(id,room_id,user_id,display_name,body,created_at)
  values(p_id,p_room,actor,actor_name,cleaned,stamp) returning * into message;
  -- Keep storage bounded for small private rooms; trim old history as chat is used.
  delete from public.listening_room_messages where room_id=p_room and id in (
    select id from public.listening_room_messages where room_id=p_room
    order by created_at desc,id desc offset 200
  );
  delete from public.listening_room_messages where created_at<stamp-interval '7 days';
  return to_jsonb(message);
end;
$$;
revoke all on function archive_private.send_room_message(uuid,uuid,text) from public,anon;
grant execute on function archive_private.send_room_message(uuid,uuid,text) to authenticated;

create function public.send_room_message(p_room uuid,p_id uuid,p_body text) returns jsonb
language sql security invoker set search_path='' as $$
  select archive_private.send_room_message(p_room,p_id,p_body);
$$;
revoke all on function public.send_room_message(uuid,uuid,text) from public,anon;
grant execute on function public.send_room_message(uuid,uuid,text) to authenticated;
alter publication supabase_realtime add table public.listening_room_messages;
