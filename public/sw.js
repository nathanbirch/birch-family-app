/*
 * Birch Family Seats — offline service worker.
 *
 * Deliberately small and hand-written: the app is a single page with no API
 * calls, so a full PWA framework would be more moving parts than the whole
 * feature needs.
 *
 * Strategy
 *   - Navigations: network first, falling back to the cached page. The family
 *     always gets the freshest build when online, and the app still opens on
 *     aeroplane mode or a dead driveway signal.
 *   - Build output under /_next/static/: cache first. These filenames contain
 *     a content hash, so a given URL can never mean two different things.
 *   - Everything else same-origin — optimised images, the photographs, icons,
 *     the manifest: network first, falling back to the cache. These URLs are
 *     NOT content-addressed. Replacing `dinner-table.png` with a new picture
 *     reuses the same URL, and a cache-first worker would happily serve the
 *     old photograph until the cache version changed. Freshness wins here; the
 *     cache is still there the moment the network is not.
 *
 * Bump CACHE_VERSION to force every device to drop its old cache.
 */

const CACHE_VERSION = "v2";
const CACHE_NAME = `birch-family-seats-${CACHE_VERSION}`;
const APP_SHELL = "/";

const PRECACHE = [
  APP_SHELL,
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Individually, so one missing file cannot fail the whole install.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(pageNetworkFirst(request));
    return;
  }

  // Content-hashed build output: safe to serve from cache forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(assetNetworkFirst(request));
});

/** Navigations: freshest build online, cached shell offline. */
async function pageNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(APP_SHELL, response.clone());
    }
    return response;
  } catch {
    const cached =
      (await cache.match(request)) || (await cache.match(APP_SHELL));
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title>" +
        "<p style=\"font:16px system-ui;padding:2rem\">Birch Family Seats needs to be " +
        "opened online once before it can work offline.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

/**
 * Assets whose URL is not content-addressed: optimised images, the
 * photographs, icons, the manifest.
 *
 * Always ask the server, and ask with `cache: "no-cache"` so the browser's own
 * HTTP cache cannot answer on its behalf. Next serves optimised images with
 * `max-age=14400`, so without this a replaced photograph would keep showing
 * the old picture for four hours even though the worker went to the network.
 * The request is conditional — the server answers 304 when nothing changed —
 * so the cost is a round trip, not a re-download.
 *
 * Offline, the cache answers exactly as before.
 */
async function assetNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    // Refresh in the background; don't make the family wait for it.
    network.catch(() => {});
    return cached;
  }

  const response = await network;
  return response || Response.error();
}
