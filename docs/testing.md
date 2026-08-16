# Testing

```bash
npm test              # once
npm run test:watch    # while working
npm run test:coverage # with a coverage report
npm run check         # typecheck → lint → test
```

Vitest with jsdom and Testing Library. **1,306 tests across 61 files.**

Most files run in jsdom. The server-only modules opt into the Node environment
with a `@vitest-environment node` docblock, because that is where they actually
run — and because jsdom supplies its own `TextEncoder` whose `Uint8Array` comes
from a different JavaScript realm, which `jose` rejects when verifying a
signing key. `tests/setup.ts` guards its DOM cleanup on `window` existing so it
can run under both.

## Coverage

| | |
|---|---|
| Statements | 88.7% |
| Branches | 79.8% |
| Functions | 91.8% |
| Lines | 90.5% |

The star charts sit at **98%** of statements and 100% of functions across
`lib/stars` and `components/stars`; the weekly report is at 94% across
`components/report`, with `lib/stars/report.ts` — the arithmetic every slide is
built from — at 100%.

The aggregate is dragged down by files that are deliberately not unit-tested:
`proxy.ts` and the two API route handlers are thin wiring over modules that are
covered thoroughly, and they are exercised against a real server instead (see
the bottom of this page).

What is *not* covered, and why:

- **`src/proxy.ts`** — the edge middleware. Its matcher is covered exhaustively
  by `proxy-matcher.test.ts`; the handler itself needs a real edge runtime, and
  the check it performs is deliberately duplicated by the DAL, which *is*
  covered.
- **The MongoDB connection in `lib/db.ts`** — the pool itself is never opened
  by the suite. Its error *translation* and its missing-`MONGODB_URI` message
  are covered directly (`stars-server-safety.test.ts`); the connection is
  covered by `npm run db:check` and the browser runs described below.
- **A handful of `typeof window === "undefined"` guards and `catch` branches**
  in components that only fire in browsers that refuse storage. The equivalent
  branches in the modules the star charts depend on *are* covered, in Node, by
  `stars-server-safety.test.ts` and `months-and-storage.test.ts`.

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

### `pet-rotation.test.ts` — 18 tests
The nightly rotation, where the interesting risk is not a crash but a **rule
being quietly violated**.

- Both anchors match what the family said: Hannah had Bella and William had
  Leia on the night of 4 August 2026
- One child down the order each night, wrapping after five
- The same answer at 00:00, 07:00, 12:00, 19:00 and 23:00 — a rotation that
  turned over at some hour other than midnight would show one child at bedtime
  and a different one at breakfast
- It runs **backwards**, so past nights are answerable
- No slip across a daylight-saving boundary
- **Nobody gets both animals on the same night, simulated for five years** —
  and separately proved structurally by the offset argument
- The safety check rejects the three ways a configuration can go wrong: two
  pets on the same child, two pets the same distance apart via *different*
  anchor dates, and two pets on different orders
- Bad configuration throws with a message naming the pet

### `chore-rotation.test.ts` — 26 tests
The monthly chore rotation, where — as with the pets — the interesting risk is
not a crash but a **rule being quietly violated**.

- The August 2026 anchor matches the photograph of the chart, chore by chore
- The same answer on the 1st, the 15th and the 31st, and a **different** one on
  the 1st of the next month: it turns over at midnight on the 1st and at no
  other moment
- One place down the pool each month, and it **does not run backwards**: every
  month before the anchor is the anchor's month, because the printed chart did
  not rotate before then and guessing cost fourteen real stars
- **Every child holds every chore in their pool over one cycle**, and never the
  same chore two months running, checked across 24 months
- The chores are shared out as evenly as the counts allow
- The countdown counts real calendar months, including a leap February
- The validator rejects the six ways a set of pools can go wrong: a child in two
  pools, a chore in two pools, a chore in none, a chore that is not a task, a
  task that is assigned rather than rotated, and a nonsense anchor month

### `stars-config.test.ts` — 23 tests
The transcription and the counting.

- Unique ids, and ids free of dots — they become MongoDB field names, where a
  dot would be read as a path separator
- **Each child's row counts, off the three photographs**, one column at a time
- Hannah has the cello and nobody else; every child has the same four hygiene
  rows
- A sample of the exact printed wording, which is what catches a well-meaning
  tidy-up in review
- No child is ever given a chore from the other pool
- A row that was never ticked, or stored badly, reads back as five booleans
- Stars, whole rows and perfect charts are counted right — and an empty chart
  is not "perfect"

### `stars-board.test.tsx` — 30 tests
The chart on screen, with the Server Action mocked — it is a POST endpoint, not
a plain function.

- All three charts, five stars per task, one per weekday
- The chores that child has *this month*, and not the ones they do not
- Switching child switches the rows, chores included
- A star **fills before the server has answered**, and only that star
- The action is told which child, week, task and day — and is told a *value*
  rather than "flip it", so a retry cannot undo the tap it is retrying
- A whole row is celebrated the moment it completes, and the week's count
  follows every tap
- A failed write says so
- **Whose page it is, said in words** — the heading names the child, and it
  changes together with the backdrop
- **Confetti lands on the right thing**: nothing for an ordinary star, the
  card for a finished chart column, the whole page for a finished day — and the
  page burst *replaces* the card burst rather than joining it, since the last
  star of the day is also the last star of some chart
- Rubbing a star out celebrates nothing
- The cheer plays at full volume for a whole day and at 60% for one chart, is
  silent for an ordinary star, and is warmed on every tap — inside the gesture
  iOS requires before audio may start
- Switching the speaker off silences it and is remembered on the device, and
  the confetti still falls: muting the room is not muting the party
- The celebration is stated in words for anyone who cannot see paper fall, and
  the paper itself is out of the accessibility tree
- **No trace of the child you switched away from.** The header and the charts
  were once keyed on the same string, which React reads as duplicate sibling
  keys: it kept the outgoing header mounted, so Hannah's name sat above Clara's
  chart

### `stars-week.test.ts` — 12 tests
Which week a star belongs to, and which date the rotation is asked about.
Small module, disproportionate blast radius: the page renders from one of
these answers and the Server Action re-derives the same answer to decide
whether to accept the tick.

- Every day of a week names the same Monday, Sunday included — the classic
  `getDay()` off-by-one
- A week key that is not a Monday is refused, so no second offset set of
  documents can be opened for the same seven days
- Rubbish of every shape is refused: empty, `2026-8-3`, `2026-02-30`, a full
  ISO timestamp, a path traversal
- **A Sunday evening still belongs to its own week.** Comparing instants rather
  than calendar days put it *after* "Sunday" and fell back to the Monday, which
  on the Sundays that end a month named the previous month's chore owner

### `stars-tasks.test.ts` — 21 tests
Resolving three charts and a rotation into one child's list, and the pools
misconfigured in the ways real ones go wrong.

- The same list however it is sliced: whole, by section, by chart
- A child dropped from a pool keeps their hygiene and learning rows and simply
  has no chore that month — what a mid-month database edit looks like from here
- A pool of one, and a pool with more children than chores
- Throws name the pool *and* the bad value, for whoever has to fix it
- The countdown counts real calendar months, and never says "0 days"

### `stars-marks.test.ts` — 18 tests *(Node environment)*
The `starWeeks` store with MongoDB mocked.

- **The write is a pipeline, and its shape is asserted directly**: `$map` over
  `$range: [0, 5]`, so a missing row cannot be created as the object
  `{ "2": true }` that a dotted `$set` path would produce
- Rows are padded, trimmed, and coerced — `1`, `"true"`, `null` and `undefined`
  all read back as unticked
- A retired task is dropped rather than resurrected onto a chart
- A duplicate-key collision retries exactly once and succeeds; anything else
  propagates untouched
- An unreachable database shows an empty chart, not an error

### `stars-store-and-action.test.ts` — 30 tests *(Node environment)*
The chore-rotation store and the `setStar` Server Action — one boundary
between the database and the page, the other between the internet and the
database.

- Every way a stored pool can be malformed falls back without taking the page
  down, and says why in the log
- The action requires a session before anything else happens
- **It refuses a chore that belongs to a different child this month**, and
  accepts the same chore for the child who does have it — rendering a child's
  own tasks is a rendering decision, not a security boundary
- A failed write reports a message that does not leak the reason, while the
  reason goes to the log

### `stars-sound.test.ts` — 19 tests
The cheer, against a fake Web Audio stack.

- Fetched and decoded **once** however often it plays, but a fresh source each
  time, which is what lets two celebrations overlap
- Volume is clamped rather than blasting or inverting
- Silent — never throwing — with no Web Audio, a construction failure, a failed
  fetch, an undecodable file, or an autoplay policy that refuses `resume()`
- The preference defaults to on, only the exact string `"off"` silences it, and
  storage that throws changes neither

### `stars-report.test.ts` — 21 tests
The weekly report's arithmetic, which stores nothing and therefore has to be
right every time it is recomputed.

- The ceremony runs youngest first, and every child gets exactly one slide
- A chart is only "perfect" when every star on it was earned, and an empty
  chart never is
- **The report offers exactly the stars the live chart offers** — a report that
  inflated the denominator would quietly turn a perfect week into 90%
- **A week that has not finished is not reportable**, nor is one in October;
  the latest one holds for seven days and then steps once, at midnight on a
  Monday
- The latest week is listed even when nobody ticked a star in it, because
  "nobody earned anything" is a true report rather than a missing one
- Money is counted in cents and never prints a floating-point tail
- The praise on a thin week is neither a lie nor a telling off

### `report-store.test.ts` — 9 tests *(Node environment)*
The two reads the report adds to `starWeeks`, with MongoDB mocked.

- Eleven weeks are one `$in` query, not eleven round trips
- Every requested week comes back, so a week nobody ticked is a blank week
  rather than a missing key
- A document for a week nobody asked about is ignored
- An unreachable database costs the *history*, not the page

### `report-ceremony.test.tsx` — 17 tests
The award ceremony driving itself, and being driven.

- It waits on the title card and does not turn over until it has been started
- A child's slide holds for its whole choreography plus five seconds, then
  moves on — and the finale **stops** rather than looping, because a loop would
  take the ending away
- Dragging turns the slide past a fifth of the width, snaps back below it, and
  **leaves a vertical scroll alone**, which is what stops this being the one
  page in the app that cannot be scrolled
- A swipe starts the slides but never the music; only a button does that
- A device that has turned the sound off still gets the ceremony
- Leaving the page takes the music with it — otherwise the fanfare plays on
  over the star charts
- Off-stage slides are `aria-hidden` and `inert`

### `report-music.test.ts` — 12 tests
The fanfare, against a fake Web Audio stack. Everything here is about a *long*
sound, which fails differently from a short one.

- It loops, fades in, and fades out before stopping the source — cutting a
  sustained note dead is an audible click
- Starting it while it is playing is a no-op, so a slide turning cannot stack a
  second copy on top of the first
- **A stop that overtakes a start** — tap Start, leave immediately — does not
  leave an orphaned source playing to nobody
- One AudioContext, shared with the cheer

### `stars-accessibility.test.tsx` — 40 tests
Accessibility, kid-proofing and responsiveness, which are the same subject when
the user is four.

- Every star is a `switch` with a unique name saying task *and* day; all
  decoration is `aria-hidden`; every control is a real `<button>`
- **Twelve taps on one star in one frame** all ask for the same thing rather
  than landing on a coin flip — safe only because each call carries a value
  instead of saying "flip"
- Switching child mid-tap files the write against the child whose chart was
  open, not whoever is on screen when it lands
- Marks for a child who is not on the roster, and for a task that no longer
  exists, both render rather than throw
- 44px tap targets, one child at a time, long labels wrapping without pushing
  the stars off screen, and 280 vs 136 pieces of paper

### `months-and-storage.test.ts` — 15 tests
Month arithmetic and the four device preferences.

- `differenceInCalendarMonths` ignores the day entirely, which is what makes
  the chore rotation turn over at midnight on the 1st and at no other moment
- Every preference survives a `localStorage` that throws, as Safari private
  mode does
- A stored theme that no longer exists, and a page that has been renamed, both
  fall back rather than pinning a device to something broken

### `stars-server-safety.test.ts` — 9 tests *(Node environment)*
The browser-only modules, imported where there is no browser — the failure that
happens in production, on the server, where nobody is watching a console.

- Sound preference and playback are inert without a `window`
- Atlas's opaque connection errors are translated: the TLS handshake rejection
  that really means an IP allowlist problem, bad credentials, a paused cluster
- A missing `MONGODB_URI` throws synchronously, and says what to do about it

### `hooks-and-clearing.test.tsx` — 16 tests
The hooks that decide *when* things happen.

- `useCurrentDate` rolls over at local midnight and keeps rolling on the days
  after — this is an installed PWA people leave open for days
- It catches up on `visibilitychange` and `focus`, because phones freeze timers
  in background tabs and the midnight timer may simply never fire
- It returns the *same* `Date` object when only the time changed, so a stray
  visibility event cannot restart every animation on the page
- `useImagesReady` treats a broken image as settled and gives up after its
  timeout: an empty table because one file 404'd is worse than an early walk-in

### `pet-nights.test.tsx` — 6 tests
The two cards, rendered:

- The child the rotation names is the child pinned to that animal, tonight and
  the night after
- **Every night of a full cycle, through the rendered output** — the wiring is
  as capable of breaking the one-child-one-animal rule as the maths is
- Whose turn it is tomorrow is stated on the card
- Each pet's photograph is the optimised, content-hashed file, and the hashed
  filename survives `next/image`'s rewrite
- The avatar lands at the spot configured for that animal

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

### `navigation.test.ts` — 22 tests
The nav config that the tab bar and the dashboard are both generated from:

- Unique routes, exactly one Home, and Home never in the scrolling part
- Labels short enough for a tab, which is a fixed 68px in the strip
- The strip comes out sorted by its place, Stars first and Account last
- The dashboard lists every page except itself
- **Every page has a tab now that the bar scrolls** — an absent page is an
  omission rather than a considered trade-off
- **No tool has one**, even though there is room. A tab is a claim that
  somewhere is a place you go back to, and for a scribble pad it is the wrong
  claim
- **Pages and tools together are exactly the dashboard** — the two sections are
  a rendering decision, not a second source of truth
- **The page list stays at eight or fewer**, which is the point past which
  Account falls below the fold on the dashboard
- Nothing is advertised as "coming soon" that already exists
- Active-tab matching: exact for Home, sub-routes for the rest, and
  **`/turns` must not match `/turns-plan`** — the bug a naive `startsWith`
  would introduce

### `stores.test.ts` — 9 tests
The `useSyncExternalStore` contract for both preferences: a stable snapshot, a
server snapshot that matches what the server renders, subscriber notification,
and picking up a change made in **another tab**.

### `last-page.test.tsx` — 21 tests
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
- **A tool is not somewhere you were.** `/note` and `/picker` are neither
  remembered nor allowed to overwrite what is, so opening the Note from the
  Calendar still reopens on the Calendar

### `health.test.tsx` — 15 tests
The five healthy lists, where the risk is not a crash but a **quiet rewrite**.
The words are a transcription of paper on a wall, so the tests hold it in place:

- Every list is the length the sheet is, and the five come in the page's order
- Each sheet's heading, and its first and last line, word for word
- The lines an editor would itch to fix stay as printed — `M-F`,
  `3x week`, and **`Remember we all make mistakes, and its ok`**
- Typographic apostrophes only, the single change the transcription allows
- Our own `blurb` and `intro` can never be rendered as one of their items
- An unknown id returns `undefined`, so a mistyped URL 404s instead of quietly
  showing the wrong sheet
- The card links to its own list and states the count; the drawing is hidden
  from screen readers; the list is a real `<ol>` rather than typed-in numbers

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
- **Occurrences in `DTSTART`'s own period** — the regression suite for a bug
  that lost real events: expansion began at the period *after* `DTSTART`, so
  `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH` starting on a Monday emitted only that Monday
  and jumped a week. Covered for week, month and year, plus that `DTSTART` is
  still never emitted twice
- **Long-lived series reach the window** — a daily rule running since 2010 and a
  weekly one since 2015 both arrive at an August 2026 window, guarding the
  period cap that would otherwise drop them silently
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

### `calendar-layout.test.ts` — 23 tests
Placing events on the hour grid — the timeline's hard part:

- Vertical placement as a fraction of the day, with a **20-minute minimum** so
  a short reminder is not an unreadable hairline
- Events crossing midnight clipped to each day's column, flagged
  `continuesFrom` / `continuesInto`, and a day wholly inside a long event
  filling its column
- Overlap packing: two colliding events split into two columns; events that
  merely *touch* share one; a busy morning does not narrow a lone evening event
- **Column reuse** — the real Monday (airport run, flight, babysitting) is
  three events in **two** columns, because the 6:30 finish frees a column
  before 8
- Longer event on the left when two start together
- A brute-force pass over a messy day asserting the invariant the whole
  algorithm exists for: **no two overlapping events ever share a column**
- `firstInterestingHour` opens an hour above the earliest event, ignores a
  block running in from yesterday, and falls back on an empty day

### `calendar-board.test.tsx` — 24 tests
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

The list/timeline toggle:

- Starts on list; switches Day and Week to the hour grid and back
- **The choice survives moving between Day and Week** — it is a property of the
  calendar, not of the view
- Hidden on Month, which has no time axis to draw
- All-day events still render in timeline mode, above the axis rather than on it
- A column heading opens that day, still in timeline mode

### The family-context API — 9 files *(Node environment)*

`family-api-auth`, `family-api-sanitise`, `family-api-time`,
`family-api-family`, `family-api-context`, `family-api-rate-limit`,
`family-api-route`, `family-api-openapi`, `family-api-data-health`.

Covered in detail in [docs/family-api/testing.md](family-api/testing.md). The three
worth knowing about from here, because they are unusual:

- **`family-api-context`** serialises the whole response and greps it for
  seventeen forbidden strings — `_id`, `password`, `mongodb`, `@`, `street` and
  the rest. A *future* field that leaks one of them fails this test even though
  nobody wrote a test for that field.
- **`family-api-openapi`** compares the committed Action schema byte for byte
  against what the generator produces, so `npm run check` fails if somebody
  changes the response shape without running `npm run api:openapi`. It also
  asserts the route modules export exactly `GET` and `HEAD`, which is what
  makes "there is no write endpoint" a checked property rather than a promise.
- **`family-api-sanitise`** tests the injection filter from *both* directions: the
  attack shapes are removed, and every real star-chart label in
  `config/stars.ts` passes through unchanged. The second half is the one that
  matters — a sanitiser that quietly mangles "Feed Bella" is a bug nobody finds
  for months.

### `bored.test.tsx` — 61 tests
The Bored Page, where the interesting risk is not a crash but **a picture that
never arrives**. `BoredArt` returns null for an unknown id rather than throwing
— the right runtime behaviour, since a gap on a page beats a blank page on the
one page a child opens when they are already fed up — which means a typo'd id
would ship silently as an empty square with a word under it. On the page whose
whole premise is that the word is optional.

So the suite walks every idea in the config and asserts a drawing exists, and
walks every drawing and asserts an idea still uses it. It also pins the page's
one design rule — every label four words or fewer, every category title one
word — which is what cut "Do a load of laundry" down to "Do a load". Plus the
Dad Bucks contract: cheapest first, no gap wider than two, and the five prices
the family had already set.

### `note-strokes.test.ts` — 42 tests
The Note's model, which is the half of that page nobody can check by looking at
it. Three groups matter:

- **The pad is not square.** `y` runs 0-1 over a sheet two-thirds as tall as it
  is wide, so every measurement corrects for the aspect ratio. A test pins the
  full height of the pad at two-thirds of a width — without it the eraser
  under-reaches downwards by a third and nobody can say why.
- **The eraser measures to segments, not points.** An underline drawn as two
  points has nothing in its middle to find; the test rubs at exactly that spot.
  It also asserts that rubbing at blank paper returns the *same array object*,
  because the pad compares by identity to decide whether to push an undo entry
  — a fresh array would put fifty identical states on the stack per wipe.
- **A stored note can be anything.** Truncated JSON, a version from a future
  build, a `1e999` that `JSON.parse` turns into `Infinity`, a tool that no
  longer exists. Every one of them must mean "blank pad" or "one stroke fewer",
  never a crash on a page whose only job is to show a message to a child.

Plus the storage format's two promises: inks and nibs stored by *id* so the
palette can be re-tuned under notes already written (asserted by there being no
`#` anywhere in the output), and a thousand points fitting in under 40KB.

And `fitPad`, which sizes the sheet to whatever the heading and the tray leave
behind. Every case checks two things at once — that the sheet is the right
*shape*, and that it is the biggest one of that shape which fits — because
"fits" alone is satisfied by a stamp in the middle of an empty screen. It also
pins the rounding: a sheet a fraction of a pixel wider than the box that
measured it makes that box report smaller on the next frame, which is a resize
loop that never settles.

### `note-store.test.ts` — 21 tests
The pad's actual promise — that a note written today is there tomorrow:

- The debounce writes **once** for a burst of strokes, and can be flushed
  immediately when the iPad's lid comes down
- A device that refuses to save (quota, storage off) leaves the note on screen
  and says so, rather than quietly losing it
- The server snapshot is the **same object every time**, which is the
  `useSyncExternalStore` contract and an infinite render loop when broken
- Undo and redo do not record the moves they make, so undo can still reach the
  beginning; anything new throws the redo stack away
- **Clear removes the stored copy at once** — not on the debounce — and is
  still one Undo away, which re-saves it

### `picker-board.test.tsx` — 9 tests
The round, under hands that come and go — the rule the component owns rather
than `game.ts`:

- **The deadline does not move.** A finger arriving two seconds in does not buy
  everybody a fresh five, and — the bug this file was written for — neither
  does the last finger leaving and coming back
- The number keeps falling while nobody is touching the screen at all, and the
  instruction line comes back so that reads as an invitation rather than a fault
- **The draw is made from whoever is down at zero**, not at the start: a child
  who starts the round and gives up on it is not in it, and one who arrives with
  a second to spare is
- A round that ends on an empty screen crowns nobody, returns to waiting, and
  gives the next finger a full five seconds of its own

Driven with real `touchstart` / `touchend` payloads and fake timers, because
every one of these is a question about *when* rather than about markup.

### `finger-picker.test.ts` — 21 tests
The draw settles arguments between five children, so fairness is checked rather
than assumed:

- A hundred thousand rounds land within a percentage point of a fifth each
- It can never return an index that is not on the screen, including for a
  `random` of exactly 1 — `Math.random()` is documented as below it, but a
  picker that can crash at a birthday party should not depend on that
- `-1` when every finger lifted before the buzzer, so nobody wins by absence
- The countdown holds each number for its whole second and never shows more
  than it started with, even if the tab was suspended and the clock jumped
- The flood covers **every corner from every starting point** — the wedge of
  background left by measuring to the nearest corner is the bug this catches

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
- `/`, `/turns`, `/account`, `/login`, `/signed-out` and plausible future
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

- **The proxy's redirects.** `/`, `/turns` and `/account` each 307 to
  `/login` when signed out (carrying `?next=`), `/login` returns 200, and
  `/manifest.webmanifest` and `/scenes/*.png` are correctly *excluded* from the
  matcher so a phone can install the app before signing in.

All of the above now runs against the real cluster, so nothing database-related
is left unverified.
