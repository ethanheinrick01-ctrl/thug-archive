-- Dedicated personal project only. No changes to the business project.
create table public.archive_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80)
);
create table public.tracks (
  id text primary key check (id ~ '^t[0-9]{3}$'),
  title text not null check (char_length(title) between 1 and 300),
  artist text, features text[] not null default '{}', version text,
  group_key text not null, tags text[] not null default '{}', aliases text[] not null default '{}',
  duration double precision check (duration > 0), artwork text, audio_key text,
  available boolean not null default false, archive_order integer not null,
  check (audio_key is null or audio_key = id || '.mp3'),
  check (not available or audio_key is not null)
);
create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  track_ids text[] not null default '{}' check (cardinality(track_ids) <= 1000),
  shared boolean not null default false,
  updated_at timestamptz not null default now()
);
create index playlists_owner_idx on public.playlists(owner_id);
create table public.likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null references public.tracks(id) on delete cascade,
  primary key (user_id, track_id)
);
create index likes_track_idx on public.likes(track_id);
create table public.listening_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null references public.tracks(id) on delete cascade,
  last_played timestamptz not null default now(), play_count integer not null default 1 check(play_count > 0),
  primary key(user_id, track_id)
);
create index history_track_idx on public.listening_history(track_id);

alter table public.archive_members enable row level security;
alter table public.tracks enable row level security;
alter table public.playlists enable row level security;
alter table public.likes enable row level security;
alter table public.listening_history enable row level security;

-- Membership is administered on the server, never by a browser/user-editable claim.
create policy members_self on public.archive_members for select to authenticated using(user_id=(select auth.uid()));
create policy tracks_members on public.tracks for select to authenticated using(exists(select 1 from public.archive_members where user_id=(select auth.uid())));
create policy playlists_read on public.playlists for select to authenticated using(
  exists(select 1 from public.archive_members where user_id=(select auth.uid())) and (owner_id=(select auth.uid()) or shared)
);
create policy playlists_insert on public.playlists for insert to authenticated with check(
  owner_id=(select auth.uid()) and exists(select 1 from public.archive_members where user_id=(select auth.uid()))
);
create policy playlists_update on public.playlists for update to authenticated using(
  owner_id=(select auth.uid()) and exists(select 1 from public.archive_members where user_id=(select auth.uid()))
) with check(owner_id=(select auth.uid()) and exists(select 1 from public.archive_members where user_id=(select auth.uid())));
create policy playlists_delete on public.playlists for delete to authenticated using(
  owner_id=(select auth.uid()) and exists(select 1 from public.archive_members where user_id=(select auth.uid()))
);
create policy likes_own on public.likes for all to authenticated using(
  user_id=(select auth.uid()) and exists(select 1 from public.archive_members where user_id=(select auth.uid()))
) with check(user_id=(select auth.uid()) and exists(select 1 from public.archive_members where user_id=(select auth.uid())));
create policy history_own on public.listening_history for all to authenticated using(
  user_id=(select auth.uid()) and exists(select 1 from public.archive_members where user_id=(select auth.uid()))
) with check(user_id=(select auth.uid()) and exists(select 1 from public.archive_members where user_id=(select auth.uid())));

revoke all on public.archive_members,public.tracks,public.playlists,public.likes,public.listening_history from anon,authenticated;
grant select on public.archive_members,public.tracks to authenticated;
grant select,insert,update,delete on public.playlists,public.likes,public.listening_history to authenticated;
grant all on public.archive_members,public.tracks,public.playlists,public.likes,public.listening_history to service_role;

-- An invoker function applies ownership policies; it never bypasses RLS.
create function public.record_play(target_track text) returns void language sql security invoker set search_path='' as $$
  insert into public.listening_history(user_id,track_id,last_played,play_count)
  values((select auth.uid()),target_track,now(),1)
  on conflict(user_id,track_id) do update set last_played=now(),play_count=public.listening_history.play_count+1;
$$;
revoke all on function public.record_play(text) from public,anon;
grant execute on function public.record_play(text) to authenticated;

create function public.validate_playlist() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from unnest(new.track_ids) t(id) where t.id is null or not exists(select 1 from public.tracks where tracks.id=t.id)) then
    raise exception 'Playlist contains a track outside the archive';
  end if;
  if cardinality(new.track_ids) <> (select count(distinct id) from unnest(new.track_ids) t(id)) then
    raise exception 'A song can only appear once in a playlist';
  end if;
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function public.validate_playlist() from public,anon;
create trigger playlist_tracks before insert or update on public.playlists for each row execute function public.validate_playlist();
