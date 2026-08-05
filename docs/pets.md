# Pets

Bella (the dog) and Leia (the cat) sleep with a different child every night.
The two cards sit at the bottom of the **Whose Turn** page (`/turns`), beneath
the dinner table and the Expedition. The page and the tab were both called
"Seats" until these arrived — see
[Decisions](decisions.md#seats-became-turns-url-included).

This is the first feature whose data lives in **MongoDB** rather than in the
source, so it is worth reading the split below before changing anything.

## What lives where

| | Where | Why |
|---|---|---|
| Who the animals are — name, species, photograph, where a child's face is pinned on them | [`src/config/pets.ts`](../src/config/pets.ts) | Changes when a photograph changes, which is a deploy anyway. |
| Who sleeps with whom | `petRotations` in MongoDB | Re-anchoring is a thing the family may want to do at 9pm, without a deploy. |
| The maths | [`src/lib/pets/rotation.ts`](../src/lib/pets/rotation.ts) | Pure. No React, no Mongo, fully tested. |
| Reading the collection | [`src/lib/pets/store.ts`](../src/lib/pets/store.ts) | Server-only. Falls back to the compiled defaults. |

## How "who has Bella tonight" is decided

```ts
childIndex = (index of the anchor child + whole days since the anchor date)
             mod the number of children
```

The order, shared by both animals:

```
Hannah → Emily → Clara → William → James → Hannah → …
```

And the anchor, as the family gave it on the evening of **4 August 2026**:

| Pet | Anchor child | Position in the order |
|---|---|---|
| Bella | Hannah | 0 |
| Leia | William | 3 |

Note this is an **anchor**, not a start date: it is a night the answer is
*known* for. That is what makes fixing a mistake easy — put in last night's
truth and every night after it lands correctly. The rotation runs backwards
just as happily, so "who had Leia last Tuesday?" is answerable too.

A night runs on the **device's own local calendar day**, and the whole thing is
normalised to local noon before days are counted, so it cannot slip an evening
across a daylight-saving boundary. Same reasoning as the seating rotation — see
[Rotation](rotation.md#how-which-week-is-it-is-decided).

## Nobody gets both animals on the same night

This is a hard rule, and it is enforced *structurally* rather than by checking
every evening.

Both pets walk the **same** order and sit at **different** places in it. Bella
and Leia are three apart in a five-child cycle, and because both advance one
place per night, they are three apart forever — forwards, backwards, for as
long as the app runs. There is no date on which they can collide, so there is
nothing to check at render time.

`findSharedNightProblem()` in
[`rotation.ts`](../src/lib/pets/rotation.ts) is what holds that argument up. It
refuses a configuration in which either half fails:

- two pets at the same place in the order — the same child gets both, nightly;
- two pets on **different** orders — the two sequences drift against each
  other and will collide sooner or later, and no fixed-offset argument applies.

It runs in three places: the seed refuses to write a bad rotation, the page
falls back to the compiled defaults rather than displaying a bad one, and the
tests check both the rule and a five-year night-by-night simulation.

## Re-anchoring

Say Bella ends up a night out of step. Fix it in the database — the app picks
it up on the next page load, no deploy:

```js
// mongosh, against birch_family_app
db.petRotations.updateOne(
  { petId: "bella" },
  { $set: { anchorDate: "2026-09-14", anchorChildId: "clara",
            updatedAt: new Date() } },
)
```

**Keep the gap off zero.** If moving one animal would land it in the same place
in the cycle as the other, the page refuses the stored configuration entirely
and falls back to the rotation compiled into `src/config/pets.ts`, logging why.
Better a visibly stale rotation than one child with two animals and another
with none.

To check what you have done without waiting for bedtime, change the device's
date, or run the maths directly:

```bash
npx tsx -e "
import { getPetNights } from './src/lib/pets/rotation';
import { DEFAULT_PET_ROTATIONS } from './src/config/pets';
console.log(getPetNights(DEFAULT_PET_ROTATIONS, new Date(2026, 8, 14, 12)));
"
```

## Adding a third animal

1. Put the cut-out master in `assets/pets/<id>.png` and run
   `npm run pets:generate`.
2. Add it to `PETS` and `DEFAULT_PET_ROTATIONS` in `src/config/pets.ts`, at a
   place in the order **no other animal occupies**.
3. `npm run db:seed` — existing rows are left alone, the new one is written.

With five children there is room for five animals before the rule becomes
unsatisfiable, and `findSharedNightProblem` will tell you when you get there.

## The photographs

`npm run pets:generate` — [`scripts/optimise-pets.mjs`](../scripts/optimise-pets.mjs).

Same shape as the avatar pipeline (see
[Family and seats](family-and-seats.md)): masters in `assets/`, hashed output
in `public/`, a generated manifest so the hashes cannot drift. Two things are
specific to the pets:

- **Trimmed.** Both masters are cut-outs with a wide, and unequal, transparent
  margin. Left alone, Bella and Leia would be rendered at visibly different
  sizes in cards that are the same size, so each is cropped to its own alpha
  bounding box first.
- **One canvas.** The trimmed animal is then scaled to *fit* — never to fill,
  so an ear can never be cropped off — and centred on a canvas that is the same
  for every pet: **828 × 552** (3:2, and 828 is one of Next's default device
  widths). That is what makes the two cards the same shape, and what makes
  `avatarSpot` in `src/config/pets.ts` mean something: the coordinates are
  percentages of that canvas, so a spot picked once by eye stays put across
  re-runs.

```
bella   1445x1089 1076KB  ->  trimmed 1157x777  ->  437KB  (-59%)
leia    1448x1086 1111KB  ->  trimmed 1238x667  ->  400KB  (-64%)
```

Those are the *stored* sizes. What a phone actually downloads is smaller again,
because `next/image` re-encodes to WebP or AVIF at the size the card needs —
measured against a production build:

| | 640px | 828px |
|---|---|---|
| Bella | 31KB | 37KB |
| Leia | 27KB | 35KB |

So the pair costs about **60KB** on the wire, once, and never again on that
device.

The filenames carry a content hash, so `next.config.ts` serves them `immutable`
for a year and the service worker treats them as cache-first — the same
arrangement, and the same reasoning, as the avatars. See
[PWA and offline](pwa-and-offline.md).

## The card

[`src/components/pets/PetCard.tsx`](../src/components/pets/PetCard.tsx).

The child's avatar is pinned to the animal with the same `<Seat>` component the
dinner table uses, so it inherits the arrival animation for free — the child
walks up from the foot of the frame rather than in through a doorway. The
cards remount at local midnight, which is what makes the new child walk in
rather than blink into place.

`<PetNights>` is a client component for exactly the reason `<SeatingBoard>` is:
the answer depends on the **device's** date and has to change at local midnight
without a reload. The database read happens in the page, on the server, and the
configuration is passed down.
