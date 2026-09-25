create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Values live in Supabase Vault, never in the migration or client bundle.
-- Required names: peptime_reminder_dispatch_url and peptime_reminder_dispatch_secret.
create or replace function public.dispatch_due_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare
  dispatch_url text;
  dispatch_secret text;
begin
  select decrypted_secret into dispatch_url
  from vault.decrypted_secrets where name = 'peptime_reminder_dispatch_url' limit 1;
  select decrypted_secret into dispatch_secret
  from vault.decrypted_secrets where name = 'peptime_reminder_dispatch_secret' limit 1;
  if dispatch_url is null or dispatch_secret is null then return; end if;
  perform net.http_post(
    url := dispatch_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || dispatch_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.dispatch_due_reminders() from public, anon, authenticated;

select cron.schedule('peptime-reminders', '* * * * *', 'select public.dispatch_due_reminders();');
