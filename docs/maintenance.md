# Maintenance

Recipes for the things you are actually likely to want to do.

Run `npm run check` after any of them.

---

## Add a new page

The tab bar and the dashboard are both generated from one config, so this is
four steps and no wiring:

1. If it needs storage, add a collection name to `COLLECTIONS` in
   [`src/config/db.ts`](../src/config/db.ts), and its indexes to
   [`scripts/seed-database.ts`](../scripts/seed-database.ts). Then
   `npm run db:seed`.
2. Add an entry to `NAV_ITEMS` in
   [`src/config/navigation.ts`](../src/config/navigation.ts), and delete the
   matching entry from `PLANNED_FEATURES`.
3. Add an icon to `ICONS` in
   [`src/components/nav/NavIcon.tsx`](../src/components/nav/NavIcon.tsx).
4. Create `src/app/(app)/<page>/page.tsx`, starting with
   `await requireUser()`.

Putting the file inside the `(app)` group is what protects it — the group's
layout runs the auth check for everything beneath it.

> Give it a `bar` number and it appears in the bottom bar's scrolling strip,
> lowest first — the numbers are sort keys, not indexes, so moving a page along
> the strip is one edit. `bar: null` keeps it off the bar entirely, which is
> what the two *tools* do. Home is `bar: "home"` and is pinned outside the
> scroll; `navigation.test.ts` fails if a second page claims it.

---

## Rename or move a page

Done twice, for `/seating` → `/rotations` → `/turns`. It is five places, and
the last two are the ones that get forgotten:

1. `git mv src/app/(app)/<old> src/app/(app)/<new>`, and rename the page
   function inside it.
2. Update `href`, `label`, `title` and `description` in `NAV_ITEMS`
   ([`src/config/navigation.ts`](../src/config/navigation.ts)). The tab bar and
   the dashboard card both follow from there.
3. Update the page's `metadata.title` and its `<h1>` — they are separate
   strings from the nav config, deliberately, because a browser tab and a page
   heading are not always the same words.
4. Add a redirect to `next.config.ts` so bookmarks and home-screen shortcuts
   keep working — one per historical path, each pointing at the new one. Use
   `permanent: false`; see
   [Decisions](decisions.md#seats-became-turns-url-included).
5. **Bump `CACHE_VERSION` in `public/sw.js`.** Every cached page carries the
   tab bar, so a rename makes the whole cache stale, not just the page that
   moved.

Then `npm run check` — `navigation.test.ts` and `proxy-matcher.test.ts` both
name real paths and will point at anything missed.

> There used to be a sixth step here: adding the old path to `RENAMED_PAGES` in
> `lib/last-page-storage.ts`, so a device holding the old name in its
> "reopen where I was" memory followed the rename instead of silently
> forgetting. That memory is gone — the app launches on the dashboard every
> time — so the redirect in `next.config.ts` is now the whole of it.

---

## Change the app icon

1. Replace `assets/icon-master.png` — square, white mark on the brand blue,
   1024px or larger, opaque, artwork inside the central ~90%.
2. `npm run icons:generate` — regenerates all five PNGs plus `favicon.ico`,
   normalising the background to the exact brand colour and insetting the
   maskable variant automatically.
3. Bump `CACHE_VERSION` in `public/sw.js`, or installed devices keep the old
   icons indefinitely.
4. On iOS, delete and re-add the home-screen shortcut — it will not refresh
   its icon in place.

The in-app mark (login screen, seating header) is
`src/components/AppMark.tsx`, which renders the generated `icon-192.png`, so it
updates with everything else. See [PWA and offline](pwa-and-offline.md#icons).

---

## Change the login password

See [Authentication](authentication.md#changing-the-password). Short version:
delete the user document and re-run `npm run db:seed` with a new `SEED_USER`,
or write a fresh bcrypt hash straight into Atlas.

---

## Sign everybody out

Empty the `sessions` collection, or change `SESSION_SECRET` (which invalidates
every cookie at once). Either takes effect immediately — the cookie is only a
pointer to a session document.

---

## Change someone's name

[`src/config/family.ts`](../src/config/family.ts) → edit `name`.

Leave `id` alone — it is the key the rotation schedule and the tests refer to.

---

## Replace someone's photo

Drop the new file into **`assets/avatars/`** — not `public/` — named after the
person's id (`emily.png`). Square images work best; they are cropped to a
circle. Then:

```bash
npm run avatars:generate
```

That resizes it to 384px, writes it to `public/avatars/` under a
content-hashed name, and regenerates `src/config/avatar-manifest.ts`. Never
edit anything in `public/avatars/` or type a hashed filename by hand — both are
generated, and the hash changes every time the picture does.

> **If it still shows the old photo**, see
> [A replaced image still shows the old one](#a-replaced-image-still-shows-the-old-one).
> Short version: `npm run cache:clear`, restart, hard-reload.

---

## Replace a pet's photo

The same idea, a different folder and a different script. Drop a **cut-out**
PNG — the animal on transparency — into **`assets/pets/`**, named after the
pet's id (`bella.png`), then:

```bash
npm run pets:generate
```

It trims the transparent margin, centres the animal on the shared 828×552
canvas and writes a content-hashed file to `public/pets/`. The margin is
trimmed for you, so the master does not need cropping; the *pose* does matter,
though — if the new photo has the animal facing the other way, re-pick
`avatarSpot` in `src/config/pets.ts` so the child's face still lands on its
back. See [Pets](pets.md#the-photographs).

---

## Fix who has which pet tonight

One `updateOne` against `petRotations`, no deploy. See
[Pets](pets.md#re-anchoring) — the one rule is that the two animals must stay
at different places in the cycle, and the app refuses the configuration
outright if they do not.

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
