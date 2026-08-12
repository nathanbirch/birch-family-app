/**
 * Which child has which chore, and how that changes on Monday morning.
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
 * POOLS: TWO PAIRS THAT SWAP, AND ONE BOY WHO DOES NOT
 * ---------------------------------------------------------------------------
 * A single rotation across all five children would eventually hand the kitchen
 * island to James and "pick up your toys" to Hannah. So the chores rotate
 * inside **pools** — a set of children close enough in age to do each other's
 * jobs. Pools are disjoint: a child belongs to at most one, which is what
 * makes "how many chores does Clara have this week" a question with one
 * answer.
 *
 *   `elder-pair`    Hannah and Emily, swapping every Monday.
 *   `younger-pair`  Clara and William, swapping every Monday.
 *
 * **James is in no pool at all.** His chores stay his indefinitely, so feeding
 * Bella is a `fixed` task in `config/stars.ts` rather than a rotating one.
 * When that changes it is a deploy, not a rotation — which is the difference
 * between the two kinds. Chores nobody owns in particular (tidy your room,
 * take your laundry up) are `everyone` tasks there for the same reason.
 *
 * ---------------------------------------------------------------------------
 * THE RULE, IN ONE LINE
 * ---------------------------------------------------------------------------
 *   chore j goes to  children[(j + weeks since the anchor) mod children.length]
 *
 * With two children in a pool that is simply "swap on Monday", but the
 * round-robin is kept rather than special-cased into a boolean, and it buys:
 *
 *  - **Uneven counts for free.** The younger pair has three chores between
 *    two children, so one of them does two this week and one next week. The
 *    odd chore alternates along with the rest; nothing has to know it is the
 *    odd one.
 *  - **Everybody does everything.** Child `c` holds chore `j` exactly when
 *    `j ≡ c - offset (mod n)`, so after `n` weeks — two, here — every child
 *    has held every chore in their pair, and no child has the same chore two
 *    weeks running.
 *  - **A third child can join a pair** without touching the maths. Add them to
 *    `children` and the swap becomes a three-way rotation.
 *  - **It only runs forwards.** It used to run backwards too — "whose was the
 *    dishwasher in May" was the same sum with a negative offset — and that was
 *    removed once the fridge disproved it: the chart is laminated with each
 *    child's chores *printed* on it, so it did not rotate before the anchor
 *    and the extrapolation was inventing a history. Weeks before the anchor
 *    now use the anchor's deal. See `getChoreWeekOffset()`.
 *
 * ---------------------------------------------------------------------------
 * `chores` IS A DEALING ORDER, NOT A READING ORDER
 * ---------------------------------------------------------------------------
 * Because the deal is round-robin, **consecutive entries in `chores` go to
 * different children**. The lists below are therefore interleaved rather than
 * grouped: they alternate between the two children of the pair. That is why
 * the order looks shuffled next to the printed chart — it is dealing cards,
 * not reading a column.
 *
 * Reordering this list *reassigns chores*. Adding one to the end is safe and
 * simply extends the deal; inserting one in the middle shifts everything after
 * it onto the other child. If you want a one-off change, do not reorder —
 * that is what the (forthcoming) per-rotation override is for.
 */

import type { ChildId } from "./family";

export type ChorePoolId = "elder-pair" | "younger-pair";

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
   * The Monday (`YYYY-MM-DD`) of a week in which the deal above is exactly
   * right. It must be a Monday: the rotation turns over at midnight going into
   * Monday, and an anchor set to a Wednesday would quietly move the changeover
   * to Wednesdays.
   *
   * Like the pets' `anchorDate`, this is *a week whose answer is known* and
   * not a "start date". Every week before and after it derives from this one,
   * so fixing a mistake means re-anchoring rather than back-filling.
   */
  anchorWeek: string;
};

/**
 * The pools as photographed on 4 August 2026, anchored on the week of Monday
 * 10 August 2026 — the week the weekly swap began.
 *
 * That anchor is deliberately *this* week rather than the week of the
 * photographs. Chores rotated monthly until now, so every week up to and
 * including the anchor was dealt exactly as the photographs show; anchoring
 * here keeps all of that history true (weeks before the anchor use the
 * anchor's deal) and makes the first swap Monday 17 August 2026.
 *
 * Read the August column of the chore chart against these and they match, one
 * chore at a time — that is the anchor, and `tests/chore-rotation.test.ts`
 * pins it so a future edit cannot quietly move it.
 */
export const CHORE_POOLS: readonly ChorePool[] = [
  {
    id: "elder-pair",
    name: "Hannah & Emily",
    children: ["hannah", "emily"],
    chores: [
      // Round one: one each.
      "kitchen-island", // Hannah, in the anchor week
      "dishwasher", // Emily
      // Round two: one each again.
      "bath-trash", // Hannah
      "yard-pickup", // Emily
    ],
    anchorWeek: "2026-08-10",
  },
  {
    id: "younger-pair",
    name: "Clara & William",
    children: ["clara", "william"],
    // Three chores between two children: Clara has two of them in the anchor
    // week and William two the week after. The pair take turns at the odd one.
    chores: [
      "pick-up-living-room", // Clara, in the anchor week
      "vacuum-wooden-floor", // William
      "vacuum-living-room", // Clara
    ],
    anchorWeek: "2026-08-10",
  },
] as const;

/** How many weeks until a pool is back where it started. */
export function cycleLengthOf(pool: ChorePool): number {
  return pool.children.length;
}
