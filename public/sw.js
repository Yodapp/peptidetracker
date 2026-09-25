// The page registers /sw.js?v=<deployment>, so each deploy installs a new
// worker whose caches replace the previous deploy's.
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_PREFIX = "peptime-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`;
const STATIC_CACHE = `${CACHE_PREFIX}static-${VERSION}`;
const PRECACHE = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png", "/badge-96.png"];
const OFFLINE_PAGE = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Peptime</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font-family:-apple-system,system-ui,sans-serif;background:#f2f2f7;color:#1c1c1e;padding:24px;box-sizing:border-box;text-align:center}@media(prefers-color-scheme:dark){body{background:#000;color:#f4f4f5}}button{margin-top:16px;min-height:44px;padding:0 20px;border:0;border-radius:999px;background:#147d70;color:#fff;font:inherit;font-weight:600}</style></head><body><div><p>Peptime är offline.</p><p>Anslut till internet och försök igen.</p><button onclick="location.reload()">Försök igen</button></div></body></html>`;

// Only keep full, final responses. A redirected response cannot be served for
// a navigation (Safari rejects it), and a redirect to /login is not the app.
function cacheable(response) {
  return response.ok && response.type === "basic" && !response.redirected;
}

async function cacheShell() {
  const shellCache = await caches.open(SHELL_CACHE);
  await Promise.allSettled(PRECACHE.map(async path => {
    const response = await fetch(path, { cache: "reload", credentials: "same-origin" });
    if (cacheable(response)) await shellCache.put(path, response);
  }));

  const page = await fetch("/", { cache: "reload", credentials: "same-origin" });
  if (!cacheable(page)) return;
  await shellCache.put("/", page.clone());
  const html = await page.text();
  const assetPaths = [...new Set(html.match(/\/_next\/static\/[^"'<>\s\\]+/g) ?? [])];
  const staticCache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(assetPaths.map(async path => {
    const response = await fetch(path, { credentials: "same-origin" });
    if (cacheable(response)) await staticCache.put(path, response);
  }));
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    await cacheShell().catch(() => undefined);
    // The page that registered this worker is already the new deploy (pages
    // are fetched network-first), so take over at once.
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, STATIC_CACHE].includes(name)).map(name => caches.delete(name)));
  await self.clients.claim();
})()));

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isNextDataRequest = url.searchParams.has("_rsc") || request.headers.has("RSC") || request.headers.has("Next-Router-Prefetch");
  if (url.origin !== self.location.origin || isNextDataRequest || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/") || url.pathname === "/login" || url.pathname === "/sw.js") return;

  // Build output is content-hashed and never changes: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (cacheable(response)) (await caches.open(STATIC_CACHE)).put(request, response.clone());
      return response;
    })());
    return;
  }

  // Pages: always the latest from the network, the last copy when offline.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (cacheable(response)) (await caches.open(SHELL_CACHE)).put(request, response.clone());
        return response;
      } catch {
        return (await caches.match(request, { ignoreSearch: true })) || (await caches.match("/")) || new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }

  // Manifest, icons and other public files: serve the cached copy at once and
  // refresh it in the background so changes still arrive.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then(response => {
      if (cacheable(response)) cache.put(request, response.clone());
      return response;
    });
    if (cached) {
      event.waitUntil(network.catch(() => undefined));
      return cached;
    }
    return network;
  })());
});

self.addEventListener("push", event => {
  let payload = { title: "Peptime", body: "Du har en planerad loggpost." };
  try { payload = { ...payload, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icon-192.png",
    // Android draws the badge as a white silhouette in the status bar.
    badge: "/badge-96.png",
    tag: payload.tag || "peptime-slot",
    data: { url: payload.url || "/" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.url || "/", self.location.origin);
    if (url.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === url.origin);
    if (existing) {
      try { await existing.focus(); } catch {}
      // navigate() only works for windows this worker controls.
      if (existing.url !== url.href) {
        try { await existing.navigate(url.href); } catch {}
      }
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});

// Chrome and Firefox rotate push subscriptions; register the new one with the
// account so reminders keep arriving. (iOS does not fire this event; the app
// re-registers its subscription on launch instead.)
self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil((async () => {
    const options = event.oldSubscription?.options;
    const subscription = event.newSubscription ?? (options ? await self.registration.pushManager.subscribe(options) : await self.registration.pushManager.getSubscription());
    if (!subscription) return;
    await fetch("/api/reminders", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON(), oldEndpoint: event.oldSubscription?.endpoint }),
    });
  })().catch(() => undefined));
});
