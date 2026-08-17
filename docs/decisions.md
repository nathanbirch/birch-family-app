# Decisions

The calls that are not obvious from reading the code, and why they were made.

---

## The app left GitHub Pages because a login cannot be static

This shipped for months as a static export on GitHub Pages. Adding a login
ended that: comparing a bcrypt hash, setting an `HttpOnly` cookie and holding a
database connection string all require a process that runs when the request
arrives, and a static host has none. Doing any of it in the browser would mean
shipping the hash or the connection string to the browser.

So the move to Vercel was forced by the feature, not chosen for its own sake.
Nothing about the seating rotation needed to change. See
[Deployment](deployment.md).

---

## Its own database, not prefixed collections

The Atlas cluster is shared with other apps. Rather than scattering
`birchfam_`-prefixed collections through a database someone else owns, this app
claims `birch_family_app` outright and resolves it in exactly one function
(`getDb()`). The connection string has no database path, so there is no default
to accidentally fall back to, and no code path reaches another database.

Prefixes would have relied on everyone remembering the prefix forever. This
relies on nothing.

---

## The session cookie is a pointer, not the session

The cookie holds a signed JWT whose whole payload is a session id; the session
itself is a MongoDB document. A self-contained JWT would have been simpler and
saved a query per request — but it cannot be revoked. Signing out, or kicking a
lost phone off the app, would be impossible until the token expired.

The cost is one indexed lookup per protected request. The benefit is that
deleting a row signs a device out instantly. For a family app where a phone
gets lost or handed down, that is the right trade.

---

## Two auth checks that do different jobs

`proxy.ts` verifies the cookie's signature and redirects. `requireUser()` loads
the session from the database. The proxy deliberately does **not** query Mongo,
because it runs on every request including prefetches — a query there would be
paid for every page a user merely hovers, and every navigation would be as slow
as the cluster.

The rule that falls out: the proxy is a fast, fallible convenience; the data
access layer is the authority. Never move a security decision into the proxy.

---

## An unknown email costs the same as a known one

`authenticate()` runs a bcrypt comparison against a decoy hash when no user
matches, and the error text is byte-identical for "no such user" and "wrong
password". Both exist so that neither response time nor wording reveals which
email addresses have accounts.

The decoy hash is generated at runtime rather than hardcoded: `bcrypt.compare`
returns `false` almost instantly against a malformed hash, so a typo'd constant
would silently reintroduce the exact timing gap it was there to close.

---

## The bottom bar, not a top bar or a drawer

This is used one-handed on phones. The top of a modern phone screen is out of
comfortable thumb reach, which is why both iOS and Android put primary
navigation at the bottom. A bottom bar also survives the on-screen keyboard and
the browser chrome that hides and reappears while scrolling; a sticky top bar
does not. A drawer hides the app's structure behind a tap, which is the wrong
trade when there are only three destinations.

Home sits in the centre because it is the anchor you return to, and the centre
is the easiest point on the bar to hit without looking.

---

## The roadmap is rendered in the app

Chore charts, rewards, stars, mantras and the calendar appear on the dashboard
as muted "coming soon" cards, driven by `PLANNED_FEATURES`. They are not links
and not buttons — a tappable card that does nothing is worse than an honest one
that says so.

This keeps the app truthful about what it is today, and doubles as the to-do
list for whoever picks the project up next. Delete an entry as you build it.

---

## Seating is derived, never stored

There is no "current seating" anywhere. It is computed from the start date, the
device's local date, and the schedule. Nothing to save, nothing to sync,
nothing to go stale, and two phones always agree.

---

## A weekly report is derived too, and it ends on a number nobody earned

There is no `reports` collection. A report is the week's `starWeeks` documents
counted through the same functions the live chart counts with, so it cannot
drift from the charts, a star corrected on Saturday night is in Sunday's
ceremony, and there is nothing to publish on a Sunday afternoon.

The other half of the decision is editorial rather than technical. The ceremony
runs youngest first and finishes on the **family's** total. Five slides of
individual numbers is five children being ranked whether or not anybody says
so — the eldest has the most rows on her chart and the four-year-old cannot
win. The family total is the only number on the page that goes up when somebody
else does well. See [the weekly report](report.md).

---

## The schedule is a Latin square, not a rotation

A clockwise shift satisfies the coverage rule but moves the whole group
together, so the same children sit next to each other every week forever. A
Latin square with mixed rows makes "every child gets every position exactly
once" and "no child repeats a position in consecutive weeks" **structural
properties** rather than things to hand-check.

The specific square was picked by exhaustive search over all 1344 candidates.

---

## The car's seat numbers are inverted against the table's

One position number means one child in both scenes. Numbered the obvious way —
front-to-back in the car, top-to-bottom at the table — that makes the child
beside a parent at dinner the child beside them in the car too, the same child
all week. Inverting the car's numbering makes the two scenes opposites instead:
beside a parent at the table means the third row in the Expedition.

The adjacency data follows the physical seats rather than the numbers, so the
fairness analysis is unaffected by the relabelling. See
[Family and seats](family-and-seats.md#the-inverted-numbering).

---

## Perfect evenness, at a floor of five repeated adjacencies

The inversion above constrains the schedule search: sweeping all twelve legal
position-to-seat mappings against all 720 candidate schedules, none reaches
zero repeated adjacencies any more. Five — exactly one sibling pair carried
across each transition, a different pair each time — is the floor.

The priority order is unchanged ("minimise repeated adjacency" first, then
"distribute evenly"); the first criterion simply bottoms out higher now. Among
the schedules that hit the floor, the chosen one is also perfectly even: every
sibling pair exactly 3 side-by-side seatings. The previous zero-repeat schedule
ran a 2-or-4 spread and could never have had that.

The docs state both numbers, because that is what the data shows.

---

## Dates are normalised to local noon

A DST day is 23 or 25 hours long. Counting days from midnight can round to the
wrong integer; counting from noon cannot, because noon-to-noon is always within
11–13 hours of a multiple of 24.

Related: `YYYY-MM-DD` is parsed by hand rather than with `new Date(string)`,
which would read it as UTC midnight — the previous evening in the Americas, and
the classic cause of a schedule flipping on Sunday night.

---

## One client island, not a client app

`SeatingBoard` is `"use client"` because the assignments depend on the
*device's* local date and must roll over at local midnight without a reload.
That is a real requirement, not a convenience. Everything above it stays on the
server, and the first paint already shows real seats before any JavaScript runs.

---

## Preferences use `useSyncExternalStore`, not `useState` + `useEffect`

The theme genuinely lives outside React: a pre-hydration script has already
applied it to `<html>` before React starts. Modelling it as external state is
what avoids both a cascading `setState`-in-effect and a hydration mismatch —
the server snapshot is the default, the client snapshot is the stored value,
and React reconciles once.

Module-level stores also mean the header button and the seating board share one
source of truth with no context provider.

---

## Sizes in `cqh`, not `cqw` or pixels

Both photographs are portrait. Sizing avatars off container *width* makes them
far taller than the gap between rows, because height is 1.5× width. Container
*height* units size correctly in both dimensions.

A side effect worth having: because both scenes share one aspect ratio and one
set of size constants, an avatar renders at exactly the same pixel size in both
cards at every screen width.

---

## Seats are keyed by person, rendered in roster order

Keying by person is what lets a parent **glide** to the other seat instead of
blinking into it — React keeps the element and only `left`/`top` change.

Rendering in roster order (which never changes) means a swap reorders no DOM
nodes, so no animation is interrupted mid-flight. Arrival order is tracked
separately as an index.

---

## The theme picker is portalled to `document.body`

The cards run entrance animations, which give them stacking contexts. A panel
left inside the header is painted underneath them no matter what z-index it
carries. This was a real bug before it was a decision.

Related: the header's entrance animation is opacity-only, with no transform,
because a transformed ancestor becomes the containing block for `position:
fixed` descendants and would pin the mobile bottom sheet to the header.

---

## Hand-written service worker

The app is one page with no API calls. `next-pwa` and friends are more moving
parts than the feature needs. ~90 lines of network-first-for-navigations and
cache-first-for-everything-else covers it, and it is readable in one sitting.

It is registered only in production builds — caching in front of the dev
server's constantly changing assets causes nothing but confusion.

---

## No install button

Installability cannot be detected reliably across browsers, and a button that
does nothing on iOS is worse than no button. The per-platform steps are
documented instead.

---

## Icons are generated, not committed as art

`scripts/generate-icons.mjs` draws the mark with maths and encodes PNGs with
Node's built-in `zlib`. No image tooling, no binary blobs to re-cut by hand, and
changing the brand colour is a one-line edit followed by one command.

---

## Photographs over illustration — but the illustration stayed

The app originally shipped illustrated SVG avatars and hand-drawn scenes. Real
family photos are better in every way for the people who use it.

The illustrated path was kept as a working fallback rather than deleted: remove
someone's `imageSrc` and their character comes back. It is fully tested, so it
cannot rot.

---

## Two persisted preferences, both device-local

Theme and parent-swap. Neither syncs. Originally that was forced — there was no
server. There is one now, so it is a choice: both are properties of the device
you are holding rather than of the account, and the seating app is used on
several phones at once. That is stated plainly in the UI docs rather than left
for someone to discover.

Both are stored under versioned keys (`…:v1`) so a future format change can be
migrated or ignored cleanly. Their keys still carry the old
`birch-family-seats` prefix after the rename, because changing them would
silently reset every device's saved preferences.

---

## Tests assert relationships, not literals

Where a number is a genuine invariant — `6 × 430 + 420 = 3000`, or the
adjacency counts — the test derives it rather than restating it. Editing one
constant without the others fails the build instead of quietly drifting away
from the documentation.

---

## "Seats" became "Turns", URL included

The page held one thing — where everyone sits, changing on Mondays. Then it
grew a second — which animal each child sleeps with, changing nightly — and
"Seating Rotation", the "Seats" tab and `/seating` all described half of it.

It was briefly **Rotations**, which was accurate and wrong: correct about the
mechanism, and not a word anyone in this house says out loud. **Turns** is what
the family already calls it, and it is the version a six-year-old reads without
help. The tab is `Turns`, the page and card are `Whose Turn`, and the page now
opens by saying what that means — "seats change every Monday, Bella and Leia
change every night" — because a short title is not the same as a clear one.

Three decisions inside that are not obvious:

- **The route moved too, even though URLs are cheap to leave wrong.** Nobody
  outside the family will ever see it, but the family will: the path is what
  appears in the address bar of the installed app and in anything anyone
  shares. A URL that contradicts the page it opens is a small, permanent lie.

- **The redirects are temporary (307), not permanent (308).** A 308 is cached
  by the browser more or less forever, and the usual reason to accept that —
  SEO — does not exist here: the whole app is `noindex` and behind a login, so
  no crawler has ever seen any of these URLs. All a permanent redirect would
  buy is one saved round trip, in exchange for a rule no device could be told
  to forget. Having renamed this page twice is the argument, not against it.

- **The app always launches on the dashboard.** It used to reopen on whichever
  page you were last using, with a saved path that was validated against
  `NAV_ITEMS` and migrated through a rename table so a device holding `/seating`
  followed it to `/turns`. All of that is gone. Reopening on last week's
  ceremony, or on Tuesday's star chart, is a guess — and the dashboard is the
  one screen that is never the wrong answer.

  Nothing replaced it. The PWA's `start_url` is `/`, so a launch lands there by
  itself; and an app that was only *backgrounded* is handed the same document
  back by the OS, still on the same page, with no reload. "Launch on Home,
  resume where you were" is what those two behaviours already do once the
  component stops overriding the first of them.

- **Read-only, structurally.** The route modules export `GET` and `HEAD` and
  nothing else. The AI cannot write a star, a chore or a calendar event, which
  was a non-negotiable in the Option D requirements and is enforced here by the
  absence of code rather than by a check.
- **Least privilege.** A separate credential granting this one endpoint. A
  projection that names every field it emits, so no database document can leak
  through it.
- **The staleness objection answered rather than inherited.** Option B was
  rejected because it degrades *silently*. This API carries `generatedAt`,
  `lastUpdatedAt`, a freshness status and a list of degraded sources, and the
  GPT is instructed to say so and point at the app. Staleness that announces
  itself was the whole complaint.
- **Sanitisation and bounds are real, not aspirational** — the phrase
  [13](ai/13—birch-ai-integration-architecture.md) used for what Option D would
  buy. They run server-side before the response is built.
- **Nothing in the supervision model moved.** One shared parent account, the
  tablet in the living room, no child with an account, memory off. The Action
  changes what the assistant *knows*, not who is in the room.

**What is genuinely worse than Option A**, stated plainly: there is now a URL on
the public internet that returns five children's chores and a week of the family
calendar to whoever holds a 43-character string. Option A had nothing to steal.
That trade is the decision, and if it starts to feel like the wrong one, the
reversal is one environment variable —
[`operations-runbook.md`](family-api/operations-runbook.md#emergency-shut-it-off-now).

---

## The chores swap weekly, and the anchor is the week the swap began

The chores used to rotate on the first of the month, three children in one pool
and two in another. They now swap every Monday morning between two pairs —
Hannah and Emily, Clara and William — and James, who is in no pair, keeps his.
That much is the family's call, not an engineering one. Three things about
*how* it landed are not obvious from the code:

**The anchor is 10 August 2026, not the week of the photographs.** The anchor
is defined as a week whose answer is known, and the rotation clamps at it —
every earlier week uses the anchor's deal. Because the chores rotated monthly
right up to that Monday, the anchor's deal *is* what every week already in the
database was worked from, so no star that has been earned changes hands. Had
the anchor been set back to the photographs in early August, this week would
have swapped a fortnight of stars onto the wrong children.

**The anchor must be a Monday, and the validator says so.** A Wednesday anchor
would still "work" — it would just quietly move the changeover to Wednesdays,
which nobody would notice until a chore vanished mid-week.

**Saturday counts, Sunday does not, and the width is anchored to a date.**
The charts ran Monday to Friday until 17 August 2026. Making the constant a six
would have been one character and would have quietly rewritten every week
already earned — not the stars, which are stored per day and do not move, but
everything measured *against* the width of a week. A July row filled all the
way across would have stopped being filled; every past `possible` would have
grown by a fifth, so every past percentage would have fallen; and a perfect
week would have been downgraded to "What a week!" for a Saturday nobody was
ever offered. The first ceremony to run under the change covered a
Monday-to-Friday week, so that was not hypothetical.

So the width is a property of the *week* (`starDayCount`), anchored at
`SATURDAY_FROM_WEEK`, exactly as the rotation start date and the chore anchor
are. Rows are still stored six wide whatever week they belong to, so one shape
comes out of the database and a narrower week simply never looks at its last
column.

**Sunday is the awards day, so it has no column at all.** A chart that could
still be filled in during the ceremony is a chart the ceremony cannot be
trusted to have counted. It also moved when a ceremony is published: a week now
ends on Saturday night, so `latestCompletedWeekStart()` steps at midnight on
Sunday rather than on Monday. Left alone, the family would have sat down on a
Sunday afternoon to watch a ceremony the app did not think existed yet.

**A ceremony is named by the Sunday it is held on**, not by the week it covers.
"Sunday, August 16" is what somebody says; "Aug 10 – Aug 15" is what a
spreadsheet says. The URL is still the week's Monday and every slide still
shows the week — only the headline changed.

**`referenceDateFor()` was deleted rather than kept.** It existed to answer
"which date should the rotation be asked about for this week?", because a
Monday-to-Friday week could straddle the first of the month and the live chart
had to show whoever held the chore *now*. A weekly swap makes a week a whole
number of rotations, so every day in it gives the same answer, and the chart,
the Server Action and the ceremony now all ask about the week's own Monday. The
countdown asks about today instead — that is a different question, and it was
worth separating the two rather than keeping one date that meant both.

**James's chore became `fixed`, not a pool of one.** A one-child pool would
have rotated correctly and said nothing true: `fixed` is the app's existing
word for "this moves when we decide it moves, not when the calendar does."
