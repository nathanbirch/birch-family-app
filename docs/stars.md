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
| `rotating` | A real chore, which swaps to the other child of a pair every Monday morning. | Dishwasher · kitchen island · bath trash · vacuuming |

A `fixed` row changes when a child grows, which is a deploy. A `rotating` row
changes by itself.

## How the rotation works

Chores rotate inside **pools** — a pair of children close enough in age to do
each other's jobs. A single rotation across all five would eventually hand the
dishwasher to the four-year-old.

| Pool | Children | Chores |
|---|---|---|
| `elder-pair` | Hannah, Emily | Kitchen island, dishwasher, bath trash, yard pick-up |
| `younger-pair` | Clara, William | Living-room floor, vacuum the wooden floor, vacuum living room |

**James is in no pool.** His chores stay his indefinitely, so feeding Bella is
a `fixed` row in `config/stars.ts` rather than a rotating one — he used to
trade it with William month by month, and William now trades with Clara
instead. Changing that is a deploy, which is exactly the difference between
`fixed` and `rotating`.

Pools are disjoint: a child is in at most one. The rule is one line —

```
chore j goes to  children[(j + weeks since the anchor) mod children.length]
```

With two children that is just "swap on Monday", but keeping the round-robin
rather than a boolean buys:

- **Uneven counts need no special case.** The younger pair share three chores,
  so one of them does two this week and the other two next week. The odd chore
  changes hands along with the rest.
- **Everybody does everything.** Child `c` holds chore `j` exactly when
  `j ≡ c − offset (mod n)`, so after `n` weeks — two, here — each child has
  held every chore in their pair, and nobody has the same chore two weeks
  running.
- **A third child can join a pair** by being added to `children`; the swap
  becomes a three-way rotation and nothing else changes.
- **It only runs forwards.** Weeks before the anchor use the anchor's own
  deal. This is the one rule that has been *reversed* since it was written, and
  the fridge is what reversed it — see below.

It turns over at **midnight going into Monday**. `differenceInCalendarWeeks`
ignores the day of the week entirely, so the answer steps by exactly one on
Monday and never in between — which is also why a Monday-to-Friday chart never
straddles two deals, and why the live chart, the Server Action and the weekly
report can all ask about the same date: the week's own Monday.

### Why it stopped running backwards

It used to answer "whose was the dishwasher in May?" with a negative offset,
and the ability to derive the whole of history from one anchor was written down
here as a feature.

Then two July weeks were back-filled off photographs of the chart, and
**fourteen stars vanished**. The chart is laminated with each child's chores
*printed* on it: Clara's column said "Pick up living room floor" in July
because printed card does not rotate. The extrapolation insisted those weeks
had a different deal, so Hannah's bath trash, Clara's living room and James
feeding Bella were all filed against children the rotation said did not have
them, and `buildWeekReport` — correctly, on its own terms — refused to count
them. Children who had done the jobs went unpaid for them.

The anchor is *a week whose answer is known*. Before it, nothing is known, and
running the deal backwards was not recovering a history but inventing one. So
`getChoreWeekOffset()` clamps at zero and every pre-anchor week uses the
anchor's deal. That clamp is doing more work since the swap went weekly: the
chores rotated *monthly* right up to the anchor week, so every week the
database already holds stars for was dealt exactly as the anchor deals it, and
all of that history still reports the chart the children worked from. If the
chores are ever genuinely re-dealt, re-anchor the pool (a one-field edit in
`choreRotations`) rather than letting the sum guess.

### `chores` is a dealing order, not a reading order

Because the deal is round-robin, consecutive entries in a pool's `chores` list
go to *different* children. The lists are therefore interleaved, which is why
they look shuffled next to the printed chart. It is dealing cards, not reading
a column.

**Reordering that list reassigns chores.** Adding one to the end is safe;
inserting one in the middle shifts everything after it onto the other child.

### The anchor

`anchorWeek` is *a week whose answer is known to be right* — `2026-08-10`, the
Monday the weekly swap began, dealt as the photographs taken on 4 August 2026
show — not a "start date". Every other week, before and after, derives from it,
and the first swap was therefore Monday 17 August 2026. Fixing a mistake means
**re-anchoring**: put in this week's truth and every week after it lands
correctly. Same idea as the pets' `anchorDate`; see [Pets](pets.md).

It must be a **Monday**. An anchor set to a Wednesday would quietly move the
changeover to Wednesdays, so `findChorePoolProblem()` rejects one.

`tests/chore-rotation.test.ts` pins the anchor week chore by chore, so a future
edit cannot quietly move it.

### Changing it without a deploy

The pools live in the `choreRotations` collection, one document per pool:

```js
{ poolId: "elder-pair", name: "Hannah & Emily",
  children: ["hannah", "emily"],
  chores: ["kitchen-island", "dishwasher", "bath-trash", "yard-pickup"],
  anchorWeek: "2026-08-10" }
```

Edit that document and the rotation changes on the next page load. What is in
`src/config/chore-rotation.ts` is the **seed** for those documents and the
**fallback** the page uses when the database is unreachable or a document is
malformed — the chart still renders, and the log says why.

`npm run db:seed` writes a pool only if it is missing, so re-seeding never
drags a re-anchored pool back to the compiled default. It refuses to write
anything `findChorePoolProblem()` rejects — a child in two pools, a chore in
none, a chore that is not a task, an anchor that is not a Monday — and that is
the same function the app uses, so "a usable rotation" has one definition
rather than two. It also **deletes** documents for pools that no longer exist,
which is what cleared the monthly `bigs` and `littles` rows when the pairs
took over; an ignored document reads like the live rotation and is not one.

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

### Only today's column

A star records a day, so the only column that can be coloured in is the one
that is actually happening. Friday cannot be filled in on Monday because the
row looks better full, and Monday cannot be filled in on Thursday from memory.
The other four columns are still *drawn* — the week is the picture — but they
are `disabled`, and a locked empty star is faded much further than a locked
earned one, so the eye lands on the column that is open.

At the weekend there is no open column at all: the chart runs Monday to Friday.
That is the one case the page says out loud, because otherwise every star is
faded and nothing explains why.

[`openDayIndex()`](../src/lib/stars/week.ts) is the only definition of the
rule. The chart disables the buttons with it and `setStar` re-checks the *same
function* on the server before it writes — against
[the family's clock](../src/lib/family-api/time.ts) rather than the device's,
because this runs on Vercel where "today" is already tomorrow from teatime
onwards, and because a phone with its date wound back is otherwise a way to buy
an extra column.

The cost is real and was accepted: a star genuinely earned on Tuesday and
forgotten cannot be added on Wednesday, and a mistake cannot be rubbed out the
next morning. Chasing that would mean a parent-only override, which is a
feature and not a checkbox.

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

### How much paper

280 pieces for the whole-day burst, 136 for a card's. Both started at a quarter
of that and were quadrupled on the only evidence that counts — the family
looked at it and wanted more. `PIECES` in `Confetti.tsx` is the dial.

### The sound

A 1.6-second clip of a room breaking into applause with a chime over it, played
through the Web Audio API — full volume for the whole day, 60% for a single
chart, so the two celebrations do not sound alike.

It is **synthesised, not recorded**:
[`scripts/generate-cheer.mjs`](../scripts/generate-cheer.mjs) builds it from a
bed of filtered noise, 52 clap transients and a four-note rising chime, then a
few delay taps for the room.

The first version of this was harsh, and the header of that script explains
each cause in detail — but the short version is worth having here, because
every one of them is a mistake that is easy to make again: 132 claps in 1.3
seconds is dense enough that the transients fuse into hiss; claps that begin at
full amplitude on their first sample are clicks rather than hands; `tanh` drive
of 1.9 bought its extra loudness by flattening every peak into distortion; and
six formant-synthesised "yay"s sat right in the band the ear is most sensitive
to, sounding like a kazoo. The rebuilt version is 1 dB *louder* overall
(-14.1 LUFS against -14.7) with 9.5 dB less energy above 5kHz. `npm run sound:generate` regenerates it. Three reasons it is
made rather than downloaded: no stock licence covers "a family app", it comes
out at 20KB so it can be precached and work offline, and everything in the
script is seeded so re-running produces a byte-identical file and therefore the
same content hash.

It is a *stylised* cheer and does not pretend otherwise. **Recording the actual
children would be better**, and swapping one in is deliberately easy: put a
1.5-second mono file at `public/sounds/cheer-<hash>.mp3`, point `CHEER_SOUND`
in `src/config/sound-manifest.ts` at it, and update the filename in `sw.js`'s
`PRECACHE`. Nothing else knows where the sound comes from.

Web Audio rather than an `<audio>` element for one reason that matters: finish
a chart's column and then the whole day a second later, and a single `<audio>`
element cuts the first cheer off mid-clap. A decoded buffer can be started as
often as you like, overlapping.

Every failure in [`cheer.ts`](../src/lib/stars/cheer.ts) is silent — no Web
Audio, an autoplay policy that refuses, a file that will not decode. The star
is already ticked and the confetti is already falling; the sound is the part
that is allowed to just not happen.

**The iPhone silent switch.** For a while the cheer did not work on any iPhone,
and looked from the code like it was never running: iOS puts Web Audio on the
`ambient` audio session, `ambient` is precisely what the hardware ring/silent
switch mutes, and most phones sit on silent most of the time. Everything ran,
decoded and started correctly and made no sound. `cheer.ts` now claims the
`playback` session — the category native apps use, which the switch does not
mute — through Safari's [Audio Session
API](https://w3c.github.io/audio-session/), feature-detected because no other
browser has it. The cost is that `playback` pauses other audio, so finishing a
column stops music playing on the same phone. `transient` would not, and is the
better description of a cheer, but `playback` is the value with a track record
of actually clearing the switch. It is a one-word change in `cheer.ts` if the
music stopping proves the bigger annoyance — test it with the switch flicked to
silent, which is the only way to tell.

The speaker button in the header turns it off, per device and remembered in
`localStorage` — the phone on the kitchen counter should cheer, the one in a
quiet room at bedtime should not, and neither should decide for the other. It
sits next to the child's name rather than on the account page because the
moment you want it is the moment it has just gone off.

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

Two rows have since moved, and both moved on the fridge first:

- **The laundry row** is worded ahead of the laminate on purpose: "Put away
  laundry, or do a load of laundry", because the star is earned by either half
  of the job and the printed wording only describes the end of it. Write it on
  in pen and the two agree again.
- **Cello practice is gone.** It was Hannah's, and it is scored out in red on
  the chart, so it is deleted from `STAR_TASKS` rather than hidden. The id
  `cello` is retired for good and must never be reused: stars already filed
  against it stay in the database and are dropped on the way out by
  `normaliseMarks()`. If the cello comes back, it comes back as a new row.

To add a task:

1. Add it to `STAR_TASKS` in `src/config/stars.ts` with a new, permanent id.
2. If it is `rotating`, add the id to exactly one pool's `chores` — at the
   **end**, unless you mean to reassign the others — and to the matching
   `choreRotations` document.
3. Update the counts in `tests/stars-config.test.ts`.

To back-fill a week off a photograph, there is
[`scripts/seed-star-history.ts`](../scripts/seed-star-history.ts)
(`npm run db:seed-history`) — a committed transcription table rather than an
`updateOne` typed into a shell, so whoever spots a misread star can correct it.
Read the note at the top of it first: the printed chart has each child's chores
printed *on* it, so back-filling a week before the rotation's anchor files
rotating chores against children the rotation says did not have them, and those
stars are then left uncounted in that week's ceremony.

## Star Deals

One extra star a day, different for every child, worth **three** ordinary ones.
The words are in [`src/config/deals.ts`](../src/config/deals.ts), the maths in
[`src/lib/stars/deals.ts`](../src/lib/stars/deals.ts), and the card at the top
of the page is [`DealCard`](../src/components/stars/DealCard.tsx).

The three charts are the same rows every week, on purpose — they are the floor.
A deal is the opposite: one job nobody was expecting, gone by bedtime. It is the
only tick in the app where one tap is worth more than one star, and
`DEAL_STAR_VALUE` is the only place that number is written down.

### The two promises

The family asked for two rules, and both are **structural** rather than checked
afterwards:

- **No two children get the same deal on the same day.** Each day takes a
  *window* of five consecutive deals out of `STAR_DEALS` and matches them
  one-to-one onto the five children. A collision is not something the code
  avoids; it is something it cannot express.
- **Nobody gets the same deal two days running.** The window steps forward by
  exactly five each chart-day, so today's window and tomorrow's are disjoint
  sets — there is no overlap to repeat out of. It is in fact much stronger than
  the promise: a child sees twenty-five different deals across a school week,
  and works through all fifty-three before any comes back.

Neither needs yesterday's answer looked up, which is the point. A rule enforced
by remembering yesterday needs somewhere to remember it, and then needs an
answer for the day the memory is missing.

### Nothing is stored

There is no `starDeals` collection and there should not be one. A day's five
deals are derived from the calendar, exactly as the mantra of the day is: every
phone lands on the same answer without syncing, the page works offline, and a
ceremony for a week in March recomputes March's deals rather than trusting a
record of them. The one thing that *is* stored is whether a child took theirs —
in the same `starWeeks` document as everything else, under the deal's own id.

Which is why **every deal id starts `deal-`** and no task id may. That prefix is
what lets one `marks` object hold both, and `isStarMarkId()` in `marks.ts` is the
single gate in front of it. Deal ids are as permanent as task ids, for the same
reason: a deal deleted from the config drops the stars filed against it.

### Tiers, not ages

The youngest child in the house is four, and "clean the kids' bathroom" is not a
thing to hand a four-year-old on a Tuesday. Every deal names the children it
suits through one of three tiers — `everyone`, `school-age`, `big-kids` — which
are **lists of children, not computed ages**, exactly like a `fixed` star task. A
birthday should not silently move a job onto a child mid-week; somebody decides
William is old enough for the bathrooms now, and that is a deploy. One table,
`DEAL_TIERS`, at the top of the file.

### `STAR_DEALS` is a dealing order

Same warning as `chores` in `config/chore-rotation.ts`, for the same reason:
what sits *next to* a deal decides who can be offered it. Because a day's window
has to be **matched** rather than dealt — the bathrooms belong to the big three —
a window of five bathrooms would leave James without a deal at all.

So the list is interleaved by tier in a strict repeating pattern:

```
everyone · school-age · big-kids · everyone · school-age    (× 10)
everyone · big-kids   · everyone                            (the last 3)
```

which guarantees every window of five — including the three that wrap round the
end — contains at least two deals anybody can do, and therefore always admits a
complete five-way match. `tests/stars-deals.test.ts` checks **all fifty-three
windows against all five children**, which is the whole space, rather than
trusting the pattern to survive an edit.

The length matters too: the window steps by five, so the list length must be
**coprime with five** or the windows would circle the same handful of deals for
ever. Fifty-three is prime. A fifty-fourth deal is fine; a fifty-fifth is not,
and the test says so. Add them five at a time, in the pattern.

### On the page, and in the action

The card shows today's deal and the ones already gone, and **nothing ahead**.
Thursday's deal shown on Monday is no longer a surprise, and — more practically —
it is an invitation to clean the bathroom on Monday and tick it on Thursday,
which is what `openDayIndex()` exists to prevent. At the weekend, when there is
nothing left to spoil, all five are shown.

The Server Action checks a deal against the **day** rather than the week:
`isDealForChild()` rejects yesterday's deal filed against today, a sibling's
deal, and the pick of the whole list of fifty-three, all with one comparison.

Two smaller decisions worth knowing:

- **The deal counts towards the whole-day confetti.** "James finished everything
  for Wednesday" would not be true with a fifteen-cent job untouched at the top
  of the page. See `isDayComplete()`.
- **Taking a deal celebrates on its own account.** It has no chart column to
  complete, and it should not be the only tick on the page that passes in
  silence.

### The anchor

`DEAL_ANCHOR_WEEK` is genuinely a *start date*, unlike the chore rotation's
anchor. There is no laminated chart to disagree with — a deal is derived from
the calendar and nothing else — so running the sum backwards recovers a real
answer rather than inventing a history, and an old ceremony shows exactly the
deals that were on offer that week. Moving it reshuffles everything in both
directions, for ever. There is no reason to.

## What the week adds up to

Every finished week is read back as an award ceremony at `/ceremonies` — a slide
per child, their charts one at a time, their total, and a nickel a star. It
stores nothing of its own: it is these same `starWeeks` documents counted
through [`counting.ts`](../src/lib/stars/counting.ts), so a star corrected on
Saturday morning is in Sunday's report. See [the weekly report](report.md).

## Still to come

- **Editing from the app** — a parent renaming a chore, or moving one to a
  different child for the rest of the rotation, stored as an override on top of
  the compiled label and the computed owner.
- **Rewards** — what the money in the report has actually been paid out
  against. The report says what a week was *worth*; nothing yet records what
  changed hands.
