"use client";

import { useEffect, useState } from "react";
import { APP_VERSION, registerServiceWorker } from "@/lib/service-worker";

const VERSION_CHECK_INTERVAL = 5 * 60_000;

/** Keep the account's copy of this phone's push subscription current (iOS never fires pushsubscriptionchange). */
async function refreshPushSubscription(registration: ServiceWorkerRegistration) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !registration.pushManager) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/reminders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
}

export function PwaUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister()))).catch(() => undefined);
      if ("caches" in window) caches.keys().then(names => Promise.all(names.filter(name => name.startsWith("peptime-")).map(name => caches.delete(name)))).catch(() => undefined);
      return;
    }

    let active = true;
    registerServiceWorker().then(registration => refreshPushSubscription(registration)).catch(() => undefined);
    const installed = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    // Ask the browser not to evict the offline copy under storage pressure.
    if (installed) navigator.storage?.persist?.().catch(() => undefined);

    // An installed app can stay open across deploys. Pages are fetched fresh
    // on every load, so a reload is all it takes to pick up a new version.
    let lastCheck = Date.now();
    const checkVersion = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < VERSION_CHECK_INTERVAL) return;
      lastCheck = Date.now();
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const { version } = await response.json();
        if (active && typeof version === "string" && version !== APP_VERSION) setUpdateAvailable(true);
      } catch {}
    };
    const timer = window.setInterval(checkVersion, VERSION_CHECK_INTERVAL);
    document.addEventListener("visibilitychange", checkVersion);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkVersion);
    };
  }, []);

  if (!updateAvailable) return null;
  return <button
    type="button"
    onClick={() => window.location.reload()}
    className="fixed inset-x-5 bottom-[calc(68px+env(safe-area-inset-bottom))] z-50 mx-auto min-h-12 max-w-[460px] rounded-full bg-foreground px-5 text-sm font-semibold text-background shadow-xl"
  >Ny version · Ladda om</button>;
}
