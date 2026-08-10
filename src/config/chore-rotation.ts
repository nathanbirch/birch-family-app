/**
 * Which child has which chore, and how that changes on the first of the month.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS IN THE DATABASE AND WHAT IS COMPILED IN
 * ---------------------------------------------------------------------------
 * Same split as the pets, and for the same reason. *Which chores exist* is
 * compiled in, next to their printed labels, in `config/stars.ts`. *Who has
 * them* lives in MongoDB, in the `choreRotations` collection, so the family can
 * re-anchor or reorder a pool without a deploy. What is below is the seed for
 * that collection and the fallback the page uses if the database cannot be
 * reached — see `lib/stars/rotation-store.ts`.
 *
 * ---------------------------------------------------------------------------
 * POOLS: A FOUR-YEAR-OLD DOES NOT LOAD THE DISHWASHER
 * ---------------------------------------------------------------------------
 * A single rotation across all five children would eventually hand the kitchen
 * island to James and "pick up your toys" to Hannah. So the chores rotate
 * inside **pools** — a set of children old enough for a set of chores. Pools
 * are disjoint: a child belongs to exactly one, which is what makes "how many
 * chores does Clara have this month" a question with one answer.
 *
 * Chores that never move (tidy your room, take your laundry up) are not in a
 * pool at all. They are `everyone` tasks in `config/stars.ts`.
 *
 * ---------------------------------------------------------------------------
 * THE RULE, IN ONE LINE
 * ---------------------------------------------------------------------------
 *   chore j goes to  children[(j + months since the anchor) mod children.length]
 *
 * That is a round-robin deal, and it is worth understanding what it buys:
 *
 *  - **It handles uneven counts for free.** Six chores across three children is
 *    two each; five would be two-two-one, with the short straw moving on next
 *    month. Nothing in the code has to know which case it is in.
 *  - **Everybody does everything.** Child `c` holds chore `j` exactly when
 *    `j ≡ c - offset (mod n)`, so after `n` months every child has held every
 *    chore in their pool, and the cycle repeats. For the big three that is a
 *    complete turn of all six chores every three months.
 *  - **It only runs forwards.** It used to run backwards too — "whose was the
 *    dishwasher in May" was the same sum with a negative offset — and that was
 *    removed once the fridge disproved it: the chart is laminated with each
 *    child's chores *printed* on it, so it did not rotate before the anchor
 *    and the extrapolation was inventing a history. Months before the anchor
 *    now use the anchor's deal. See `getChoreMonthOffset()`.
 *
 * ---------------------------------------------------------------------------
 * `chores` IS A DEALING ORDER, NOT A READING ORDER
 * ---------------------------------------------------------------------------
 * Because the deal is round-robin, **consecutive entries in `chores` go to
 * different children**. The lists below are therefore interleaved rather than
 * grouped: the first three entries are one each for Clara, Emily and Hannah,
 * and the next three go round again. That is why the order looks shuffled next
 * to the printed chart — it is dealing cards, not reading a column.
 *
 * Reordering this list *reassigns chores*. Adding one to the end is safe and
 * simply extends the deal; inserting one in the middle shifts everything after
 * it onto a different child. If you want a one-off change, do not reorder —
 * that is what the (forthcoming) per-rotation override is for.
 */

import type { ChildId } from "./family";

export type ChorePoolId = "bigs" | "littles";

export type ChorePool = {
  id: ChorePoolId;
  /** Shown when the page explains a rotation. Ours, not off the chart. */
  name: string;
  /**
   * The children in the pool, in the order the chores walk through them.
   * Changing this order reassigns chores; see the note above.
   */
  children: readonly ChildId[];
  /**
   * Task ids from `config/stars.ts`, in dealing order. Every task marked
   * `rotating` there must appear in exactly one pool here — `tests/
   * chore-rotation.test.ts` fails if one is orphaned or listed twice.
   */
  chores: readonly string[];
  /**
   * The month (`YYYY-MM`) in which the deal above is exactly right, as a
   * calendar month rather than a date: the rotation turns over at midnight on
   * the 1st.
   *
   * Like the pets' `anchorDate`, this is *a month whose answer is known* and
   * not a "start date". Every month before and after it derives from this one,
   * so fixing a mistake means re-anchoring rather than back-filling.
   */
  anchorMonth: string;
};

/**
 * The pools as photographed on 4 August 2026.
 *
 * Read the August column of the chore chart against these and they match, one
 * chore at a time — that is the anchor, and `tests/chore-rotation.test.ts`
 * pins it so a future edit cannot quietly move August.
 */
export const CHORE_POOLS: readonly ChorePool[] = [
  {
    id: "bigs",
    name: "The big three",
    children: ["clara", "emily", "hannah"],
    chores: [
      // Round one: one each.
      "pick-up-living-room", // Clara, in August
      "dishwasher", // Emily
      "kitchen-island", // Hannah
      // Round two: one each again.
      "vacuum-living-room", // Clara
      "yard-pickup", // Emily
      "bath-trash", // Hannah
    ],
    anchorMonth: "2026-08",
  },
  {
    id: "littles",
    name: "The little two",
    children: ["james", "william"],
    chores: [
      "feed-bella", // James, in August
      "vacuum-wooden-floor", // William
    ],
    anchorMonth: "2026-08",
  },
] as const;

/** How many months until a pool is back where it started. */
export function cycleLengthOf(pool: ChorePool): number {
  return pool.children.length;
}
