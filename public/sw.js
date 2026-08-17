/*
 * Birch Family App — offline service worker.
 *
 * Deliberately small and hand-written: a full PWA framework would be more
 * moving parts than this needs.
 *
 * A note on the login. Protected pages are server-rendered per request and
 * redirect to /login without a session, so a redirect is never `ok` and never
 * cached. What *is* cached is the HTML of pages you successfully loaded while
 * signed in. On a shared family device behind one shared account that is the
 * intent; it does mean signing out does not erase pages already in the cache.
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

/*
 * v3: the app was renamed, every icon was redrawn, and `icon.svg` was removed.
 * The version bump is what makes installed devices drop the old cache — and
 * therefore the old plate-and-steering-wheel icons — on their next visit.
 */
/*
 * v4: the pet photographs arrived. The bump is not strictly required — their
 * URLs are new — but the cheapest way to be sure no device is holding a
 * seating page that predates them.
 */
/*
 * v5: `/seating` became `/rotations`, and v6: `/rotations` became `/turns`.
 * These *are* required. Every cached page carries the tab bar, so without a
 * bump an installed device would keep painting the old tab pointing at a URL
 * that now only redirects — on every page, until something else happened to
 * evict it.
 */
/*
 * v7: Stars arrived and took the tab that was Mantras'. Required for the same
 * reason as v5 and v6 — every cached page carries the tab bar, so without a
 * bump an installed device would keep painting a bar with no Stars tab in it
 * on every page it had already cached.
 */
/*
 * v8: the celebration sound joined the precache. Not strictly required — the
 * filename is content-hashed, so it is a new URL either way — but a bump is
 * what makes an already-installed device fetch it during the *install* step,
 * rather than the first time a child happens to finish a column while the
 * phone is offline.
 */
/*
 * v9: the weekly report arrived, as a card on the dashboard. Required for the
 * same reason as v5-v7, one level down: a device with a cached dashboard would
 * keep painting a "Coming soon: Weekly Report" tile over a page that now
 * exists, and navigations are network-first but the *cached* copy is what an
 * offline phone gets.
 *
 * The ceremony music is deliberately NOT in the precache below. It is 300KB —
 * fifteen times the cheer — and it is wanted on one page, once a week, that
 * nobody opens in a driveway. The service worker caches it on first play like
 * any other same-origin asset, so the second viewing is offline anyway. That
 * is the right trade: the cheer is precached because silence would be the only
 * part of the celebration that needed a signal; the report simply does not
 * open offline before it has ever been opened online.
 *
 * v10: the reports became Ceremonies and moved to `/ceremonies`, and the cheer
 * was rebuilt (a new content hash, so the old file is precached under a name
 * nothing asks for any more). Both are the v5-v7 case again — a phone holding
 * the old shell would keep a dead `/report` link on its dashboard and go on
 * playing a sound the app no longer references.
 *
 * v11: the Note and Finger Picker arrived, and with them the Handy row on the
 * dashboard. The v9 case exactly — a phone holding a cached dashboard would go
 * on painting one with no Handy row on it, and the two tools would be
 * unreachable from the one screen they are reached from, on precisely the
 * devices most likely to want them.
 *
 * Neither page is added to the precache below, deliberately, and for opposite
 * reasons. The Note is worth having offline and *gets* there by itself: it is
 * opened often, the runtime cache keeps it after the first visit, and its
 * contents never came from the network in the first place. Finger Picker is a
 * page you open when five people are in the room, which is not the situation
 * anyone is in with no signal — and precaching a route costs every device a
 * fetch on install whether or not it is ever opened.
 */
/*
 * v12: Family Home Evening arrived on the Whose Turn page. The v4 case, not the
 * v5-v7 one: no tab or dashboard card changed, so nothing is left pointing
 * anywhere dead — but an installed device holding a cached `/turns` would go on
 * painting a page with the house missing from it, and this is the cheapest way
 * to be sure none does. The photograph is deliberately not precached: it is
 * 855KB for one card on one page, and the runtime cache picks it up on the
 * first visit like every other same-origin asset.
 */
const CACHE_VERSION = "v12";
const CACHE_NAME = `birch-family-app-${CACHE_VERSION}`;
const APP_SHELL = "/";

const PRECACHE = [
  APP_SHELL,
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/favicon-32.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  /*
   * The celebration sound. 20KB, and the one asset on the star charts that a
   * child notices missing: confetti falls whatever the connection is doing, so
   * silence would be the only part of the party that needed a signal.
   */
  "/sounds/cheer-0d41fbb569.mp3",
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

  // Avatars, pet photographs and the cheer are content-addressed too, so they
  // get the same treatment: served from cache instantly, with no network round
  // trip at all. That is what makes a repeat visit to the seating page paint
  // faces — and Bella and Leia — immediately, and it is what makes the
  // celebration sound fire on the same frame as the confetti rather than after
  // a round trip.
  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(assetNetworkFirst(request));
});

/**
 * Is this an asset whose filename carries a content hash?
 *
 * Three families of them, all written by a generator script that guarantees
 * the hash: avatars, pet photographs and the celebration sound.
 *
 * Images have two shapes, because the page requests them through Next's image
 * optimiser rather than directly:
 *
 *   /avatars/hannah-5090be3683.png
 *   /_next/image?url=%2Favatars%2Fhannah-5090be3683.png&w=384&q=75
 *
 * Both embed the hash, so both are safe to cache forever: replacing the
 * photograph produces a different URL, and the old one is never requested
 * again. The sound has only the direct shape — it is fetched by the Web Audio
 * code, which does not go through the optimiser.
 *
 * The hash check matters — an unhashed `/avatars/hannah.png` must NOT be
 * cached first, because that URL could later mean a different picture.
 */
function isHashedAsset(url) {
  const HASHED_IMAGE = /\/(?:avatars|pets)\/[^/]+-[0-9a-f]{8,}\.png$/;
  const HASHED_SOUND = /\/sounds\/[^/]+-[0-9a-f]{8,}\.mp3$/;

  if (HASHED_IMAGE.test(url.pathname) || HASHED_SOUND.test(url.pathname)) {
    return true;
  }

  if (url.pathname === "/_next/image") {
    const target = url.searchParams.get("url");
    return Boolean(target) && HASHED_IMAGE.test(target);
  }

  return false;
}

/**
 * Navigations: freshest build online, cached page offline.
 *
 * Each page is cached under **its own URL**. An earlier version stored every
 * navigation under `APP_SHELL` instead, which was harmless when the app was a
 * single page and wrong the moment it was not: visiting /turns would
 * overwrite the entry for "/", and opening the app offline would show the
 * turns board where the dashboard should be.
 *
 * The app shell is still the fallback for a page that was never visited, so a
 * cold offline navigation to /account lands on the dashboard rather than an
 * error.
 */
async function pageNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    // Redirects (a signed-out visitor being sent to /login) are not `ok`, so
    // they are never cached — which is what keeps a stale redirect from
    // outliving the session that caused it.
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached =
      (await cache.match(request)) || (await cache.match(APP_SHELL));
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title>" +
        "<p style=\"font:16px system-ui;padding:2rem\">Birch Family App needs to be " +
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
