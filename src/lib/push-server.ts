import webpush from "web-push";

export interface StoredSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export function validPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (
      host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host === "web.push.apple.com" ||
      host.endsWith(".push.apple.com") ||
      host.endsWith(".notify.windows.com")
    );
  } catch { return false; }
}

export async function sendPush(subscription: StoredSubscription, payload: { title: string; body: string; tag: string; url: string }) {
  if (!pushConfigured()) throw new Error("Web Push is not configured");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), { TTL: 60 * 60, urgency: "normal", timeout: 10_000 });
}
