import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { planReminders, type ReminderInput, type ReminderPreferences } from "@/lib/reminder-plan";
import { pushConfigured, sendPush, type StoredSubscription } from "@/lib/push-server";
import { addDays, stockholmDate } from "@/lib/log-day";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(header: string | null) {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  if (!pushConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: "Reminders are not configured" }, { status: 503 });
  }
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const now = new Date();
  const today = stockholmDate(now);
  const from = addDays(today, -1);
  const through = addDays(today, 1);
  const preferences = await client.from("reminder_preferences").select("*").eq("enabled", true).limit(500);
  if (preferences.error) return Response.json({ error: "Could not load reminder preferences" }, { status: 500 });
  let sent = 0;
  let failed = 0;

  for (const preference of preferences.data ?? []) {
    const userId = preference.user_id as string;
    const [subscriptions, peptides, schedules, groups, logs, notes] = await Promise.all([
      client.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("user_id", userId),
      client.from("peptides").select("id,mix_group_id,archived_at,cycle_start,weeks_on,weeks_off").eq("user_id", userId).is("archived_at", null),
      client.from("schedules").select("peptide_id,slot,clock_time,frequency,weekdays,every_n_days,starts_on,paused,active").eq("user_id", userId).eq("active", true),
      client.from("mix_groups").select("name_key,slot,clock_time,frequency,weekdays,every_n_days,anchor_date,paused,active,cycle_start,weeks_on,weeks_off").eq("user_id", userId).eq("active", true),
      client.from("dose_logs").select("peptide_id,scheduled_date,status").eq("user_id", userId).gte("scheduled_date", from).lte("scheduled_date", through),
      client.from("daily_notes").select("note_date,note,tags,sleep_quality,brain_fatigue,physical_fatigue,pain_level,activity_level").eq("user_id", userId).gte("note_date", from).lte("note_date", through),
    ]);
    if ([subscriptions, peptides, schedules, groups, logs, notes].some(result => result.error)) { failed += 1; continue; }
    const devices = (subscriptions.data ?? []) as StoredSubscription[];
    if (!devices.length) continue;
    const input: ReminderInput = {
      preferences: preference as ReminderPreferences,
      peptides: (peptides.data ?? []) as ReminderInput["peptides"],
      schedules: (schedules.data ?? []) as ReminderInput["schedules"],
      groups: (groups.data ?? []) as ReminderInput["groups"],
      logs: (logs.data ?? []) as ReminderInput["logs"],
      notes: (notes.data ?? []) as ReminderInput["notes"],
    };
    for (const event of planReminders(input, now)) {
      for (const device of devices) {
        const claim = await client.rpc("claim_reminder_delivery", { p_user_id: userId, p_subscription_id: device.id, p_event_key: event.key });
        if (claim.error) { failed += 1; continue; }
        if (!claim.data) continue;
        try {
          await sendPush(device, event);
          sent += 1;
        } catch (cause) {
          const status = (cause as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await client.from("push_subscriptions").delete().eq("id", device.id);
          else await client.from("reminder_deliveries").delete().eq("subscription_id", device.id).eq("event_key", event.key);
          failed += 1;
        }
      }
    }
  }
  const health = await client.from("reminder_dispatch_health").upsert({ id: 1, last_run_at: now.toISOString() }, { onConflict: "id" });
  if (health.error) return Response.json({ error: "Could not record dispatcher heartbeat", sent, failed }, { status: 500 });
  return Response.json({ sent, failed });
}
