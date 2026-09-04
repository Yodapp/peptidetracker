-- Peptime: run in the Supabase SQL editor for a new project.
create extension if not exists pgcrypto;

create type public.dose_status as enum ('taken', 'skipped');
create type public.dose_slot as enum ('morning', 'lunch', 'evening', 'as_needed');
create type public.peptide_route as enum ('subcutaneous', 'intranasal', 'oral', 'topical');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'sv' check (language in ('sv','en')),
  timezone text not null default 'Europe/Stockholm',
  theme text not null default 'dark' check (theme in ('dark','light')),
  syringe_type text not null default 'U-100 1 ml',
  mass_display_unit text not null default 'mcg' check (mass_display_unit in ('mcg','mg')),
  day_boundary_hour smallint not null default 4 check (day_boundary_hour between 0 and 8),
  reminders_enabled boolean not null default false,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.peptides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 100),
  short_code text not null default '',
  color text not null default 'teal',
  dose_amount numeric(12,4) not null check (dose_amount >= 0),
  dose_unit text not null default 'mcg' check (dose_unit in ('mcg','mg')),
  vial_mg numeric(12,4) check (vial_mg > 0),
  bac_water_ml numeric(12,4) check (bac_water_ml > 0),
  route public.peptide_route not null default 'subcutaneous',
  fasted boolean not null default false,
  fasted_note text not null default '',
  mix_group_id text,
  cycle_start date,
  weeks_on integer check (weeks_on > 0),
  weeks_off integer check (weeks_off >= 0),
  default_sites text[] not null default array[]::text[],
  last_site text,
  notes text not null default '',
  archived_at timestamptz,
  is_example boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  peptide_id uuid not null references public.peptides(id) on delete cascade,
  initial_mg numeric(12,4) not null check (initial_mg > 0),
  bac_water_ml numeric(12,4) not null check (bac_water_ml > 0),
  reconstituted_at timestamptz,
  beyond_use_days integer not null default 28 check (beyond_use_days >= 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  peptide_id uuid not null references public.peptides(id) on delete cascade,
  slot public.dose_slot not null,
  clock_time time,
  frequency text not null default 'daily' check (frequency in ('daily','selected_weekdays','every_n_days','as_needed')),
  weekdays smallint[] not null default array[]::smallint[],
  every_n_days integer check (every_n_days >= 2),
  times_per_week integer check (times_per_week between 1 and 7),
  starts_on date not null default current_date,
  paused boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mix_groups (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 100),
  name_key text not null,
  slot public.dose_slot not null,
  clock_time time,
  frequency text not null default 'daily' check (frequency in ('daily','selected_weekdays','every_n_days','as_needed')),
  weekdays smallint[] not null default array[]::smallint[],
  every_n_days integer check (every_n_days >= 2),
  anchor_date date,
  paused boolean not null default false,
  cycle_start date,
  weeks_on integer check (weeks_on > 0),
  weeks_off integer check (weeks_off >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, name_key)
);

create table public.dose_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  peptide_id uuid not null references public.peptides(id) on delete restrict,
  planned_dose numeric(12,4) not null check (planned_dose >= 0),
  actual_dose numeric(12,4) not null check (actual_dose >= 0),
  unit text not null check (unit in ('mcg','mg')),
  computed_iu numeric(12,4) check (computed_iu >= 0),
  slot public.dose_slot not null,
  taken_at timestamptz not null default now(),
  scheduled_date date not null,
  status public.dose_status not null,
  site text,
  mix_group_id text,
  vial_id uuid references public.vials(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  note_date date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, note_date)
);

create index dose_logs_user_taken_idx on public.dose_logs(user_id, taken_at desc);
create index schedules_user_active_idx on public.schedules(user_id, active);
create index peptides_user_active_idx on public.peptides(user_id, archived_at);

create function public.touch_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger peptides_touch before update on public.peptides for each row execute function public.touch_updated_at();
create trigger schedules_touch before update on public.schedules for each row execute function public.touch_updated_at();
create trigger mix_groups_touch before update on public.mix_groups for each row execute function public.touch_updated_at();
create trigger dose_logs_touch before update on public.dose_logs for each row execute function public.touch_updated_at();
create trigger daily_notes_touch before update on public.daily_notes for each row execute function public.touch_updated_at();

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values (new.id) on conflict do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.peptides enable row level security;
alter table public.vials enable row level security;
alter table public.schedules enable row level security;
alter table public.mix_groups enable row level security;
alter table public.dose_logs enable row level security;
alter table public.daily_notes enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own peptides" on public.peptides for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own vials" on public.vials for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own schedules" on public.schedules for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own mix groups" on public.mix_groups for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own logs" on public.dose_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own daily notes" on public.daily_notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.peptides, public.vials, public.schedules, public.mix_groups, public.dose_logs, public.daily_notes to authenticated;
