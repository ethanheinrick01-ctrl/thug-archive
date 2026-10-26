create table public.track_lyrics (
 track_id text primary key references public.tracks(id) on delete cascade,
 lines jsonb not null check (jsonb_typeof(lines)='array'),
 updated_at timestamptz not null default now()
);
alter table public.track_lyrics enable row level security;
revoke all on public.track_lyrics from public, anon, authenticated;
grant select on public.track_lyrics to authenticated;
grant all on public.track_lyrics to service_role;
create policy lyrics_archive_read on public.track_lyrics for select to authenticated
 using (exists (select 1 from public.archive_members where user_id=(select auth.uid())));
