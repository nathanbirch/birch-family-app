# PWA and offline

## Installing

**iPhone / iPad** — open in **Safari** (Chrome on iOS cannot install web apps),
tap Share, then **Add to Home Screen**.

**Android** — open in Chrome. Accept the install prompt, or ⋮ → **Install app**.

**Desktop** — Chrome and Edge show an install icon in the address bar.
Otherwise: Chrome ⋮ → *Cast, save and share* → **Install page as app**; Edge
••• → *Apps* → **Install this site as an app**; Safari on macOS **File** →
**Add to Dock**.

There is deliberately **no in-app install button**. Installability cannot be
detected reliably across browsers, and a button that does nothing on iOS is
worse than no button. The app works identically without installing.

## Offline

After one successful online visit, the app works with no connection at all.

`public/sw.js` is hand-written and small — a PWA framework would be more moving
parts than this needs.

| Request | Strategy |
|---|---|
| Navigations | Network first, falling back to the cached page. Freshest build when online; still opens on a dead signal. |
| `/_next/static/…` | Cache first. Content-hashed, so a URL can never mean two different things. |
| Hashed avatars | Cache first, for the same reason. |
| Everything else, same-origin | Network first with forced revalidation, falling back to the cache. |
| Cross-origin | Not intercepted at all. |

That fourth row is deliberate. The scene photographs, the icons and the
manifest are **not** content-addressed: replacing `dinner-table.png` with a new
picture reuses the same URL. A cache-first worker would serve the old
photograph until the cache version changed. Requests go out with
`cache: "no-cache"` so the browser's own HTTP cache cannot answer either —
Next serves optimised images with `max-age=14400`. The request is conditional,
so an unchanged asset costs a 304 rather than a re-download, and offline
behaviour is unaffected.

### In development, the worker removes itself

The dev and production servers share an origin, so a worker registered by one
`npm start` would otherwise keep controlling every later `npm run dev` — serving
stale JavaScript and stale photographs with no way for the app to recover. In
development the app unregisters any worker it finds, deletes its caches, and
reloads once.

On install it precaches the page shell, the manifest and the icons, each
individually so one missing file cannot fail the whole install. The scene and
avatar photographs are served through Next's image optimiser and cached at
runtime on first visit.

Nothing else is needed offline: the family, the seats, the schedule and all ten
themes are compiled into the app, and the fonts are a system stack.

### Content-addressed things are cache-first

Two kinds of URL can never mean two different things, so both are served from
cache with no network round trip at all:

- `/_next/static/…` — build output, hashed by Next.
- **Avatars and pet photographs** — `/avatars/hannah-5090be3683.png`,
  `/pets/bella-59aec1e1b8.png`, hashed by `npm run avatars:generate` and
  `npm run pets:generate`, whether requested directly or through
  `/_next/image?url=…`. The hash check is deliberate: an *unhashed*
  `/avatars/hannah.png` must not be cache-first, because that URL could later
  mean a different photograph.

This is what makes a repeat visit to the seating page paint faces — and Bella
and Leia — instantly.
Everything else non-hashed stays network-first with a cache fallback.

### Each page is cached under its own URL

Worth knowing because it was wrong until recently. The worker used to store
every navigation under `"/"`, which was harmless while the app was a single
page and became a bug the moment it was not: visiting `/turns` overwrote the
entry for `"/"`, so opening the app offline showed the seating board where the
dashboard should have been. Pages are now cached under their own URL, with the
app shell as the fallback for a page never visited.

### Offline and the login

Adding a login changed what "works offline" means, and the distinction is worth
being clear about:

- **Already signed in, page previously visited** — works. The cached HTML
  renders, and the seating is derived from the device's own clock, so it is
  correct rather than stale.
- **Already signed in, page never visited** — falls back to the cached
  dashboard.
- **Not signed in** — cannot sign in offline. Authentication needs the server
  and the database. The redirect to `/login` is a 307 and therefore never
  cached, so nothing stale is served; the login page simply cannot complete.

Signing out does not purge pages already in the cache. On a shared family
device behind one shared account that is the intent, but it is not a security
boundary — see [Authentication](authentication.md#what-is-not-here).

### Shipping an update

Bump `CACHE_VERSION` in `public/sw.js`. Every device drops its old cache on the
next visit. Currently `v5`.

- `v3` — the app was renamed and the icons were redrawn. The case the bump
  exists for: without it, installed devices keep serving the old icons forever.
- `v4` — the pet photographs arrived. Belt-and-braces; their URLs were new.
- `v5`, `v6` — `/seating` became `/rotations`, then `/turns`. Required, and
  for a reason worth remembering: **every cached page carries the tab bar**, so
  a rename makes every entry in the cache stale at once, not just the page that
  moved.

### Local development caveat

**The service worker does not run in `npm run dev`.** It is registered only in
production builds, because caching in front of the dev server's constantly
changing assets causes nothing but confusion.

```bash
npm run build && npm start
```

then DevTools → Network → **Offline**, or Application → Service Workers →
**Offline**. Reload; the app should come up normally with your saved
preferences.

## Icons

The mark is a **birch tree with five leaves** — one per child — with a `B`
worked into the trunk. It replaced the original plate-and-steering-wheel icon,
which depicted the seating rotation back when that was the entire app and made
no sense once the app became a family hub.

### The master

`assets/icon-master.png` — 1254×1254, white mark on blue, opaque. This is the
only hand-made asset; every icon in `public/` is derived from it and none
should be edited directly.

It lives in `assets/` rather than `public/` deliberately: it is a build input,
not something to serve to browsers.

### Generating

Locally — no image tooling, no network:

```bash
npm run icons:generate
```

| File | Purpose |
|---|---|
| `icon-192.png`, `icon-512.png` | Android / desktop, and the in-app mark |
| `icon-maskable-512.png` | Android maskable, inset into the safe zone |
| `apple-touch-icon.png` | iOS home screen (180×180) |
| `favicon-32.png` | Browser tab |
| `../favicon.ico` | 16/32/48, for anything still asking for one |

`scripts/generate-icons.mjs` decodes the master with `zlib`, resamples by area
averaging, and re-encodes by hand. It does two things beyond resizing, both of
which matter:

**It normalises the background.** The master's blue is `rgb(1, 98, 166)`,
*nearly* the brand `#0369a1` but not it. Invisible in isolation, obvious where
the icon meets chrome tinted with the real brand colour — the PWA splash screen
and the installed title bar. Each pixel is reduced to a coverage value and
recomposited over the exact brand colour.

**It insets the maskable icon.** The master's artwork reaches 93% of the way
from centre to edge. Android crops maskable icons to a circle covering the
central 80%, so the outer leaves would be sliced off. The maskable variant is
scaled to 79% reach; the ordinary icons keep the master's framing.

Placement is measured from the artwork, not hardcoded, so a replacement master
with different framing still produces correct icons — including re-centring one
whose mark sits off-centre, as this one does by 18px vertically.

> **There is no `icon.svg`.** The mark is artwork rather than geometry, so the
> PNGs are the source of truth. Hand-tracing it to paths would create a second
> copy to keep in sync, and the two would drift.

### The mark inside the app

`src/components/AppMark.tsx` renders `icon-192.png` — the same file the home
screen uses — on the login screen and in the seating header. One component, so
the in-app mark and the installed icon cannot diverge.

### Nobody moves until the photographs have loaded

The arrival choreography is held back until every avatar in both scenes has
finished loading, so people never walk to their seats as empty coloured
circles that fill in afterwards.

How it works, and why in that order:

1. `.seat-arrival` is on every person from the first paint. The pre-paint
   inline script adds `js` to `<html>`, and `.js .seat-arrival { opacity: 0 }`
   hides them **before anything is painted** — no flash of a populated table.
2. The `<img>` elements are in the DOM the whole time, merely transparent, so
   the browser downloads them during the wait. They also carry `priority`, so
   Next preloads them at high priority rather than lazily.
3. `useImagesReady` watches those elements — not a separate preload, which
   would fetch every photograph twice, since the real URL is the optimiser's
   `/_next/image?url=…&w=384&q=75` and cannot be reliably reconstructed.
4. Once all have settled, React adds `.is-arriving` and the stagger plays.
5. A 4-second timeout starts the animation regardless. A broken or very slow
   photograph should delay the scene, never withhold it.

Without JavaScript, `html.js` never appears, none of the hiding applies, and
everyone is simply in their seat.

Measured on a production build with a cold cache, sampling every 20ms: **zero**
frames where anyone animated while a photograph was still unloaded, on fast,
400kbps and 150kbps connections. Simulating the un-gated behaviour on the same
build produced 78 such frames with up to 12 unloaded avatars, which is what
confirms the measurement is real rather than vacuous.

### After changing the icon

1. Replace `assets/icon-master.png`.
2. `npm run icons:generate`.
3. **Bump `CACHE_VERSION` in `public/sw.js`.** Installed devices cache the
   icons; without a bump they keep serving the old ones indefinitely.
4. On iOS, delete and re-add the home-screen shortcut — iOS caches the
   apple-touch-icon aggressively and will not refresh it in place.

### Known limitation

At 16–32px the leaf veins and the `B` dissolve; the mark reads as a small tree.
That is inherent to a mark with this much detail and is acceptable for a
favicon, but it is the reason not to add further fine detail to the master.

## Manifest and metadata

`src/app/manifest.ts` generates the web app manifest from the same config as
the rest of the app, so renaming the app in `config/app.ts` renames the
installed icon too. It is served at `/manifest.webmanifest`.

`theme-color` is set statically through Next metadata to the default theme, and
`ThemeProvider` updates the meta tag at runtime to match the selected theme
where the browser supports it. Treat the dynamic part as progressive
enhancement — the theme system works fine without it.
