const CACHE_PREFIX = "peptime-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-v3`;
const STATIC_CACHE = `${CACHE_PREFIX}static-v3`;
const PRECACHE = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"];

async function cacheShell() {
  const shellCache = await caches.open(SHELL_CACHE);
  await Promise.allSettled(PRECACHE.map(async path => {
    const response = await fetch(path, { cache: "reload", credentials: "same-origin" });
    if (response.ok) await shellCache.put(path, response);
  }));

  const page = await fetch("/", { cache: "reload", credentials: "same-origin" });
  if (!page.ok) return;
  await shellCache.put("/", page.clone());
  const html = await page.text();
  const assetPaths = [...new Set(html.match(/\/_next\/static\/[^"'<>\s]+/g) ?? [])];
  const staticCache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(assetPaths.map(async path => {
    const response = await fetch(path, { cache: "reload", credentials: "same-origin" });
    if (response.ok) await staticCache.put(path, response);
  }));
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    await cacheShell().catch(() => undefined);
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
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isNextDataRequest = url.searchParams.has("_rsc") || event.request.headers.has("RSC") || event.request.headers.has("Next-Router-Prefetch");
  if (url.origin !== self.location.origin || isNextDataRequest || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/") || url.pathname === "/login") return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) (await caches.open(STATIC_CACHE)).put(event.request, response.clone());
      return response;
    })());
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) (await caches.open(SHELL_CACHE)).put(event.request, response.clone());
        return response;
      } catch {
        return (await caches.match(event.request)) || (await caches.match("/")) || new Response("Peptime är offline. Anslut till internet och försök igen.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type === "basic") (await caches.open(STATIC_CACHE)).put(event.request, response.clone());
    return response;
  })());
});
self.addEventListener("push", event => {
  let payload = { title: "Peptime", body: "Du har en planerad loggpost." };
  try { payload = { ...payload, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "peptime-slot",
    data: { url: payload.url || "/" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/"));
});
