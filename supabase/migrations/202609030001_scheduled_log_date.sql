-- Peptime: retain the real taken time while assigning a dose to its scheduled day.
alter table public.dose_logs
  add column if not exists scheduled_date date;

update public.dose_logs dose
set scheduled_date = (
  (dose.taken_at at time zone coalesce(profile.timezone, 'Europe/Stockholm'))
  - make_interval(hours => coalesce(profile.day_boundary_hour, 4))
)::date
from public.profiles profile
where dose.user_id = profile.id
  and dose.scheduled_date is null;

update public.dose_logs
set scheduled_date = ((taken_at at time zone 'Europe/Stockholm') - interval '4 hours')::date
where scheduled_date is null;

alter table public.dose_logs
  alter column scheduled_date set not null;

create index if not exists dose_logs_user_scheduled_idx
  on public.dose_logs(user_id, scheduled_date desc, taken_at desc);
