/** Identifies this deploy; baked into the bundle by next.config.ts. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

/** Register the worker for this deploy. Re-registering the same URL is a no-op. */
export function registerServiceWorker() {
  return navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`, { updateViaCache: "none" });
}
