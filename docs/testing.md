# Testing

```bash
npm test              # once
npm run test:watch    # while working
npm run test:coverage # with a coverage report
npm run check         # typecheck → lint → test
```

Vitest with jsdom and Testing Library. **316 tests across 18 files.**

Most files run in jsdom. The server-only modules opt into the Node environment
with a `@vitest-environment node` docblock, because that is where they actually
run — and because jsdom supplies its own `TextEncoder` whose `Uint8Array` comes
from a different JavaScript realm, which `jose` rejects when verifying a
signing key. `tests/setup.ts` guards its DOM cleanup on `window` existing so it
can run under both.

## Coverage

| | |
|---|---|
| Statements | 92.7% |
| Branches | 80.8% |
| Functions | 94.6% |
| Lines | 94.1% |

What is *not* covered is mostly `typeof window === "undefined"` guards,
defensive `catch` branches that only fire in browsers that refuse storage, and
**`lib/db.ts`** — the MongoDB connection itself, which the automated suite
deliberately never touches. Its error *translation* is covered indirectly
through the login action tests, and the connection is covered by
`npm run db:check` and the browser runs described below.

## What each file covers

### `rotation.test.ts` — 31 tests
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

### `seating.test.ts` — 30 tests
Geometry and configuration.

- No two avatars can overlap, at any screen size
- No name label collides with the avatar below it
- Everything stays inside the scene frame
- The longest name still clears its neighbours
- Both scenes use identical avatar sizing
- **The two scenes invert parent proximity** — the positions beside a parent at
  the table are exactly the third-row positions in the car
- Each child keeps the same side of the table and the car (bar the middle seat)
- Every seat has an off-scene doorway; the table has two, the car four
- The arrival timing adds up to exactly 3000ms
- Parent swap exchanges both scenes and never touches the children
- Screen-reader summaries match the rendered assignments

### `scenes.test.tsx` — 31 tests (×2 scenes)
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

### `session-token.test.ts` — 14 tests *(Node environment)*
The session cookie, which is the only thing between a stranger and the app. So
this is mostly about what it must **refuse**:

- Round-trips a session id, and does not leave it readable in the token
- Rejects: a missing cookie, an empty one, a non-JWT, a tampered signature, a
  payload edited to point at someone else's session, a token signed with a
  different secret, an expired token
- Rejects an unsigned **`alg: none`** token — the classic JWT forgery
- Refuses to run at all without a secret, or with one too short for HS256
- The cookie name is versioned; the session lasts 30 days

### `passwords.test.ts` — 12 tests *(Node environment)*
Real bcrypt, not a mock, so this file takes a few seconds.

- Accepts the right password, rejects the wrong one, never stores the plaintext
- **Salts** — the same password hashes differently every time, and both verify
- The cost factor is genuinely ≥ 12, asserted from the hash itself
- A malformed hash returns `false` rather than throwing
- **The unknown-email decoy does real work**, so a login for an address with no
  account is not measurably faster than one that has one
- Email normalisation: lowercase, trimmed, idempotent
- **Demonstrates bcrypt's 72-byte truncation** — two different passwords
  verifying against the same hash — which is why the form rejects longer input
  instead of silently cutting it

### `login-action.test.ts` — 12 tests *(Node environment)*
The sign-in Server Action, with the database and `redirect()` mocked. This is
where the app decides what a visitor is told, so every branch is pinned:

- Missing email, missing password, over-long password, over-long email — each
  rejected **without reaching the database**
- **An unknown email and a wrong password give a byte-identical message**, so
  the error text cannot be used to discover which addresses have accounts
- The email is echoed back to refill the field; the password never is
- A database outage says so, rather than blaming the password — and does not
  leak the connection string or driver internals to the browser
- A failed attempt never starts a session
- Success starts a session with the right user id and redirects to `/`

*(The mocked `redirect()` throws, as the real one does, so a bug that let the
action continue past it would fail rather than pass silently.)*

### `navigation.test.ts` — 17 tests
The nav config that the tab bar and the dashboard are both generated from:

- Unique routes, exactly one Home, at most one page per side slot
- Labels short enough for a tab; no more than the five a bottom bar can hold
- Bar order is left → home → right
- The dashboard lists every page except itself
- Nothing is advertised as "coming soon" that already exists
- Active-tab matching: exact for Home, sub-routes for the rest, and
  **`/seating` must not match `/seating-plan`** — the bug a naive `startsWith`
  would introduce

### `stores.test.ts` — 9 tests
The `useSyncExternalStore` contract for both preferences: a stable snapshot, a
server snapshot that matches what the server renders, subscriber notification,
and picking up a change made in **another tab**.

### `last-page.test.tsx` — 14 tests
Reopening the app on the page you were last using:

- A real page is stored and read back; `/login` and anything not in
  `NAV_ITEMS` is refused
- A **stale path from an older build is ignored**, so a deleted route cannot
  strand the app on a 404 nobody can clear
- Storage that throws (Safari private mode) degrades to "no memory", not a crash
- Landing on `/` redirects to the saved page; landing anywhere else does not
- The redirect does not overwrite the page it is redirecting to
- **Home stays reachable after a restore** — the once-per-page-load guard, and
  the one behaviour that would make the feature infuriating if it broke

### `mantras.test.ts` — 18 tests
The mantras config, where the risk is not a crash but a **misquotation**:

- Every quote has a named speaker, their calling, a titled source and a year
- Sources are restricted to `churchofjesuschrist.org` / `speeches.byu.edu` —
  a quote-aggregator URL fails, because that is how misattributions get in
- Only the four voices this family quotes are attributable at all
- **A mantra can never be identical to the quote beside it**, which would
  attribute the family's own phrase to an apostle
- No trailing ellipsis or stray quote marks — the tells of a stitched-together
  "quote"
- The mantra of the day: stable all day, changes at midnight, walks the whole
  list before repeating, wraps after a full cycle, and **never indexes off the
  front of the array for dates before 1970**

### `mantra-card.test.tsx` — 9 tests
The card, rendered:

- The mantra reads before the quote, and the quote is a real `<blockquote>`
  with a `cite` — what tells a screen reader whose voice is whose
- Speaker and calling are named; the talk link carries `noopener`
- Today's card is rendered **against a pinned clock**, so these do not quietly
  start failing tomorrow

### `calendar-ics.test.ts` — 26 tests
The iCalendar reader, against the shapes a real Google feed contains:

- **Line unfolding** — a folded `SUMMARY` rejoined across CRLF, LF and bare CR
- A **colon inside a quoted parameter** (`TZID="GMT+05:30"`), which is what
  breaks a naive `split(":")`
- Escapes: `\n`, `\,`, `\;`, `\\` — including that `\\n` is a backslash and an
  "n", not a line break
- All-day vs zoned vs UTC vs floating times, and that a trailing `Z` outranks
  any `TZID`
- **A `VALARM`'s own `DESCRIPTION` never becomes the event's**
- Malformed input degrades: an event with no `DTSTART` is dropped, complete
  rubbish returns no events rather than throwing

### `calendar-recurrence.test.ts` — 29 tests
`RRULE` expansion, which is where a wrong answer is silent and a family misses
a piano lesson:

- Weekly, daily, monthly and yearly, with `INTERVAL`, `COUNT` and `UNTIL`
- `BYDAY` ordinals (**last Friday**, **second Tuesday**), negative
  `BYMONTHDAY`, `BYSETPOS` (**last weekday of the month**)
- `BYDAY` × `BYMONTHDAY` intersecting — **Friday the 13th**, asserted against
  the three real ones in 2026 rather than against the implementation
- **`DTSTART` is always an occurrence** even when it does not match the rule,
  and rule days *before* `DTSTART` are not
- **Monthly skips short months**: the 31st produces nothing in February and
  does not clamp to the 28th
- Zone conversion either side of a daylight-saving change, and that a weekly
  3pm event **stays at 3pm** across it (167 hours apart, same wall clock)
- An unknown zone id degrades to a zero offset instead of throwing

### `calendar-events.test.ts` — 29 tests
Assembling occurrences, and the two mistakes that would matter most:

- **All-day `DTEND` is exclusive** — a trip written to the 9th ends on the 8th
- **An all-day date never passes through a timezone**, asserted by building the
  same event under `Pacific/Kiritimati` and getting the same date back
- `EXDATE` removes an occurrence; `RECURRENCE-ID` **moves** one without
  doubling it up; a cancelled override deletes one; `RDATE` adds one
- Every occurrence keeps the first one's duration
- Per-day lookup: multi-day all-day events on every day they cover, events
  running past midnight on both days, zero-length events on their own day
- Timing text for the four cases (`3–4pm`, `from 9pm`, `until 1am`, `All day`),
  including that an event ending **exactly at midnight** does not spill over

### `calendar-feed.test.ts` — 10 tests *(Node environment)*
The fetch-and-expand pipeline, end to end against a Google-shaped feed with
`fetch` stubbed:

- A real feed in, correct occurrences out — weekly expansion, `EXDATE`
  exclusion and exclusive all-day `DTEND` all in one pass
- **Unconfigured is not an error**: no variable, or a blank one, returns
  `unconfigured` and never calls `fetch`
- The fetch asks for Next's data cache rather than refetching per render
- Failure paths named rather than swallowed: 404, 403, an HTML error page
  served with a 200, and the network falling over
- **No failure message ever contains the secret URL**, asserted across every
  error path — including one whose underlying `Error` embeds it, since error
  text ends up in screenshots

### `calendar-board.test.tsx` — 16 tests
The three views, rendered:

- Opens on Week; Day and Month switch without a fetch
- The week is Monday-to-Sunday, and an event in the next week is absent
- Tapping a day in the week grid opens it in Day view
- Stepping forward and back, and **"Back to today"** appearing only once you
  have moved
- The arrows **disable at the window edge** rather than paging into emptiness
- An empty day says so; a truncated expansion says so
- Every event is built from local `Date`s, so the suite is correct in any
  machine timezone

## Conventions

- `tests/setup.ts` clears `localStorage` and both store caches between tests,
  and polyfills `matchMedia` (jsdom does not implement it). It no-ops entirely
  under the Node environment, where there is no `window`.
- Server-only modules are split so their pure half is directly testable —
  `passwords.ts` out of `users.ts`, `session-token.ts` out of `session.ts`.
  Neither half imports `server-only` or the MongoDB driver, so no test needs to
  mock a database to cover password hashing or cookie verification.
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

### `use-server.test.ts` — 2 tests *(Node environment)*
Reads the source of every `"use server"` module and fails if one exports
anything other than an async function.

This is a source-text check rather than a behavioural one because the bug it
guards is invisible to every other layer: `tsc` accepts it, `next build`
accepts it, and Vitest accepts it because it imports the module without the
`"use server"` transform. It only surfaces when a user submits the form — and
then it takes down the whole module, not just the offending export. See
[Authentication](authentication.md#a-use-server-module-may-export-only-async-functions).

### `proxy-matcher.test.ts` — 23 tests *(Node environment)*
Which paths the proxy runs on, asserted against the exported `config.matcher`.

The matcher used to name public folders one at a time, and `avatars/` was
missing — so every family photograph redirected to `/login`, and because
`next/image` fetches images server-side without the user's cookie, the
optimiser got a 307 instead of a PNG and returned 400. Every avatar rendered as
a plain coloured circle, and the build, the types and the whole suite were
silent about it.

- Every asset folder is skipped, `avatars/` named explicitly
- Any trailing file extension is skipped, so a *new* asset folder needs no code
  change — the property that makes the original mistake unrepeatable
- `/`, `/seating`, `/account`, `/login`, `/signed-out` and plausible future
  pages all still run the auth check
- A dotted path *segment* is not mistaken for an asset, so a nested page cannot
  silently lose its check

Verified against a live database and a real browser (Playwright, iPhone
viewport), after the cluster came back up:

- **Sign-in matrix** — correct credentials, wrong password, unknown email, both
  fields empty, either field alone, whitespace only, a 73-character password, a
  201-character email, and a differently-cased email. Each lands on the right
  page with the right message and only sets a cookie when it should. The
  browser's own `required` attributes are stripped first, so the *server-side*
  handling is what gets exercised.
- **The signed-in journey** — dashboard, all three tabs, a reload, sign out,
  and a protected page afterwards. No JavaScript errors.
- **Session revocation** — deleting the session document server-side while the
  browser keeps its cookie correctly lands on `/login`. This is what caught the
  `ERR_TOO_MANY_REDIRECTS` loop between `proxy.ts` and `requireUser()`.
- **Every image actually paints** — all 14 avatar `<img>` elements report
  `naturalWidth > 0`, with no failed requests. Counting names in the DOM was
  what let the coloured-circle regression through, since the names render
  whether or not the photograph loads.

Verified by hand against the running dev server rather than in the suite:

- **The proxy's redirects.** `/`, `/seating` and `/account` each 307 to
  `/login` when signed out (carrying `?next=`), `/login` returns 200, and
  `/manifest.webmanifest` and `/scenes/*.png` are correctly *excluded* from the
  matcher so a phone can install the app before signing in.

All of the above now runs against the real cluster, so nothing database-related
is left unverified.
