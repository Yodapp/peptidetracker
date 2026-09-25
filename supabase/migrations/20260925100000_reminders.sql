create table if not exists public.reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  lead_minutes smallint not null default 0 check (lead_minutes in (0, 10, 15)),
  follow_up_enabled boolean not null default true,
  daily_summary_enabled boolean not null default false,
  daily_summary_time time not null default '20:30',
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  event_key text not null,
  sent_at timestamptz not null default now(),
  unique (subscription_id, event_key)
);
create index if not exists reminder_deliveries_sent_at_idx on public.reminder_deliveries(sent_at);

create table if not exists public.reminder_dispatch_health (
  id integer primary key check (id = 1),
  last_run_at timestamptz not null
);

alter table public.reminder_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_deliveries enable row level security;
alter table public.reminder_dispatch_health enable row level security;

create policy "own reminder preferences" on public.reminder_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.reminder_preferences, public.push_subscriptions to authenticated;

-- Called only with the service-role key by the protected dispatcher.
create or replace function public.claim_reminder_delivery(p_user_id uuid, p_subscription_id uuid, p_event_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reminder_deliveries (user_id, subscription_id, event_key)
  values (p_user_id, p_subscription_id, p_event_key)
  on conflict (subscription_id, event_key) do nothing;
  return found;
end;
$$;
revoke all on function public.claim_reminder_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_reminder_delivery(uuid, uuid, text) to service_role;
