-- Social data stays behind membership-checked RPCs, outside the exposed schemas.
create table archive_private.friendships (
  user_low uuid not null references public.archive_members(user_id) on delete cascade,
  user_high uuid not null references public.archive_members(user_id) on delete cascade,
  status text not null default 'none' check(status in ('none','pending','accepted')),
  requested_by uuid,
  blocked_by uuid[] not null default '{}',
  revision bigint not null default 0,
  primary key(user_low,user_high),
  check(user_low<user_high),
  check(requested_by is null or requested_by in (user_low,user_high)),
  check(blocked_by<@array[user_low,user_high]),
  check(status='none' or requested_by is not null)
);
create index friendships_high_idx on archive_private.friendships(user_high);
create table archive_private.friend_messages (
  id uuid primary key,
  user_low uuid not null,
  user_high uuid not null,
  sender_id uuid not null references public.archive_members(user_id) on delete cascade,
  body text not null check(char_length(body)<=1000 and body=btrim(body)),
  track_id text references public.tracks(id) on delete set null,
  is_song boolean not null default false,
  room_id uuid references public.listening_rooms(id) on delete set null,
  is_invite boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(user_low,user_high) references archive_private.friendships(user_low,user_high) on delete cascade,
  check(sender_id in (user_low,user_high)),
  check(char_length(body)>0 or is_invite or is_song),
  check(not (is_invite and is_song))
);
create index friend_messages_pair_time_idx on archive_private.friend_messages(user_low,user_high,created_at desc,id desc);
create index friend_messages_sender_time_idx on archive_private.friend_messages(sender_id,created_at desc);
create table archive_private.friend_action_limits (
  user_id uuid primary key references public.archive_members(user_id) on delete cascade,
  window_start timestamptz not null,
  actions integer not null
);
alter table archive_private.friendships enable row level security;
alter table archive_private.friend_messages enable row level security;
alter table archive_private.friend_action_limits enable row level security;
revoke all on archive_private.friendships,archive_private.friend_messages,archive_private.friend_action_limits from public,anon,authenticated;
grant all on archive_private.friendships,archive_private.friend_messages,archive_private.friend_action_limits to service_role;

create function archive_private.friend_directory(p_query text,p_view text,p_offset integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
  if actor is null or not exists(select 1 from public.archive_members where user_id=actor) then
    raise exception 'Sign in with an invited archive account.' using errcode='42501';
  end if;
  if p_query is null or char_length(p_query)>80 or p_view not in ('all','friends','requests','blocked') or p_view is null
    or p_offset is null or p_offset<0 or p_offset>50000 then raise exception 'Choose a valid member search.'; end if;
  select coalesce(jsonb_agg(to_jsonb(entries)),'[]') into result from (
    select m.user_id,m.display_name,coalesce(f.revision,0) revision,
      case when actor=any(f.blocked_by) then 'blocked'
        when f.status='accepted' then 'friends'
        when f.status='pending' and f.requested_by=actor then 'outgoing'
        when f.status='pending' then 'incoming' else 'none' end relationship
    from public.archive_members m left join archive_private.friendships f
      on f.user_low=least(actor,m.user_id) and f.user_high=greatest(actor,m.user_id)
    where m.user_id<>actor and strpos(lower(m.display_name),lower(btrim(p_query)))>0
      and (not coalesce(m.user_id=any(f.blocked_by),false) or coalesce(actor=any(f.blocked_by),false))
      and case p_view
        when 'blocked' then coalesce(actor=any(f.blocked_by),false)
        when 'friends' then f.status='accepted' and cardinality(f.blocked_by)=0
        when 'requests' then f.status='pending' and cardinality(f.blocked_by)=0
        else not coalesce(actor=any(f.blocked_by),false) end
    order by lower(m.display_name),m.user_id limit 51 offset p_offset
  ) entries;
  return jsonb_build_object('members',result);
end;
$$;

create function archive_private.change_friendship(p_peer uuid,p_action text,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); low_id uuid:=least(actor,p_peer); high_id uuid:=greatest(actor,p_peer);
  f archive_private.friendships%rowtype; stamp timestamptz:=clock_timestamp(); used integer;
begin
  if actor is null or not exists(select 1 from public.archive_members where user_id=actor)
    or p_peer is null or p_peer=actor or not exists(select 1 from public.archive_members where user_id=p_peer) then
    raise exception 'This archive account is not available.' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('request','accept','decline','cancel','remove','block','unblock') then
    raise exception 'Choose a valid friend action.';
  end if;
  -- Both sends and relationship changes take actor then pair locks.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,779));
  perform pg_advisory_xact_lock(hashtextextended(low_id::text||high_id::text,780));
  insert into archive_private.friendships(user_low,user_high) values(low_id,high_id) on conflict do nothing;
  select * into f from archive_private.friendships where user_low=low_id and user_high=high_id for update;
  if p_revision is null or f.revision<>p_revision then raise exception 'This friendship changed. Refresh and try again.'; end if;
  if p_action not in ('block','unblock') and cardinality(f.blocked_by)>0 then
    raise exception 'This archive account is not available.' using errcode='42501';
  end if;
  if p_action='request' and f.status='none' then f.status:='pending'; f.requested_by:=actor;
  elsif p_action='accept' and f.status='pending' and f.requested_by=p_peer then f.status:='accepted';
  elsif p_action='decline' and f.status='pending' and f.requested_by=p_peer then f.status:='none';
  elsif p_action='cancel' and f.status='pending' and f.requested_by=actor then f.status:='none';
  elsif p_action='remove' and f.status='accepted' then f.status:='none';
  elsif p_action='block' then f.status:='none'; f.blocked_by:=array(select distinct x from unnest(f.blocked_by||actor) x);
  elsif p_action='unblock' and actor=any(f.blocked_by) then f.blocked_by:=array_remove(f.blocked_by,actor);
  else raise exception 'This friendship changed. Refresh and try again.'; end if;
  insert into archive_private.friend_action_limits(user_id,window_start,actions) values(actor,stamp,1)
    on conflict(user_id) do update set
      actions=case when friend_action_limits.window_start>stamp-interval '1 minute' then friend_action_limits.actions+1 else 1 end,
      window_start=case when friend_action_limits.window_start>stamp-interval '1 minute' then friend_action_limits.window_start else stamp end
    returning actions into used;
  if used>30 then raise exception 'Give it a minute before changing more friendships.'; end if;
  update archive_private.friendships set status=f.status,requested_by=f.requested_by,blocked_by=f.blocked_by,revision=revision+1
    where user_low=low_id and user_high=high_id;
end;
$$;

create function archive_private.friend_conversation(p_peer uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); f archive_private.friendships%rowtype; result jsonb;
begin
  if actor is null or not exists(select 1 from public.archive_members where user_id=actor)
    or not exists(select 1 from public.archive_members where user_id=p_peer) then
    raise exception 'Sign in with an invited archive account.' using errcode='42501';
  end if;
  select * into f from archive_private.friendships where user_low=least(actor,p_peer) and user_high=greatest(actor,p_peer);
  if not found or f.status<>'accepted' or cardinality(f.blocked_by)>0 then
    raise exception 'You must be friends to open this conversation.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(messages) order by created_at,id),'[]') into result from (
    select m.id,m.sender_id,m.body,m.room_id,m.is_invite,m.track_id,m.is_song,m.created_at,
      case when m.is_invite then exists(select 1 from public.listening_rooms r where r.id=m.room_id and r.ended_at is null and r.expires_at>clock_timestamp()) else false end room_active
    from archive_private.friend_messages m where m.user_low=f.user_low and m.user_high=f.user_high
      and m.created_at>clock_timestamp()-interval '90 days'
    order by m.created_at desc,m.id desc limit 100
  ) messages;
  return jsonb_build_object('messages',result,'revision',f.revision);
end;
$$;

create function archive_private.send_friend_message(p_peer uuid,p_id uuid,p_body text,p_room uuid,p_track text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); low_id uuid:=least(actor,p_peer); high_id uuid:=greatest(actor,p_peer);
  f archive_private.friendships%rowtype; message archive_private.friend_messages%rowtype;
  cleaned text:=btrim(p_body); stamp timestamptz;
begin
  if actor is null or not exists(select 1 from public.archive_members where user_id=actor)
    or p_peer is null or p_peer=actor or not exists(select 1 from public.archive_members where user_id=p_peer) then
    raise exception 'Sign in with an invited archive account.' using errcode='42501';
  end if;
  if p_id is null or cleaned is null or char_length(cleaned)>1000 or (cleaned='' and p_room is null and p_track is null) or (p_room is not null and p_track is not null) then
    raise exception 'Write a message between 1 and 1,000 characters.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,779));
  perform pg_advisory_xact_lock(hashtextextended(low_id::text||high_id::text,780));
  select * into f from archive_private.friendships where user_low=low_id and user_high=high_id for update;
  if not found or f.status<>'accepted' or cardinality(f.blocked_by)>0 then
    raise exception 'You must be friends to send a message.' using errcode='42501';
  end if;
  select * into message from archive_private.friend_messages where id=p_id;
  if found then
    if message.user_low=low_id and message.user_high=high_id and message.sender_id=actor and message.body=cleaned
      and message.room_id is not distinct from p_room and message.track_id is not distinct from p_track then
      return jsonb_build_object('sent',true);
    end if;
    raise exception 'Please try sending a new message.';
  end if;
  if p_track is not null and not exists(select 1 from public.tracks where id=p_track and available) then
    raise exception 'Choose an available archive song.';
  end if;
  if p_room is not null then
    perform 1 from public.listening_rooms where id=p_room and ended_at is null and expires_at>clock_timestamp() for share;
    if not found or not archive_private.in_listening_room(p_room) then
      raise exception 'Join an active room before inviting a friend.' using errcode='42501';
    end if;
  end if;
  stamp:=clock_timestamp();
  if exists(select 1 from archive_private.friend_messages where sender_id=actor and created_at>stamp-interval '1 second')
    or (select count(*) from archive_private.friend_messages where sender_id=actor and created_at>stamp-interval '1 minute')>=30 then
    raise exception 'Give it a second before sending another message.';
  end if;
  insert into archive_private.friend_messages(id,user_low,user_high,sender_id,body,room_id,is_invite,track_id,is_song,created_at)
    values(p_id,low_id,high_id,actor,cleaned,p_room,p_room is not null,p_track,p_track is not null,stamp);
  delete from archive_private.friend_messages where user_low=low_id and user_high=high_id and id in (
    select id from archive_private.friend_messages where user_low=low_id and user_high=high_id order by created_at desc,id desc offset 500
  );
  delete from archive_private.friend_messages where user_low=low_id and user_high=high_id and created_at<stamp-interval '90 days';
  return jsonb_build_object('sent',true);
end;
$$;

create function public.friend_directory(p_query text default '',p_view text default 'all',p_offset integer default 0) returns jsonb
language sql security invoker set search_path='' as $$ select archive_private.friend_directory(p_query,p_view,p_offset); $$;
create function public.change_friendship(p_peer uuid,p_action text,p_revision bigint) returns void
language sql security invoker set search_path='' as $$ select archive_private.change_friendship(p_peer,p_action,p_revision); $$;
create function public.friend_conversation(p_peer uuid) returns jsonb
language sql security invoker set search_path='' as $$ select archive_private.friend_conversation(p_peer); $$;
create function public.send_friend_message(p_peer uuid,p_id uuid,p_body text,p_room uuid default null,p_track text default null) returns jsonb
language sql security invoker set search_path='' as $$ select archive_private.send_friend_message(p_peer,p_id,p_body,p_room,p_track); $$;
revoke all on function archive_private.friend_directory(text,text,integer),archive_private.change_friendship(uuid,text,bigint),
  archive_private.friend_conversation(uuid),archive_private.send_friend_message(uuid,uuid,text,uuid,text),
  public.friend_directory(text,text,integer),public.change_friendship(uuid,text,bigint),
  public.friend_conversation(uuid),public.send_friend_message(uuid,uuid,text,uuid,text) from public,anon;
grant execute on function archive_private.friend_directory(text,text,integer),archive_private.change_friendship(uuid,text,bigint),
  archive_private.friend_conversation(uuid),archive_private.send_friend_message(uuid,uuid,text,uuid,text),
  public.friend_directory(text,text,integer),public.change_friendship(uuid,text,bigint),
  public.friend_conversation(uuid),public.send_friend_message(uuid,uuid,text,uuid,text) to authenticated;
