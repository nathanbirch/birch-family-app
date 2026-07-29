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
| Everything else, same-origin | Cache first, with a quiet background refresh. |
| Cross-origin | Not intercepted at all. |

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
