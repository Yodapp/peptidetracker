create table public.shared_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  code text not null unique check (code ~ '^P[A-Z2-9]{5}$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  groups jsonb not null default '[]'::jsonb check (jsonb_typeof(groups) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shared_schedules_user_updated_idx on public.shared_schedules(user_id, updated_at desc);
create trigger shared_schedules_touch before update on public.shared_schedules
  for each row execute function public.touch_updated_at();

alter table public.shared_schedules enable row level security;
create policy "own shared schedules" on public.shared_schedules for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.shared_schedules to authenticated;

create function public.get_shared_schedule(p_code text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('name', name, 'items', items, 'groups', groups)
  from public.shared_schedules
  where auth.uid() is not null and code = upper(btrim(p_code));
$$;
revoke execute on function public.get_shared_schedule(text) from public, anon;
grant execute on function public.get_shared_schedule(text) to authenticated;
