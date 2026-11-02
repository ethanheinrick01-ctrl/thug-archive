alter table public.likes add column liked_at timestamptz;
alter table public.likes alter column liked_at set default now();
