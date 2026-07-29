# Testing

```bash
npm test              # once
npm run test:watch    # while working
npm run test:coverage # with a coverage report
npm run check         # typecheck → lint → test
```

Vitest with jsdom and Testing Library. **191 tests across 9 files.**

## Coverage

| | |
|---|---|
| Statements | 94.6% |
| Branches | 81.2% |
| Functions | 97.9% |
| Lines | 96.4% |

What is *not* covered is mostly `typeof window === "undefined"` guards and
defensive `catch` branches that only fire in browsers that refuse storage —
paths that are real but not meaningfully reachable in jsdom.

## What each file covers

### `rotation.test.ts` — 27 tests
The date maths, which is where a seating app is most likely to be quietly
wrong.

- Every week 1–5 maps to the right schedule entry
- Week 5 wraps to Week 1; still correct 52 weeks out
- Rotates on Monday 00:00, **not** Sunday 23:59
- Every day of a week gives the same rotation
- Countdown copy: "Seats rotate today" / "New seats tomorrow" / "in N days"
- Dates before the start date: never a negative index, counts down to the start
  date rather than the next Monday, shows Week 1's real range
- Spring-forward and fall-back DST boundaries
- Year boundaries and leap years
- A malformed `ROTATION_START_DATE` throws in development and falls back to the
  current week in production
- A mid-week start date snaps back to its Monday

### `dates.test.ts` — 25 tests
The local-calendar primitives underneath the above: parsing, day counting,
week starts, midnight, formatting, and the `formatDateRange` separator that
must stay byte-identical between server and client.

### `schedule.test.ts` — 17 tests
Every hard fairness rule, plus the measured statistics.

- Exactly five weeks, five children each, each exactly once
- Every child occupies every position exactly once
- No child repeats a position in consecutive weeks, wrap included
- No week is a rotation or mirror of the previous one
- The validator rejects duplicates, stuck children and bad coverage
- **A naive clockwise rotation is shown to score worse** — the thing this
  schedule exists to avoid
- Adjacency counts are re-derived and asserted, not copied

### `seating.test.ts` — 26 tests
Geometry and configuration.

- No two avatars can overlap, at any screen size
- No name label collides with the avatar below it
- Everything stays inside the scene frame
- The longest name still clears its neighbours
- Both scenes use identical avatar sizing
- Every seat has an off-scene doorway; the table has two, the car four
- The arrival timing adds up to exactly 3000ms
- Parent swap exchanges both scenes and never touches the children
- Screen-reader summaries match the rendered assignments

### `scenes.test.tsx` — 17 tests (×2 scenes)
The two seating views, actually rendered.

- All seven people, each exactly once, at their configured coordinates
- Arrival delays are sequential, evenly spaced, and finish at 3000ms
- Parents arrive before any child
- Doorway offsets resolve back to the configured entry points
- Render order stays stable across a swap, so no animation is interrupted
- A swap moves the parents and leaves the children alone
- Only the parents arc, and only while a swap is in flight
- The accessible description matches what is drawn
- The backdrop is a local image

### `avatar.test.tsx` — 12 tests
Both rendering paths.

- Uses the photo when `imageSrc` is set
- Falls back to the illustration when it is not — every hair style and every
  accessory
- Identifying colours come from the family config, not the theme
- Gradient ids stay unique so two avatars cannot collide
- The name label can never resize the portrait *(the bug that made William's
  face bigger than Clara's)*

### `themes.test.tsx` — 25 tests
- Exactly ten themes, unique ids, every required token present
- Ocean is the default; Midnight is the only dark theme
- Storage: restores a valid theme, falls back for an invalid one, survives
  `localStorage` throwing
- The provider updates `data-theme` and writes to storage
- The picker shows all ten with exactly one checked, and closes on selection
- **The pre-hydration script is executed in a sandbox** and proven to apply
  valid themes, reject invalid ones, and swallow a storage failure

### `parent-swap.test.tsx` — 15 tests
- Defaults to the configured seats; restores a saved swap
- Toggles, saves, toggles back, survives a remount
- The `swapping` flag turns itself off after the glide
- Still works when `localStorage` refuses to save
- The button exposes `aria-pressed`, names both parents, and meets 44px

### `stores.test.ts` — 9 tests
The `useSyncExternalStore` contract for both preferences: a stable snapshot, a
server snapshot that matches what the server renders, subscriber notification,
and picking up a change made in **another tab**.

## Conventions

- `tests/setup.ts` clears `localStorage` and both store caches between tests,
  and polyfills `matchMedia` (jsdom does not implement it).
- Tests assert *measured* values rather than restating constants where it
  matters — the adjacency table and the arrival timing are both re-derived.
- Where a number is a genuine invariant (`6 × 430 + 420 = 3000`), the test
  asserts the relationship rather than the literal, so editing one constant
  without the others fails.

## What is not covered by tests

Verified by hand in a real browser instead, because jsdom cannot do it:

- Actual animation playback and timing *(measured: 1 avatar seated at 200ms,
  7 by 2900ms)*
- Layout at 320 / 390 / 1280px, and that nothing scrolls sideways
- Service worker registration and true offline reload
- Colour contrast *(scripted separately against the theme config)*
- That the seat coordinates land on the right part of each photograph
