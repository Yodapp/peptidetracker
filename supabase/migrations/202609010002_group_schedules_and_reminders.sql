-- Peptime: group-owned schedules and reminder preference.
alter table public.profiles
  add column if not exists reminders_enabled boolean not null default false;

alter table public.schedules
  add column if not exists paused boolean not null default false;

update public.schedules set every_n_days = 2 where every_n_days = 1;
update public.schedules set frequency = 'selected_weekdays' where frequency = 'times_per_week';
alter table public.schedules drop constraint if exists schedules_every_n_days_check;
alter table public.schedules
  add constraint schedules_every_n_days_check check (every_n_days >= 2);

alter table public.schedules drop constraint if exists schedules_frequency_check;
alter table public.schedules
  add constraint schedules_frequency_check
  check (frequency in ('daily','selected_weekdays','every_n_days','as_needed'));

create table if not exists public.mix_groups (
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

alter table public.mix_groups enable row level security;
drop policy if exists "own mix groups" on public.mix_groups;
create policy "own mix groups" on public.mix_groups for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists mix_groups_touch on public.mix_groups;
create trigger mix_groups_touch before update on public.mix_groups
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.mix_groups to authenticated;

insert into public.mix_groups (
  user_id, name, name_key, slot, clock_time, frequency, weekdays,
  every_n_days, anchor_date, paused, cycle_start, weeks_on, weeks_off
)
select distinct on (p.user_id, lower(trim(p.mix_group_id)))
  p.user_id, trim(p.mix_group_id), lower(trim(p.mix_group_id)), s.slot,
  s.clock_time, s.frequency, s.weekdays, s.every_n_days, s.starts_on,
  coalesce(s.paused, false), p.cycle_start, p.weeks_on, p.weeks_off
from public.peptides p
join public.schedules s on s.peptide_id = p.id
where nullif(trim(p.mix_group_id), '') is not null
order by p.user_id, lower(trim(p.mix_group_id)), p.created_at
on conflict (user_id, name_key) do nothing;

delete from public.schedules s
using public.peptides p
where s.peptide_id = p.id
  and nullif(trim(p.mix_group_id), '') is not null;
