// Service worker — cache-first for content/*, network-first for app shell.
//
// Computes its own base path from its location, so the same SW works whether
// the app is deployed at the root (https://host/) or at a subpath
// (https://host/Tour-Guide/). At /Tour-Guide/sw.js, SW_BASE = "/Tour-Guide".
//
// content/ is pre-populated by install.js using the same cache name, so by the
// time the user goes offline every audio file + photo is sitting in here.

const SHELL_CACHE = "tg-shell-v3";
const CONTENT_CACHE = "tg-content-v2";
const SW_BASE = self.location.pathname.replace(/\/sw\.js$/, "");
const CONTENT_PREFIX = SW_BASE + "/content/";
const SHELL_FALLBACK = SW_BASE + "/";

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, CONTENT_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(CONTENT_PREFIX)) {
    e.respondWith(cacheFirst(e.request, CONTENT_CACHE));
  } else if (e.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname === SHELL_FALLBACK) {
    e.respondWith(networkFirst(e.request, SHELL_CACHE));
  } else if (/\.(js|css|webmanifest|png|jpg|svg|woff2?)$/.test(url.pathname)) {
    // network-first for shell assets so JS edits don't get stuck behind cache
    e.respondWith(networkFirst(e.request, SHELL_CACHE));
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return new Response("Offline and not cached", { status: 503 });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req) || await cache.match(SHELL_FALLBACK);
    return hit || new Response("Offline", { status: 503 });
  }
}
