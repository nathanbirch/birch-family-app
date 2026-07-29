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

`public/sw.js` is hand-written and small — the app is a single page with no API
calls, so a PWA framework would be more moving parts than the feature needs.

| Request | Strategy |
|---|---|
| Navigations | Network first, falling back to the cached page. Freshest build when online; still opens on a dead signal. |
| `/_next/static/…` | Cache first. These filenames contain a content hash, so a URL can never mean two different things. |
| Everything else, same-origin | Network first with forced revalidation, falling back to the cache. |
| Cross-origin | Not intercepted at all. |

That third row is deliberate. Optimised images, the photographs, the icons and
the manifest are **not** content-addressed: replacing `dinner-table.png` with a
new picture reuses the same URL. A cache-first worker would serve the old
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

Verified: 24 cached entries, full offline load with photos and the saved theme
intact.

### Shipping an update

Bump `CACHE_VERSION` in `public/sw.js`. Every device drops its old cache on the
next visit.

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

Generated locally — no image tooling, no network:

```bash
npm run icons:generate
```

`scripts/generate-icons.mjs` draws the mark with plain maths into an RGBA
buffer and encodes a PNG using Node's built-in `zlib`, with 3×3 supersampling
for smooth edges.

| File | Purpose |
|---|---|
| `icon.svg` | Scalable, preferred where supported |
| `icon-192.png`, `icon-512.png` | Standard Android / desktop |
| `icon-maskable-512.png` | Maskable, with the mark inside the safe zone |
| `apple-touch-icon.png` | iOS home screen (180×180) |
| `favicon-32.png` | Browser tab |

Re-run the script after changing the mark or the brand colour at the top of the
file.

## Manifest and metadata

`src/app/manifest.ts` generates the web app manifest from the same config as
the rest of the app, so renaming the app in `config/app.ts` renames the
installed icon too. It is served at `/manifest.webmanifest`.

`theme-color` is set statically through Next metadata to the default theme, and
`ThemeProvider` updates the meta tag at runtime to match the selected theme
where the browser supports it. Treat the dynamic part as progressive
enhancement — the theme system works fine without it.
