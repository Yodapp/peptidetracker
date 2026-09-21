alter table public.daily_notes
  add column if not exists pain_level smallint check (pain_level between 1 and 5);
