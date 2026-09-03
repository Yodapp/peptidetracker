-- Peptime: choose whether the per-IU mass comparison is shown in mcg or mg.
alter table public.profiles
  add column if not exists mass_display_unit text not null default 'mcg'
  check (mass_display_unit in ('mcg', 'mg'));
