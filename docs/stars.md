# Star charts

Three laminated charts hang on the fridge — chores, summer learning and hygiene
— each with a column per child and a row of five stars, Monday to Friday, per
task. This page is all three of them in one place, on a phone, with the stars
tappable.

Live at [`/stars`](../src/app/(app)/stars/page.tsx). The words come from
[`src/config/stars.ts`](../src/config/stars.ts), who-does-which-chore from
[`src/config/chore-rotation.ts`](../src/config/chore-rotation.ts) and the
`choreRotations` collection, and the ticked stars from `starWeeks`.

## The three kinds of row

Reading the printed charts across, every row falls into one of three groups,
and that is the whole data model:

| Kind | Meaning | Examples |
|---|---|---|
| `everyone` | The same row on every child's column, forever. | Tidy room · laundry upstairs · all four hygiene rows |
| `fixed` | Belongs to named children because of their age or what they are learning. | Cello (Hannah) · Write alphabet (James) · Pick up toys (the two youngest) |
| `rotating` | A real chore, which moves to another child on the first of each month. | Dishwasher · kitchen island · bath trash · vacuuming |

A `fixed` row changes when a child grows, which is a deploy. A `rotating` row
changes by itself.

## How the rotation works

Chores rotate inside **pools** — a set of children old enough for a set of
chores. A single rotation across all five would eventually hand the dishwasher
to the four-year-old.

| Pool | Children | Chores |
|---|---|---|
| `bigs` | Clara, Emily, Hannah | Living-room floor, dishwasher, kitchen island, vacuum living room, yard pick-up, bath trash |
| `littles` | James, William | Feed Bella, vacuum the wooden floor |

Pools are disjoint: a child is in exactly one. The rule is one line —

```
chore j goes to  children[(j + months since the anchor) mod children.length]
```

— and it buys three things worth stating plainly:

- **Uneven counts need no special case.** Six chores across three children is
  two each. Five would be two-two-one, with the short straw moving on next
  month.
- **Everybody does everything.** Child `c` holds chore `j` exactly when
  `j ≡ c − offset (mod n)`, so after `n` months every child has held every
  chore in their pool. For the big three that is all six chores every three
  months, and nobody ever gets the same chore two months running.
- **It runs backwards.** "Whose was the dishwasher in May?" is the same
  calculation with a negative offset — no row per month is stored anywhere.

It turns over at **midnight on the 1st**. `differenceInCalendarMonths` ignores
the day entirely, so the answer steps by exactly one on the 1st and never in
between.

### `chores` is a dealing order, not a reading order

Because the deal is round-robin, consecutive entries in a pool's `chores` list
go to *different* children. The lists are therefore interleaved, which is why
they look shuffled next to the printed chart. It is dealing cards, not reading
a column.

**Reordering that list reassigns chores.** Adding one to the end is safe;
inserting one in the middle shifts everything after it onto a different child.

### The anchor

`anchorMonth` is *a month whose answer is known to be right* — `2026-08`, read
off the photographs taken on 4 August 2026 — not a "start date". Every other
month, before and after, derives from it. Fixing a mistake therefore means
**re-anchoring**: put in this month's truth and every month after it lands
correctly. Same idea as the pets' `anchorDate`; see [Pets](pets.md).

`tests/chore-rotation.test.ts` pins August chore by chore, so a future edit
cannot quietly move it.

### Changing it without a deploy

The pools live in the `choreRotations` collection, one document per pool:

```js
{ poolId: "bigs", name: "The big three",
  children: ["clara", "emily", "hannah"],
  chores: ["pick-up-living-room", "dishwasher", "kitchen-island",
           "vacuum-living-room", "yard-pickup", "bath-trash"],
  anchorMonth: "2026-08" }
```

Edit that document and the rotation changes on the next page load. What is in
`src/config/chore-rotation.ts` is the **seed** for those documents and the
**fallback** the page uses when the database is unreachable or a document is
malformed — the chart still renders, and the log says why.

`npm run db:seed` writes a pool only if it is missing, so re-seeding never
drags a re-anchored pool back to the compiled default. It refuses to write
anything `findChorePoolProblem()` rejects — a child in two pools, a chore in
none, a chore that is not a task — and that is the same function the app uses,
so "a usable rotation" has one definition rather than two.

## Ticking a star

One document per child per week, in `starWeeks`:

```js
{ childId: "clara", weekStart: "2026-08-03",
  marks: { "tidy-room": [true, true, false, false, false] } }
```

The week is the unit because the paper chart is: a whole row of five earns the
weekly reward, so "did Clara fill a row" is a property of one document rather
than a query across five. Rendering the page is five small documents.

A task nobody has ever ticked simply has no key, so adding or retiring a chore
never needs a migration. **Never reuse or rename a task id** — every star ever
earned is filed against it. Change the `label` instead.

Two details in [`marks.ts`](../src/lib/stars/marks.ts) that are not obvious:

- The write is an **aggregation pipeline update**, not
  `$set: { "marks.tidy-room.2": true }`. The dotted form has a trap in it: when
  `marks.tidy-room` does not exist yet, MongoDB creates it as the *object*
  `{ "2": true }` rather than as an array. The pipeline rebuilds the whole
  five-element row instead, so the shape is right whether the document, the
  task, or neither existed a moment ago — and it is still one atomic update.
- The action **sets** a value rather than flipping one, so a retry after a
  flaky connection cannot undo the tap it is retrying.

The `starWeeks` unique index on `(childId, weekStart)` is not just the query's
index: it is what stops two simultaneous taps from creating two documents for
the same child and week.

## On the page

One child at a time. The paper chart shows five columns because it is A3 and
taped to a fridge; on a 390px phone that would be 25 targets about 14px each,
well under the ~44px a thumb hits reliably. So the phone gives one child's
chart full width and puts the other four one tap away — which is also the order
a child does this in. They come to fill in *their* stars.

Faces rather than names on the picker: the youngest child on this chart is
four.

### Whose page this is

Five children share one phone and the three charts look alike, so the failure
that matters is not a crash — it is a star ticked on the wrong child's page,
which is a star somebody else did not earn. A selected tab is a 70-pixel answer
to a question the child never thought to ask, so the page answers it four times
over:

1. **The heading names them** — "Hannah's Stars", in their own colour.
2. **The whole background is theirs** — their colour washed top to bottom, and
   two large, faint copies of their own face behind the cards
   ([`ChildBackdrop`](../src/components/stars/ChildBackdrop.tsx)).
3. **The cards are tinted** with the same colour, because a thumb resting on
   the chart covers most of the backdrop.
4. **The tab stands proud** — the chosen face is larger and at full strength,
   the other four step back to 45%.

All five backdrop layers are rendered at once and four sit at zero opacity, so
switching is a cross-fade between things already on screen rather than a
photograph being fetched and decoded. The photographs are the same files the
tabs are already showing, so it costs no extra network.

The heading is the one that carries the meaning: colour alone must never be the
signal, both for a colour-blind reader and for anyone who has not yet learned
that green means Clara. The backdrop is `aria-hidden` decoration.

One trap worth knowing, since the fix looks like a stylistic choice: the header
and the chart list are both keyed on the child, and **their keys are prefixed
differently on purpose**. Two siblings sharing a key value is a duplicate key
as far as React is concerned — it kept the outgoing header mounted, so
switching child left Hannah's name sitting above Clara's chart. Covered by
`tests/stars-board.test.tsx`.

Stars fill optimistically — the star fills on tap and the write goes out behind
it, because a child colouring in a row should never watch a spinner between
stars. `--color-star` is gold on every theme, for the same reason each child's
avatar colour ignores the theme: it has to look like the sticker on the fridge.

## Confetti

Thrown at **columns, not rows**. A row is one job done five days running,
which takes until Friday; a column is everything owed for one day — the thing a
child finishes, notices themselves finishing, and can be congratulated for
while they are still holding the phone.

Two sizes, because they are two different achievements:

| Finished | What happens |
|---|---|
| One chart's column — every chore, or every learning task, for one day | Confetti falls inside that card, and the card gives a small jump |
| The whole column — every star that child owes that day | Confetti falls across the entire screen |

The bigger one *replaces* the smaller rather than joining it: the last star of
the day is also the last star of some chart, so both would otherwise fire at
once.

It only ever fires on the way **up**. Rubbing out a star to correct a mistake
is not an achievement, and unticking then reticking is not a way to farm
confetti.

Implementation notes worth having before you touch
[`Confetti.tsx`](../src/components/stars/Confetti.tsx):

- **No library, no canvas.** Seventy absolutely-positioned divs animated by one
  CSS keyframe go straight to the compositor, cost nothing on the main thread
  while a child is still tapping, and — the point that settles it — work
  offline in the installed PWA without adding a byte that has to be cached.
- **The pieces are generated once, on mount**, and held in state. Generating
  them during render reshuffles the whole burst on every unrelated re-render,
  of which there are plenty while a transition is in flight, and it reads as a
  stutter rather than as falling paper.
- **The fall distance is in pixels, not percent.** A percentage inside
  `translate3d()` resolves against the element's own box, not its container, so
  `105%` moved each piece about thirteen pixels. The page burst measures the
  viewport; a card's burst uses a fixed distance and lets the overlay clip
  whatever overshoots.
- **A burst is identified by an id, not a boolean**, so finishing two columns
  in a row remounts the confetti and starts it over instead of being a no-op.

Under `prefers-reduced-motion` the paper is hidden outright. Nothing is lost:
every celebration is also announced in words in a `role="status"` line, which
is what a screen reader hears in any case — the confetti is `aria-hidden`
decoration.

## A week that straddles a month

Chores change hands on the 1st; the chart's week runs Monday to Friday. So a
week can straddle two rotations. The rule, in
[`week.ts`](../src/lib/stars/week.ts): the current week asks the rotation about
*today*, and any other week asks about its own Monday. A chore handed over on a
Wednesday therefore appears on the new child's chart with Monday and Tuesday
blank — which is exactly what happened.

The Server Action re-derives that same reference date before accepting a tick,
so the page and the endpoint can never disagree about whose chore it is.

## Changing the charts

The `label` strings are **transcriptions** of the paper, word for word. Do not
reword one to make it read better — change the chart on the fridge first, then
change the file so the two never disagree. `tests/stars-config.test.ts` pins
the per-child row counts and a sample of the exact wording, which is what
catches a well-meaning tidy-up in review.

To add a task:

1. Add it to `STAR_TASKS` in `src/config/stars.ts` with a new, permanent id.
2. If it is `rotating`, add the id to exactly one pool's `chores` — at the
   **end**, unless you mean to reassign the others — and to the matching
   `choreRotations` document.
3. Update the counts in `tests/stars-config.test.ts`.

## Still to come

- **Editing from the app** — a parent renaming a chore, or moving one to a
  different child for the rest of the rotation, stored as an override on top of
  the compiled label and the computed owner.
- **The weekly report** — Friday's celebration: a slide per child,
  how many stars they earned and which charts they were perfect on.
  [`counting.ts`](../src/lib/stars/counting.ts) already computes what it needs.
