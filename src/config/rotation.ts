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
 *   Week-to-week siblings kept shoulder-to-shoulder: 0, 0, 0, 0, 0  (total 0)
 *   ...including the Week 5 -> Week 1 wrap.
 *
 *   Sibling pairs sharing a shoulder-to-shoulder seat over the whole cycle,
 *   counting the dinner table and the Expedition together:
 *
 *     hannah + emily     4      emily + clara      2
 *     hannah + clara     4      emily + william    4
 *     hannah + william   2      emily + james      2
 *     hannah + james     2      clara + william    2
 *     william + james    4      clara + james      4
 *
 *   So each pair sits side by side either 2 or 4 times across ten shared
 *   seatings. That is even but NOT perfectly equal, and the search proves the
 *   trade-off is real: a perfectly equal distribution (every pair exactly 3
 *   strong and 3 weak) does exist, but only at the cost of 5 repeated
 *   adjacencies — one sibling pair stays side by side through every single
 *   rotation. The stated priorities rank "minimise repeated adjacency in
 *   consecutive weeks" above "distribute pairings evenly", so the zero-repeat
 *   schedule wins.
 *
 *   The perfectly-even alternative, if you would rather have it:
 *
 *     ["hannah", "emily",   "clara",   "william", "james"],
 *     ["emily",  "william", "james",   "clara",   "hannah"],
 *     ["clara",  "james",   "emily",   "hannah",  "william"],
 *     ["william","clara",   "hannah",  "james",   "emily"],
 *     ["james",  "hannah",  "william", "emily",   "clara"],
 *
 *   Both satisfy every hard requirement. Swap it in and run `npm test`.
 * ---------------------------------------------------------------------------
 *
 * If you edit these weeks, run `npm test` — the schedule tests enforce all the
 * hard fairness rules and will fail loudly on a bad edit.
 */

import type { ChildId } from "./family";

export const CHILD_ROTATION_SCHEDULE = [
  ["hannah", "emily", "clara", "william", "james"],
  ["emily", "william", "hannah", "james", "clara"],
  ["william", "james", "emily", "clara", "hannah"],
  ["james", "clara", "william", "hannah", "emily"],
  ["clara", "hannah", "james", "emily", "william"],
] as const satisfies ReadonlyArray<readonly ChildId[]>;

export const ROTATION_LENGTH_WEEKS = CHILD_ROTATION_SCHEDULE.length;
