alter table public.daily_notes
  add column if not exists tags text[] not null default '{}'::text[];
