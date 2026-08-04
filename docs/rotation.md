# Rotation

## Start date

[`src/config/app.ts`](../src/config/app.ts):

```ts
export const ROTATION_START_DATE = "2026-07-27";
```

The Monday that Week 1 begins, read as a **local** calendar date. Point it at a
day that isn't a Monday and the app snaps back to that week's Monday.

Note that a *future* start date does not stop the app showing Week 1's seats —
before the start it renders week 1 with a "starts in N days" note, and the
family will just sit in them. Anchor the date to the Monday the seats are first
actually used, or the first real rotation day looks like nothing happened.

## How "which week is it" is decided

A rotation week runs Monday 00:00 to Sunday 23:59 in the device's own timezone.

```ts
elapsedWeeks  = floor(days between the two Mondays / 7)
scheduleIndex = elapsedWeeks % 5
```

Two details that matter more than they look:

- **Everything is normalised to local noon before counting days.** A
  daylight-saving day is 23 or 25 hours long, but noon-to-noon is always within
  11–13 hours of a multiple of 24, so rounding always lands on the right whole
  number of days. This is why the rotation cannot slip a day at a DST boundary.
- **`YYYY-MM-DD` is parsed manually, not with `new Date(string)`.** The built-in
  parse treats it as UTC midnight, which is the *previous evening* in the
  Americas — the classic bug that makes a schedule flip on Sunday night.

Dates before the start date show Week 1, count down to the start date itself
rather than to the next Monday, and display a note saying when the rotation
begins. The index can never go negative.

## The five-week schedule

[`src/config/rotation.ts`](../src/config/rotation.ts):

```ts
export const CHILD_ROTATION_SCHEDULE = [
  ["hannah",  "emily",   "clara",   "william", "james"],
  ["emily",   "clara",   "james",   "hannah",  "william"],
  ["clara",   "james",   "william", "emily",   "hannah"],
  ["james",   "william", "hannah",  "clara",   "emily"],
  ["william", "hannah",  "emily",   "james",   "clara"],
] as const;
```

Each row is one week; the five entries are Child Positions 1 to 5. The *same*
position numbers drive both scenes — if Clara is in position 2 this week she is
in Dinner Table Child Seat 2 **and** Expedition Child Seat 2. The two places are
physically different; the number is the same.

And deliberately *opposite* in character: the Expedition's seat numbering is
inverted against the table's, so positions 1 and 3 — the two seats beside a
parent at dinner — are the third row of the car. A week spent next to a parent
at the table is a week in the back of the Expedition. See
[Family and seats](family-and-seats.md#the-inverted-numbering).

## Why not just rotate the array

Shifting everyone one seat each week satisfies the coverage rule — each child
does visit every position — but it moves the whole group together, so the same
children stay next to each other every single week. Whoever is on your left in
Week 1 is still on your left in Week 5. That is the failure mode this schedule
exists to avoid, and there is a test that demonstrates it: the naive rotation
passes validation but scores badly on adjacency.

This schedule is a **Latin square with deliberately mixed rows**. That buys
three things structurally, rather than by hand-checking:

- **Every child occupies every position exactly once** per cycle. Columns of a
  Latin square are permutations, so this is guaranteed.
- **Every child gets every physical seat exactly once**, including the seats
  beside each parent, so time near each parent comes out equal.
- **No child can repeat a position** in consecutive weeks, including the Week 5
  → Week 1 wrap — a free consequence of the same property.

## How this one was chosen

```bash
npm run schedule:generate
```

The script enumerates all **1344** 5×5 Latin squares with a fixed first row —
every structurally distinct five-week rotation there is — discards the 624
whose weeks are pure cyclic shifts or mirrors of the previous week, and scores
the remaining **720** on:

1. fewest siblings kept shoulder-to-shoulder across a rotation,
2. most even spread of sibling pairings over the cycle,
3. tightest spread of side-by-side pairings.

Adjacency is measured against the real layouts (see
[Family and seats](family-and-seats.md)). Shoulder-to-shoulder counts full
weight; across the table, or directly in front of/behind in the vehicle, counts
half.

## The fairness numbers

Over one complete five-week cycle. `strong` = side by side, `weak` = across the
table or front/behind in the car.

| Pair | Table (strong/weak) | Expedition (strong/weak) | Combined strong |
|---|---|---|---|
| Hannah + Emily | 2 / 0 | 1 / 3 | **3** |
| Hannah + Clara | 1 / 2 | 2 / 1 | **3** |
| Hannah + William | 2 / 0 | 1 / 3 | **3** |
| Hannah + James | 1 / 2 | 2 / 1 | **3** |
| Emily + Clara | 2 / 0 | 1 / 3 | **3** |
| Emily + William | 1 / 2 | 2 / 1 | **3** |
| Emily + James | 1 / 2 | 2 / 1 | **3** |
| Clara + William | 1 / 2 | 2 / 1 | **3** |
| Clara + James | 2 / 0 | 1 / 3 | **3** |
| William + James | 2 / 0 | 1 / 3 | **3** |

Every pair, exactly **3** side-by-side seatings out of ten, and an identical
weighted score of 4.5 each. The distribution is perfectly flat.

**Week-to-week siblings kept side by side: 1, 1, 1, 1, 1** — including the
Week 5 → Week 1 wrap. Exactly one pair carries a neighbour across each
rotation, and it is a different pair each time.

These numbers are re-derived by `tests/schedule.test.ts`, not copied by hand.

### The honest caveat

This schedule does **not** hit zero repeated adjacencies, and an earlier one
did. That changed when the Expedition's seat numbering was inverted against the
table's, and it was not a free choice: sweeping all twelve legal
position-to-seat mappings against all 720 candidate schedules, **none** reaches
zero any more. Five — one pair per transition — is the floor.

What the inversion bought back is the other half of the trade-off the old
schedule could never have. The old zero-repeat schedule ran a 2-or-4 band of
pairings; this one is perfectly equal at 3. So the priorities still hold —
"minimise repeated adjacency" first, then "distribute evenly" — the first
criterion simply has a higher floor now, and the second comes out ideal.

## Editing the weeks

Edit the array, then:

```bash
npm test                    # enforces every hard fairness rule
npm run schedule:generate   # re-run the search and print a fresh report
```

The tests fail loudly on a bad edit: a duplicate child in a week, missing
position coverage, a child stuck in the same seat two weeks running, or a
Week 5 → Week 1 transition that leaves someone in place.
