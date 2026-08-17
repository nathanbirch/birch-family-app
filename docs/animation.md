# Animation

> **Nothing starts until the avatars have loaded.** The whole arrival sequence
> below is held back until every photograph in the scene has decoded, so
> people never walk to their seats as empty circles. See
> [PWA and offline](pwa-and-offline.md#nobody-moves-until-the-photographs-have-loaded)
> for how, and why the hiding happens before first paint rather than in React.

Two movements, and nothing that loops. Once the arrival settles, the page is
still.

## Arrival

On load — and again whenever the rotation rolls over to a new week — everyone
walks in through a doorway and takes their seat, one person at a time, over
exactly **three seconds**. The table and the Expedition run off the same clock,
so the two cards fill up in step — and so does the Family Home Evening house
below them, which fills from the top floor down.

### Doorways

Defined in [`src/config/seating.ts`](../src/config/seating.ts). Each seat
declares the doorway it is reached through.

**Dinner table** — two entry points, one at the head of each bench, so everyone
files down their own side of the table.

```ts
TABLE_ENTRIES = {
  leftBench:  { x: 24, y: -18 },
  rightBench: { x: 80, y: -18 },
}
```

**Ford Expedition** — four, one per door. The front seats come in through the
front doors; the second and third rows come in through the rear door on their
own side, with the middle seat climbing in behind the driver.

```ts
VEHICLE_ENTRIES = {
  frontLeft:  { x: -18, y: 38 },   frontRight: { x: 118, y: 38 },
  rearLeft:   { x: -18, y: 64 },   rearRight:  { x: 118, y: 64 },
}
```

**The house** — three, in
[`src/config/fhe.ts`](../src/config/fhe.ts). Everyone arrives for
[Family Home Evening](family-home-evening.md) through whichever door is nearest
their room: the left end of the house, the right end, or the front door in the
middle.

```ts
FHE_ENTRIES = {
  left:      { x: -16, y: 50 },
  right:     { x: 116, y: 50 },
  frontDoor: { x: 50,  y: 122 },
}
```

The house runs the same three-second clock as the two seating scenes, off the
same constants below, but it waits on its own photographs and its own week: it
turns over on Sunday rather than Monday, so tying its walk-in to the seating's
readiness watch would mean one of the two changeovers arriving with nobody
moving.

Entry points sit **outside** the 0–100 scene box on purpose: the scene frame
clips its contents, so nobody is visible until they step through the doorway.
A test enforces that every doorway is off-scene.

### Timing

```ts
export const ARRIVAL_TOTAL_MS = 3000;
export const ARRIVAL_STEP_MS = 430;     // gap between one person and the next
export const ARRIVAL_DURATION_MS = 420; // how long one person takes to walk in
```

The last of the seven starts at `6 × 430ms` and travels for `420ms`, which
lands the sequence on three seconds exactly. A test enforces that relationship,
so changing one number without the others fails the build rather than quietly
drifting. A second test asserts `DURATION ≤ STEP`, which is what makes the
sequence read as a queue rather than a crowd.

Measured in a real browser: 1 person seated at 200ms, 2 at 650ms, 3 at 1100ms,
… 7 at 2900ms.

### How it's built

`Seat` writes four custom properties, and the CSS does the rest:

```ts
"--enter-x": `${entry.x - x}cqw`,   // offset back to the doorway
"--enter-y": `${entry.y - y}cqh`,
"--arrive-delay": `${arrivalIndex * ARRIVAL_STEP_MS}ms`,
"--arrive-duration": `${ARRIVAL_DURATION_MS}ms`,
```

The offset is expressed in container-query units, which resolve against the
scene frame — so the same numbers work at any screen size. The keyframes travel
to `translate(0,0)` by 70% and spend the rest on a small settle-in bounce.
`animation-fill-mode: both` is what keeps each person waiting out of sight
until their turn.

## Swapping the parents

Seats are keyed by **person**, not by seat. When the parents trade places React
keeps the same element and its `left`/`top` simply change, so a CSS transition
carries them across:

```css
.seat-glide {
  transition:
    left  620ms cubic-bezier(0.34, 1.28, 0.64, 1),
    top   620ms cubic-bezier(0.34, 1.28, 0.64, 1);
}
```

The overshoot in that easing is what makes it feel springy rather than
mechanical. On top of it, the two parents get `seat-swap-arc` for the duration
— a lift and a swell, so they arc over the furniture instead of sliding flatly
through it. The arc lives on a separate wrapper element so it can never fight
the arrival animation for the `transform` property.

`useParentSwap` holds a short-lived `swapping` flag for exactly
`SWAP_DURATION_MS`, which is what turns the arc on and off.

Two structural details make this work reliably:

- **Seats render in roster order**, which never changes. A swap therefore
  reorders no DOM nodes, and cannot interrupt an animation mid-flight.
- **A swap does not remount the scenes.** The `key={weekNumber}` on the grid
  means a *week change* replays the full arrival, but a swap does not — that is
  the difference between "new week, everyone find your seat" and "you two,
  trade places".

## Elsewhere

`animate-soft-rise` (cards) and `animate-soft-fade` (header) are short
entrance effects. The header's is opacity-only and deliberately has **no
transform**: it contains the theme picker, whose mobile bottom sheet is
`position: fixed`, and any transformed ancestor would become that sheet's
containing block and pin it to the header instead of the viewport.

## The one thing that loops

The line at the top of this page — nothing loops, nothing moves once the
arrival settles — held until the weekly report arrived. It is a page whose
whole purpose is a sequence of reveals, so it does move, and it moves for as
long as somebody is watching it: slides turning every eight seconds, a total
counting itself up, and confetti at the end.

That is not a rule being broken so much as a different kind of page. It is
reached deliberately, once a week, and everything on it is the content rather
than decoration around the content. The rules it *does* keep are the ones that
matter: everything is `transform`/`opacity` so it stays on the compositor, and
under reduced motion every reveal is simply already there.

The mechanism is worth knowing before touching it. Each element on a slide
carries a `--reveal-delay` and a `both`-filled animation, so it is invisible
*until* its delay elapses — which is why `globals.css` switches those classes
off explicitly under `prefers-reduced-motion` rather than relying on the global
duration override. That override touches `animation-duration` and not
`animation-delay`, so without the explicit rule a slide would sit blank for its
whole choreography and then snap into existence. See [the weekly
report](report.md#reduced-motion).

## Reduced motion

Under `prefers-reduced-motion: reduce`, every animation and transition above is
switched off — people are simply in their seats already. Verified in a real
browser: avatars are at full opacity immediately, with no travel.
