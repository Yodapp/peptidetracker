import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pushConfigured, sendPush, type StoredSubscription } from "@/lib/push-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: "Logga in först." }, { status: 401 });
  if (!pushConfigured()) return Response.json({ error: "Web Push är inte konfigurerat." }, { status: 503 });
  let endpoint: unknown;
  try { endpoint = (await request.json()).endpoint; } catch { return Response.json({ error: "Ogiltig begäran." }, { status: 400 }); }
  if (typeof endpoint !== "string") return Response.json({ error: "Telefonens prenumeration saknas." }, { status: 400 });
  const { data, error } = await client.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").eq("user_id", user.id).eq("endpoint", endpoint).maybeSingle();
  if (error || !data) return Response.json({ error: "Den här telefonen är inte registrerad." }, { status: 404 });
  try {
    await sendPush(data as StoredSubscription, { title: "Peptime", body: "Testet fungerar. Påminnelser kan nå den här telefonen.", tag: `test-${Date.now()}`, url: "/" });
    return Response.json({ ok: true });
  } catch (cause) {
    const status = (cause as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) await client.from("push_subscriptions").delete().eq("id", data.id);
    return Response.json({ error: "Testnotisen kunde inte skickas. Försök aktivera påminnelser igen." }, { status: 502 });
  }
}
