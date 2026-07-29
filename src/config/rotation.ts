/**
 * The hardcoded five-week child rotation.
 *
 * Each nested array maps directly to the shared child position numbers:
 *
 *   [ Child Position 1, 2, 3, 4, 5 ]
 *
 * The same permutation drives both the dinner table and the Expedition for a
 * given week, so "Clara is in position 2" means position 2 in both scenes.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS WAS CHOSEN
 * ---------------------------------------------------------------------------
 * `npm run schedule:generate` exhaustively enumerates all 1344 5x5 Latin
 * squares with a fixed first row — every structurally distinct five-week
 * rotation there is — discards the 624 whose weeks are pure cyclic shifts or
 * mirrors of the previous week, and scores the remaining 720.
 *
 * This is deliberately NOT a clockwise shift. A simple `array.shift()` keeps
 * the same children next to each other every single week; a Latin square with
 * mixed rows does not.
 *
 * Measured results for the schedule below (see `tests/schedule.test.ts`, which
 * re-derives these numbers, and the README for the full table):
 *
 *   Week-to-week siblings kept shoulder-to-shoulder: 1, 1, 1, 1, 1  (total 5)
 *   ...including the Week 5 -> Week 1 wrap.
 *
 *   Sibling pairs sharing a shoulder-to-shoulder seat over the whole cycle,
 *   counting the dinner table and the Expedition together: every one of the ten
 *   pairs, exactly 3 times, for an identical weighted score of 4.5 each. The
 *   distribution is perfectly equal — nobody is anybody's favourite.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT THE ZERO-REPEAT SCHEDULE IT USED TO BE
 * ---------------------------------------------------------------------------
 * The Expedition's seat numbering is deliberately inverted against the dinner
 * table's, so a week beside a parent at dinner is a week in the third row of
 * the car (see the Expedition section of `config/seating.ts`). That inversion
 * constrains the search: sweeping all twelve legal position-to-seat mappings
 * against all 720 candidate schedules, *none* reaches zero repeated adjacencies
 * any more. Five — exactly one pair per transition — is the floor, and among
 * the schedules that hit it this one also achieves a perfectly flat pairing
 * distribution, which the old zero-repeat schedule never managed (it ran a 2-4
 * band). So the trade-off moved, and it moved in a defensible direction.
 * ---------------------------------------------------------------------------
 *
 * If you edit these weeks, run `npm test` — the schedule tests enforce all the
 * hard fairness rules and will fail loudly on a bad edit.
 */

import type { ChildId } from "./family";

export const CHILD_ROTATION_SCHEDULE = [
  ["hannah", "emily", "clara", "william", "james"],
  ["emily", "clara", "james", "hannah", "william"],
  ["clara", "james", "william", "emily", "hannah"],
  ["james", "william", "hannah", "clara", "emily"],
  ["william", "hannah", "emily", "james", "clara"],
] as const satisfies ReadonlyArray<readonly ChildId[]>;

export const ROTATION_LENGTH_WEEKS = CHILD_ROTATION_SCHEDULE.length;
