# Decisions

The calls that are not obvious from reading the code, and why they were made.

---

## Seating is derived, never stored

There is no "current seating" anywhere. It is computed from the start date, the
device's local date, and the schedule. Nothing to save, nothing to sync,
nothing to go stale, and two phones always agree.

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

Theme and parent-swap. Neither syncs, because there is no server. That is
stated plainly in the UI docs rather than left for someone to discover.

Both are stored under versioned keys (`…:v1`) so a future format change can be
migrated or ignored cleanly.

---

## Tests assert relationships, not literals

Where a number is a genuine invariant — `6 × 430 + 420 = 3000`, or the
adjacency counts — the test derives it rather than restating it. Editing one
constant without the others fails the build instead of quietly drifting away
from the documentation.
