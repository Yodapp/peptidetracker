-- Run once in Supabase SQL Editor for existing Peptime projects.
alter table public.profiles
  add column if not exists day_boundary_hour smallint not null default 4
  check (day_boundary_hour between 0 and 8);

alter table public.profiles
  add column if not exists onboarding_complete boolean not null default false;

alter table public.peptides
  alter column mix_group_id type text using mix_group_id::text;

alter table public.dose_logs
  alter column mix_group_id type text using mix_group_id::text;

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.profiles, public.peptides, public.vials, public.schedules, public.dose_logs, public.daily_notes
  to authenticated;
