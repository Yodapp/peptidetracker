-- Keep vial size immutable when inventory changes, and persist named purchase plans.
alter table public.vials
  add column if not exists remaining_mg numeric(12,4)
  check (remaining_mg >= 0);

update public.vials vial
set remaining_mg = greatest(
  0,
  vial.initial_mg - coalesce((
    select sum(
      case when dose.unit = 'mg' then dose.actual_dose else dose.actual_dose / 1000 end
    )
    from public.dose_logs dose
    where dose.vial_id = vial.id
      and dose.status = 'taken'
  ), 0)
)
where vial.remaining_mg is null;

create table if not exists public.purchase_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_plans_user_updated_idx
  on public.purchase_plans(user_id, updated_at desc);

drop trigger if exists purchase_plans_touch on public.purchase_plans;
create trigger purchase_plans_touch before update on public.purchase_plans
  for each row execute function public.touch_updated_at();

alter table public.purchase_plans enable row level security;
drop policy if exists "own purchase plans" on public.purchase_plans;
create policy "own purchase plans" on public.purchase_plans for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.purchase_plans to authenticated;
