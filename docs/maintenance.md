# Maintenance

Recipes for the things you are actually likely to want to do.

Run `npm run check` after any of them.

---

## Change someone's name

[`src/config/family.ts`](../src/config/family.ts) → edit `name`.

Leave `id` alone — it is the key the rotation schedule and the tests refer to.

---

## Replace someone's photo

Drop the new file into `public/avatars/`, keeping the same filename. Square
images work best; they are cropped to a circle.

> **If it still shows the old photo**, see
> [A replaced image still shows the old one](#a-replaced-image-still-shows-the-old-one).
> Short version: `npm run cache:clear`, restart, hard-reload.

---

## Go back to an illustrated avatar

Delete that person's `imageSrc` line. Their `face` definition is still there and
takes over immediately.

---

## Change someone's colour

Edit `avatarColor` and `avatarColorDark`. These are independent of the app theme
on purpose, so a child always recognises themselves.

---

## Swap the two parents

Two different things, depending on what you mean:

- **Just for now** — press the ⇄ button in the header. Saved to this device.
- **Change the default** — exchange the two ids in `PARENT_ASSIGNMENTS` in
  [`src/config/seating.ts`](../src/config/seating.ts). The table and vehicle are
  configured separately, so you can change one without the other.

  One catch: the ⇄ button stores a *relative* preference, not an absolute one.
  If a device has it toggled on, flipping the default moves that device back to
  the old arrangement. Press the button again there, or clear
  `birch-family-seats:parents-swapped:v1`.

---

## Change the rotation start date

[`src/config/app.ts`](../src/config/app.ts) → `ROTATION_START_DATE`. It must be
a `YYYY-MM-DD` Monday; a mid-week date snaps back to that week's Monday.

---

## Edit the five-week schedule

[`src/config/rotation.ts`](../src/config/rotation.ts), then:

```bash
npm test                    # enforces every hard fairness rule
npm run schedule:generate   # re-run the search and print fresh statistics
```

The tests fail loudly on duplicates, missing position coverage, a child stuck in
one seat, or a bad Week 5 → Week 1 wrap. See [Rotation](rotation.md).

Two tests in `schedule.test.ts` assert the *measured* statistics — the repeated-
adjacency total and the pairing spread — so a new schedule will fail them even
when it is perfectly valid. Take the numbers from `schedule:generate`, update
those two tests, and update the fairness table in [Rotation](rotation.md).

---

## Replace a scene photograph

1. Drop the new file into `public/scenes/`.
2. If its shape differs, update that scene's `aspect` / `aspectRatio` in
   `TABLE_LAYOUT` or `VEHICLE_LAYOUT`.
3. Re-measure the seat coordinates.
4. `npm run cache:clear`, then restart the server and hard-reload the page.

**How to re-measure properly.** Don't eyeball it — the photo is cropped by
`object-fit: cover` to the frame's aspect ratio, so positions in the source file
are not positions in the frame. Render the app, then sample the *rendered*
frame. Scanning a row of pixels for brightness transitions gives exact edges:
dark floor reads ~30, wood reads ~90. That is how the current numbers were
found (left bench 17–27, table 30–74, right bench 77–87, benches y 22–86).

Then `npm test` — the geometry tests will tell you if anything overlaps, if a
label collides, or if someone has ended up outside the frame.

---

## Add, rename or remove a theme

[`src/config/themes.ts`](../src/config/themes.ts). Add an entry to `THEMES` and
its id to the `ThemeId` union.

`tests/themes.test.tsx` asserts exactly ten themes — update that count if you
change it. Keep an id stable when renaming, since the id is what is stored.

Check contrast: every theme should clear 4.5:1 for text on surface, muted text
on surface, and text on primary.

---

## Change the arrival animation

[`src/config/seating.ts`](../src/config/seating.ts):

```ts
ARRIVAL_TOTAL_MS = 3000;
ARRIVAL_STEP_MS = 430;
ARRIVAL_DURATION_MS = 420;
```

A test asserts `(7 - 1) × STEP + DURATION === TOTAL`, so change them together.
Doorways are the `entry` field on each seat. See [Animation](animation.md).

---

## Rename the app

[`src/config/app.ts`](../src/config/app.ts) → `APP_NAME` and `APP_SHORT_NAME`.
This feeds the header, the page title and the PWA manifest at once.

---

## Ship an update to installed devices

Bump `CACHE_VERSION` in `public/sw.js`. Every device drops its old cache on the
next visit.

---

## Reset a device's saved preferences

```js
localStorage.removeItem("birch-family-seats:theme:v1");
localStorage.removeItem("birch-family-seats:parents-swapped:v1");
```

Both are per-browser and per-device, and neither syncs.

---

# Troubleshooting

**A replaced image still shows the old one.**

Reusing a filename means the URL never changes, and *three* separate caches key
on that URL. Clear them in this order — the first one is almost always the
culprit:

1. **Next's image optimiser** (server side, `.next/cache/images`). It stores the
   resized copy against the request URL, so a new file at the same path is
   never re-read.
   ```bash
   npm run cache:clear
   ```
   Restart the server afterwards; the optimiser also keeps an in-memory layer.

2. **The service worker** (browser). Only relevant after you have run a
   production build on that origin. In development the app now unregisters any
   worker it finds and clears its caches automatically, so **loading the dev
   page twice is enough**. In production, bumping `CACHE_VERSION` in
   `public/sw.js` drops every old cache.

3. **The browser's own HTTP cache.** Optimised images are served with
   `max-age=14400`, so a normal reload can still show the old picture for four
   hours. A hard reload (Cmd-Shift-R) or DevTools → Network → *Disable cache*
   settles it.

The service worker itself no longer serves stale pictures: non-hashed assets go
network-first with forced revalidation. But the two caches either side of it can
still hold one, which is why the order above matters.

**Dev is serving an old build entirely.**
A service worker registered by an earlier `npm start` keeps controlling
`localhost:3000` during `npm run dev`, because they share an origin. The app
now tears that down on its own — load the page, let it reload once, and you are
back on live dev output. Note this also means a worker from this app can
intercept *another* project served on the same port; if you juggle apps on
:3000, unregister under DevTools → Application → Service Workers.

**Offline doesn't work.**
The service worker is not registered in `npm run dev` — that's deliberate. Use
`npm run build && npm start`.

**The theme flashes on load.**
The pre-hydration script should prevent this. Check the inline script is still
in `layout.tsx` and that `ThemeStyles` is rendering `[data-theme]` blocks.

**Avatars are different sizes.**
The avatar circle must stay `w-full` inside the seat. If it is allowed to
shrink-to-fit, the name label beneath it drives the width and longer names get
bigger faces. There is a test for this.

**The theme picker appears behind a card.**
It must be portalled to `document.body`. The cards' entrance animations create
stacking contexts that no z-index inside the header can beat.

**A `position: fixed` element is stuck inside the header.**
The header animation must stay opacity-only. Any transform on an ancestor
becomes the containing block for fixed descendants.

**Hydration mismatch on a date.**
Node and browsers disagree about `Intl.DateTimeFormat.formatRange` separators.
Compose ranges from two `format()` calls, as `formatDateRange` does.
