-- Restore the fields required by the current daily check-in UI.
-- The earlier migrations were not applied to every deployed database.
alter table public.daily_notes
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists sleep_quality smallint check (sleep_quality between 1 and 5),
  add column if not exists brain_fatigue smallint check (brain_fatigue between 1 and 5),
  add column if not exists physical_fatigue smallint check (physical_fatigue between 1 and 5),
  add column if not exists pain_level smallint check (pain_level between 1 and 5),
  add column if not exists activity_level smallint check (activity_level between 1 and 5);

alter table public.profiles
  add column if not exists custom_daily_tags text[] not null default '{}'::text[];

notify pgrst, 'reload schema';
