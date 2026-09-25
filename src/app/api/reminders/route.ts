import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pushConfigured, validPushEndpoint } from "@/lib/push-server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const defaults = { enabled: false, lead_minutes: 0, follow_up_enabled: true, daily_summary_enabled: false, daily_summary_time: "20:30" };

function validTime(value: unknown): value is string { return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }

type ValidSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
function validSubscription(subscription: unknown): subscription is ValidSubscription {
  if (!subscription || typeof subscription !== "object") return false;
  const value = subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  return typeof value.endpoint === "string" && value.endpoint.length <= 2048 && validPushEndpoint(value.endpoint) && typeof value.keys?.p256dh === "string" && typeof value.keys?.auth === "string" && value.keys.p256dh.length <= 256 && value.keys.auth.length <= 256;
}

async function account() {
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  return { client, user: error ? null : user };
}

export async function GET() {
  const { client, user } = await account();
  if (!user) return Response.json({ error: "Logga in först." }, { status: 401 });
  const [preferences, subscriptions] = await Promise.all([
    client.from("reminder_preferences").select("enabled,lead_minutes,follow_up_enabled,daily_summary_enabled,daily_summary_time").eq("user_id", user.id).maybeSingle(),
    client.from("push_subscriptions").select("endpoint").eq("user_id", user.id),
  ]);
  if (preferences.error || subscriptions.error) return Response.json({ error: "Påminnelser är inte färdigkonfigurerade i databasen." }, { status: 503 });
  const serverConfigured = pushConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.REMINDER_CRON_SECRET);
  let deliveryReady = false;
  if (serverConfigured) {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const health = await admin.from("reminder_dispatch_health").select("last_run_at").eq("id", 1).maybeSingle();
    deliveryReady = Boolean(!health.error && health.data && Date.now() - Date.parse(health.data.last_run_at) < 5 * 60_000);
  }
  return Response.json({ configured: serverConfigured, deliveryReady, publicKey: process.env.VAPID_PUBLIC_KEY ?? "", preferences: { ...defaults, ...preferences.data, daily_summary_time: String(preferences.data?.daily_summary_time ?? defaults.daily_summary_time).slice(0, 5) }, endpoints: (subscriptions.data ?? []).map(row => row.endpoint) });
}

export async function POST(request: Request) {
  const { client, user } = await account();
  if (!user) return Response.json({ error: "Logga in först." }, { status: 401 });
  if (!pushConfigured()) return Response.json({ error: "Påminnelser är inte konfigurerade på servern." }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Ogiltig begäran." }, { status: 400 }); }
  const enabled = body.enabled;
  const lead = body.leadMinutes;
  const followUp = body.followUpEnabled;
  const summary = body.dailySummaryEnabled;
  const summaryTime = body.dailySummaryTime;
  if (typeof enabled !== "boolean" || ![0, 10, 15].includes(Number(lead)) || typeof followUp !== "boolean" || typeof summary !== "boolean" || !validTime(summaryTime)) {
    return Response.json({ error: "Ogiltiga påminnelseinställningar." }, { status: 400 });
  }
  const subscription = body.subscription;
  if (enabled) {
    if (!subscription || typeof subscription !== "object") return Response.json({ error: "Telefonens prenumeration saknas." }, { status: 400 });
    if (!validSubscription(subscription)) return Response.json({ error: "Telefonens push-prenumeration är ogiltig." }, { status: 400 });
    const result = await client.from("push_subscriptions").upsert({ user_id: user.id, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, last_seen_at: new Date().toISOString() }, { onConflict: "endpoint" });
    if (result.error) return Response.json({ error: "Kunde inte registrera den här telefonen." }, { status: 500 });
  }
  const result = await client.from("reminder_preferences").upsert({ user_id: user.id, enabled, lead_minutes: lead, follow_up_enabled: followUp, daily_summary_enabled: summary, daily_summary_time: summaryTime, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (result.error) return Response.json({ error: "Kunde inte spara påminnelseinställningarna." }, { status: 500 });
  return Response.json({ ok: true });
}

/** Re-register this phone's current subscription (on launch, or after the browser rotated it). */
export async function PUT(request: Request) {
  const { client, user } = await account();
  if (!user) return Response.json({ error: "Logga in först." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Ogiltig begäran." }, { status: 400 }); }
  if (!validSubscription(body.subscription)) return Response.json({ error: "Telefonens push-prenumeration är ogiltig." }, { status: 400 });
  const { endpoint, keys } = body.subscription;
  const result = await client.from("push_subscriptions").upsert({ user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, last_seen_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (result.error) return Response.json({ error: "Kunde inte registrera den här telefonen." }, { status: 500 });
  if (typeof body.oldEndpoint === "string" && body.oldEndpoint !== endpoint) {
    await client.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", body.oldEndpoint);
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { client, user } = await account();
  if (!user) return Response.json({ error: "Logga in först." }, { status: 401 });
  let endpoint: unknown;
  try { endpoint = (await request.json()).endpoint; } catch { return Response.json({ error: "Ogiltig begäran." }, { status: 400 }); }
  if (typeof endpoint !== "string") return Response.json({ error: "Telefonens prenumeration saknas." }, { status: 400 });
  const result = await client.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  if (result.error) return Response.json({ error: "Kunde inte ta bort telefonens prenumeration." }, { status: 500 });
  return Response.json({ ok: true });
}
