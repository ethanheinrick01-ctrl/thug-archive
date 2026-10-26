-- Explicit playback intent and atomic automatic-advance guards.
create or replace function archive_private.listening_room(p_action text,p_room uuid,p_params jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid := auth.uid();
 actor_name text;
 r public.listening_rooms%rowtype;
 ids text[];
 n integer;
 ix integer;
 seconds double precision;
 duration double precision;
 stamp timestamptz := clock_timestamp();
begin
 select display_name into actor_name from public.archive_members where user_id=actor;
 if actor is null or actor_name is null then
   raise exception 'Sign in with an invited archive account.' using errcode='42501';
 end if;
 if p_action='get' then return archive_private.listening_snapshot(p_room); end if;
 if p_action in ('create','playQueue') then
   select coalesce(array_agg(value order by ordinality),'{}') into ids
   from jsonb_array_elements_text(coalesce(p_params->'queue','[]'::jsonb)) with ordinality;
   if cardinality(ids)>500 or exists(select 1 from unnest(ids) t(id) where t.id is null or not exists(select 1 from public.tracks where tracks.id=t.id and available)) then
     raise exception 'Choose up to 500 available archive songs.';
   end if;
 end if;
 if p_action='create' then
   perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
   if (select count(*) from public.listening_rooms where host_id=actor and ended_at is null and expires_at>stamp)>=3 then
     raise exception 'You already have three active rooms. End a room before starting another.';
   end if;
   n:=cardinality(ids);
   ix:=least(greatest(coalesce((p_params->>'index')::integer,0),0),greatest(n-1,0));
   select coalesce(tracks.duration,86400) into duration from public.tracks where id=ids[ix+1];
   seconds:=least(greatest(coalesce((p_params->>'position')::double precision,0),0),coalesce(duration,0));
   insert into public.listening_rooms(host_id,queue,queue_index,position,playing,shuffle,repeat_mode)
   values(actor,ids,ix,seconds,n>0 and coalesce((p_params->>'playing')::boolean,false),coalesce((p_params->>'shuffle')::boolean,false),coalesce(p_params->>'repeat_mode','off')) returning * into r;
   insert into public.listening_room_members(room_id,user_id,display_name) values(r.id,actor,actor_name);
   return archive_private.listening_snapshot(r.id);
 end if;
 -- Every mutation locks the same room row, so simultaneous queue additions cannot overwrite each other.
 select * into r from public.listening_rooms where id=p_room for update;
 stamp:=clock_timestamp();
 if not found or r.ended_at is not null or r.expires_at<=stamp then
   raise exception 'This room has ended or expired. Ask your friend for a new room link.';
 end if;
 if p_action='join' then
   if (select count(*) from public.listening_room_members where room_id=r.id and active)>=10
      and not archive_private.in_listening_room(r.id) then raise exception 'This room already has 10 people.'; end if;
   insert into public.listening_room_members(room_id,user_id,display_name) values(r.id,actor,actor_name)
   on conflict(room_id,user_id) do update set active=true,display_name=excluded.display_name;
   return archive_private.listening_snapshot(r.id);
 end if;
 if not archive_private.in_listening_room(r.id) then
   raise exception 'Join this listening room first.' using errcode='42501';
 end if;
 if p_action='leave' and r.host_id<>actor then
   update public.listening_room_members set active=false where room_id=r.id and user_id=actor;
   return jsonb_build_object('left',true);
 end if;
 n:=cardinality(r.queue);
 select coalesce(tracks.duration,86400) into duration from public.tracks where id=r.queue[r.queue_index+1];
 duration:=coalesce(duration,0);
 seconds:=least(duration,greatest(0,r.position+case when r.playing then extract(epoch from stamp-r.anchor_at) else 0 end));
 if p_action='add' then
   if n>=500 then raise exception 'The shared queue is full. Remove a song before adding another.'; end if;
   if not exists(select 1 from public.tracks where id=p_params->>'id' and available) then raise exception 'Choose an available archive song.'; end if;
   if r.host_id=actor and coalesce((p_params->>'next')::boolean,false) and n>0 then
     r.queue:=r.queue[1:r.queue_index+1] || array[p_params->>'id'] || coalesce(r.queue[r.queue_index+2:n],'{}');
   else r.queue:=array_append(r.queue,p_params->>'id'); end if;
 else
   if r.host_id<>actor then raise exception 'The host controls playback. You can add songs to the shared queue.' using errcode='42501'; end if;
   case p_action
   when 'leave' then r.ended_at:=stamp; r.playing:=false; r.position:=seconds;
   when 'playQueue' then
     r.queue:=ids;
     r.queue_index:=least(greatest(coalesce((p_params->>'index')::integer,0),0),greatest(cardinality(ids)-1,0));
     r.position:=0; r.playing:=cardinality(ids)>0; r.shuffle:=coalesce((p_params->>'shuffle')::boolean,false);
   when 'toggle' then
     r.playing:=n>0 and not r.playing;
     r.position:=case when r.playing and duration>0 and seconds>=duration then 0 else seconds end;
   when 'play' then
     r.position:=case when duration>0 and seconds>=duration then 0 else seconds end;
     r.playing:=n>0;
   when 'pause' then r.position:=seconds; r.playing:=false;
   when 'seek' then
     r.position:=(p_params->>'position')::double precision;
     if r.position is null or r.position<0 or r.position>duration then raise exception 'Choose a position within this song.'; end if;
   when 'jump' then
     ix:=(p_params->>'index')::integer;
     if ix is null or ix<0 or ix>=n then raise exception 'That song is no longer in the shared queue.'; end if;
     r.queue_index:=ix; r.position:=0; r.playing:=true;
   when 'next' then
     if coalesce((p_params->>'ended')::boolean,false) and
        (not r.playing or nullif(p_params->>'expected_anchor','')::timestamptz is distinct from r.anchor_at) then
       return archive_private.listening_snapshot(r.id);
     end if;
     if coalesce((p_params->>'ended')::boolean,false) and r.repeat_mode='one' then r.position:=0; r.playing:=n>0;
     elsif r.queue_index+1<n then r.queue_index:=r.queue_index+1; r.position:=0; r.playing:=true;
     elsif r.repeat_mode='all' and n>0 then r.queue_index:=0; r.position:=0; r.playing:=true;
     else r.position:=duration; r.playing:=false; end if;
   when 'previous' then
     if seconds>3 then r.position:=0;
     else r.queue_index:=greatest(r.queue_index-1,0); r.position:=0; r.playing:=n>0; end if;
   when 'remove' then
     ix:=(p_params->>'index')::integer;
     if ix is null or ix<=r.queue_index or ix>=n then raise exception 'Only upcoming songs can be removed.'; end if;
     r.queue:=coalesce(r.queue[1:ix],'{}') || coalesce(r.queue[ix+2:n],'{}');
     r.position:=seconds;
   when 'shuffle' then
     if not r.shuffle then
       select array_agg(id order by random()) into ids from unnest(r.queue) with ordinality t(id,ord) where ord>r.queue_index+1;
       r.queue:=coalesce(r.queue[1:r.queue_index+1],'{}') || coalesce(ids,'{}');
     end if;
     r.shuffle:=not r.shuffle; r.position:=seconds;
   when 'repeat' then r.repeat_mode:=case r.repeat_mode when 'off' then 'all' when 'all' then 'one' else 'off' end; r.position:=seconds;
   else raise exception 'Unknown room action.';
   end case;
   r.anchor_at:=stamp;
 end if;
 update public.listening_rooms set queue=r.queue,queue_index=r.queue_index,position=r.position,playing=r.playing,shuffle=r.shuffle,repeat_mode=r.repeat_mode,anchor_at=r.anchor_at,ended_at=r.ended_at,revision=revision+1 where id=r.id;
 return archive_private.listening_snapshot(r.id);
end;
$$;
