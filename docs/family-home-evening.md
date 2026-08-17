# Family Home Evening

Seven jobs, seven people, one picture of the house. Everybody takes a job for
the week, and on Sunday morning everybody moves down one room. The card sits on
the **Whose Turn** page (`/turns`), full width, between the two seating scenes
and the pets.

This is the third rotation on that page and the third clock it runs on:

| Rotation | Changes | Who is in it |
|---|---|---|
| Seats — table and Expedition | Every **Monday** | Five children rotating, two parents parked |
| Family Home Evening | Every **Sunday** | All seven |
| Bella and Leia | Every **night** | Five children |

## What lives where

| | Where |
|---|---|
| The seven jobs, the room each avatar stands in, the anchor | [`src/config/fhe.ts`](../src/config/fhe.ts) |
| The maths — pure, no React | [`src/lib/fhe.ts`](../src/lib/fhe.ts) |
| The card | [`src/components/fhe/FamilyHomeEvening.tsx`](../src/components/fhe/FamilyHomeEvening.tsx) |
| The photograph | `public/scenes/family-home-evening.jpg` |

Everything is compiled into the app. Unlike the pets and the chores there is no
database collection behind it: the jobs are painted into the picture, so
changing them is a new picture, which is a deploy anyway.

## The jobs, in order

The order below **is** the rotation — it is also the order the rooms run down
the picture, and the order people walk in through the doors:

```
Opening Prayer   (upstairs left)
Song             (middle left)
Scripture        (upstairs centre)
Lesson           (middle right)
Activity         (downstairs left)
Treat            (upstairs right)
Closing Prayer   (downstairs right)
   ↓ and back to the Opening Prayer
```

## The rule, in one line

```ts
person p has role  (offset + p + weeks since the anchor Sunday) mod 7
```

where the family's order never changes:

```
Nathan → Sarah → Hannah → Emily → Clara → William → James
```

and `offset` is whatever makes the anchor true. Three things fall out of that
one expression rather than being checked for:

- **Everyone moves down one room a week, together.** So next week's jobs can be
  read straight off the picture by looking one room further down.
- **Everyone does every job exactly once in seven weeks**, and nobody has the
  same job two weeks running. Adding 1 (mod 7) is a full cycle.
- **Nobody is ever doubled up or left out**, because person → job is a
  bijection in every week.

## The anchor

```ts
export const FHE_ANCHOR = {
  sunday: "2026-08-16",
  personId: "nathan",
  roleId: "activity",
} as const;
```

The same shape as the pets' `anchorDate` and the chore pools' `anchorWeek`: *a
week whose answer is known*, not a start date. Naming one person and one job is
enough, because the family order and the job order fix everybody else relative
to them. That anchor produces the week the rotation started with:

| Job | Person |
|---|---|
| Opening Prayer | Emily |
| Song | Clara |
| Scripture | William |
| Lesson | James |
| Activity | **Nathan** |
| Treat | Sarah |
| Closing Prayer | Hannah |

`sunday` must be a Sunday — the changeover is midnight going into Sunday, and an
anchor on a Wednesday would quietly move the changeover to Wednesdays.
`tests/fhe.test.ts` checks that it is one, and pins the table above.

Dates **before** the anchor show the anchor week's jobs rather than an
extrapolation backwards. That is the same forwards-only rule the chore rotation
follows, and for the same reason: the rotation did not exist before that Sunday,
so running the sum in reverse would invent a history the family never lived.

## Sunday, not Monday

The seats and the chores change hands on Monday, so the app now needs both
meanings of "this week". They are two separate sets of helpers in
[`src/lib/dates.ts`](../src/lib/dates.ts) — `startOfWeekMonday` and
`startOfWeekSunday`, and a `differenceInCalendarWeeks` each — rather than one
function with a `weekStartsOn` flag. A flag nobody can see at the call site is
exactly how the two would eventually be mixed up.

"Sunday morning" means midnight going into Sunday, because the app has no idea
when anybody woke up. The family gets up on Sunday and the new jobs are already
showing.

## The picture

`public/scenes/family-home-evening.jpg`, 1672×940 — a cutaway of the house with
one room per job and the job's name painted on its wall. Three notes on it:

- **It is the full width of the page**, not a column, because it is a picture of
  the whole house: as wide as the dinner table and the Expedition are side by
  side. The frame uses the photograph's own aspect ratio, so it is never
  cropped and a coordinate always means the same spot on the wall.
- **It is a JPEG**, and the only one in `public/scenes/`. The two seating
  photographs are PNGs of about 2MB each; this is a painterly illustration with
  no flat colour and no transparency to preserve, and JPEG carries it at
  full resolution in 855KB — a quarter of what the master PNG cost. Both are
  re-encoded to WebP by Next's image optimiser before a family device ever sees
  them, so the format on disk is purely a question of what the repository
  carries.
- **The room names are in the picture.** Nothing in the code labels them again;
  the only thing drawn on top is the seven people.

### Where each avatar stands

Percentages of the frame — `x` across, `y` down, to the centre of a head. Each
one is **measured, not eyeballed**: a face over a painted word is the one
mistake this picture cannot absorb, so every `y` is

```
bottom of that room's painted title (descenders included)
  + a small gap
  + half an avatar
```

which puts the top of the head just under the last letter. The rooms' titles are
painted at different heights — the Treat's hangs lower than the two upstairs
rooms beside it, "Opening Prayer" runs to two lines — so the spots are not level
with each other, and each one carries its measurement in a comment.

**The spots go with the avatar size.** Make the avatars bigger and every spot
has to move down again, or the faces climb back over the words.

### How big the avatars are

`avatarSize: 14.5`, against the seating scenes' 12.5 — and that is what makes a
face here the same size as a face at the dinner table, not a bigger one. `cqh`
is a percentage of the frame's *height*, and on the two-column layout the family
reads this on, the house is twice as wide and therefore much shorter than either
seating card:

| | Frame | 12.5cqh |
|---|---|---|
| Dinner table / Expedition | ~436 × 654 | 82px |
| The house | ~936 × 526 | 66px |

Matching the pixels exactly would take 15.5. It is 14.5 because the **Lesson**
room is the tightest in the house: "Closing Prayer" is painted 68.6% down, the
Lesson title ends at 48.4%, and an avatar with a name label under it only just
fits between the two. 14.5 is the largest that clears every painted title, and
it is within a few per cent of matching, which nobody can see.

Three tests in `tests/fhe.test.ts` protect the numbers — nothing may overlap,
everything must stay inside the frame with its name label, and everyone must
arrive from outside the house. None of them can see a painted word, though, so
if you move a spot, look at the picture.

## The walk-in

The same three-second choreography as the seating scenes, off the same
constants in [`src/config/seating.ts`](../src/config/seating.ts), so the house
fills up in step with the table and the Expedition. People arrive through
whichever door is nearest their room — the left end, the right end, or the
front door in the middle — and the house fills from the top floor down.

The card gets its own container, its own `key` and its own `useImagesReady`
watch in `SeatingBoard`. Sharing the seating's would tie a Sunday rotation's
walk-in to a Monday key, and one of the two changeovers would arrive without
anybody moving.

## Changing it

| To change | Do this |
|---|---|
| Who has which job this week | Re-anchor: set `FHE_ANCHOR` to this Sunday and the job one person actually has. |
| The order of the jobs | Reorder `FHE_ROLES` — but note that reorders **reassign** every job, so re-anchor at the same time. |
| Where somebody stands | Edit that role's `spot` in `FHE_ROLES`. |
| The picture | Replace the file, then re-pick every `spot` against the new one. |

Then `npm test` — `tests/fhe.test.ts` and `tests/fhe-scene.test.tsx` fail loudly
on an anchor that is not a Sunday, a job list that is not seven distinct jobs, a
person who is not in the roster, and any avatar that has wandered outside its
room.
