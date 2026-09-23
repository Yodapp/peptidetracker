import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("offline shell install caches escaped Next assets and serves a cold navigation", async () => {
  const listeners: Record<string, (event: { waitUntil: (promise: Promise<unknown>) => void; respondWith: (promise: Promise<Response>) => void; request: object }) => void> = {};
  const storage = new Map<string, Map<string, Response>>();
  const keyOf = (request: string | { url: string }) => typeof request === "string" ? request : new URL(request.url).pathname;
  const caches = {
    open: async (name: string) => {
      const entries = storage.get(name) ?? new Map<string, Response>();
      storage.set(name, entries);
      return { put: async (request: string | { url: string }, response: Response) => { entries.set(keyOf(request), response); } };
    },
    match: async (request: string | { url: string }) => [...storage.values()].map(entries => entries.get(keyOf(request))).find(Boolean),
    keys: async () => [...storage.keys()],
    delete: async (name: string) => storage.delete(name),
  };
  const html = '<link href="/_next/static/css/main.css\\"/><script src="/_next/static/chunks/app.js"></script>';
  let online = true;
  const fetch = async (request: string | { url: string }) => {
    if (!online) throw new Error("offline");
    const path = keyOf(request);
    if (path === "/offline") return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
    return new Response(path, { status: 200 });
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { location: { origin: "https://peptime.test" }, addEventListener: (name: string, callback: typeof listeners[string]) => { listeners[name] = callback; }, clients: { claim: async () => undefined } },
    caches, fetch, URL, Response, Promise,
  });
  let install: Promise<unknown> = Promise.resolve();
  listeners.install({ waitUntil: promise => { install = promise; }, respondWith: () => undefined, request: {} });
  await install;
  assert.ok([...storage.values()].some(entries => entries.has("/_next/static/css/main.css")));
  assert.ok([...storage.values()].some(entries => entries.has("/_next/static/chunks/app.js")));
  online = false;
  let navigation: Promise<Response> = Promise.resolve(new Response("missing response"));
  listeners.fetch({ waitUntil: () => undefined, respondWith: promise => { navigation = promise; }, request: { method: "GET", url: "https://peptime.test/", mode: "navigate", headers: new Headers() } });
  assert.equal(await (await navigation).text(), html);
});
