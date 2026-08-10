/**
 * Chore rotation maths. Pure functions only — nothing here touches React or
 * the database.
 *
 * Three rotations now live in this app and they are deliberately the same
 * shape: the seats turn over every Monday, the pets every night, and the
 * chores on the first of every month. All three derive their answer from an
 * anchor plus elapsed time rather than from stored state, which is what makes
 * every past and future month answerable without a row per month.
 *
 *   chore j goes to  children[(j + months since the anchor) mod children.length]
 *
 * See `config/chore-rotation.ts` for why the deal is round-robin and why the
 * `chores` list is interleaved.
 */

import type { ChorePool, ChorePoolId } from "@/config/chore-rotation";
import type { ChildId } from "@/config/family";
import { getRotatingTasks, getStarTask } from "@/config/stars";
import {
  differenceInCalendarMonths,
  parseLocalMonth,
  startOfNextMonth,
  differenceInCalendarDays,
} from "@/lib/dates";

export type ChoreAssignment = {
  /** A task id from `config/stars.ts`. */
  taskId: string;
  childId: ChildId;
  poolId: ChorePoolId;
};

/**
 * How many months `date` sits after the pool's anchor. Never negative.
 *
 * The day of the month is ignored, so this steps by exactly one at midnight on
 * the 1st and never in between — the property the whole rotation rests on.
 *
 * ---------------------------------------------------------------------------
 * WHY IT DOES NOT RUN BACKWARDS
 * ---------------------------------------------------------------------------
 * It used to. "Whose was the dishwasher in May?" was the same calculation with
 * a negative offset, and the ability to answer the whole of history from one
 * anchor was written down here as a feature.
 *
 * It was wrong, and the fridge is what proved it. **The chore chart is
 * laminated with each child's chores printed on it.** Clara's column says
 * "Pick up living room floor" and it said so in July, because printed card
 * does not rotate. So when two July weeks were back-filled off photographs of
 * that chart, fourteen stars landed on chores the extrapolation insisted had
 * belonged to somebody else — Hannah's bath trash, Clara's living room, James
 * feeding Bella — and went uncounted in those weeks' ceremonies. Children who
 * had done the jobs were not paid for them.
 *
 * The anchor is documented as *a month whose answer is known*, and that is the
 * whole point: before it, nothing is known. Running the deal backwards was not
 * recovering history, it was inventing a history that happened not to have
 * occurred. Every month before the anchor therefore uses the anchor's own
 * deal, which is exactly what the printed chart shows and the only answer
 * there is evidence for.
 *
 * This costs nothing real. Nothing in the app rotated before August 2026,
 * because the app did not exist; and if the chores are ever genuinely
 * re-dealt, the fix is to re-anchor — which is a one-field edit in the
 * `choreRotations` document — or to add the per-month override
 * `config/chore-rotation.ts` describes. Neither is served by guessing.
 */
export function getChoreMonthOffset(pool: ChorePool, date: Date): number {
  const anchor = parseLocalMonth(pool.anchorMonth);
  if (!anchor) {
    throw new Error(
      `Chore pool "${pool.id}" has an anchorMonth of "${pool.anchorMonth}", ` +
        `which is not a valid YYYY-MM month.`,
    );
  }
  return Math.max(0, differenceInCalendarMonths(anchor, date));
}

/** Every rotating chore in one pool, and who has it in `date`'s month. */
export function getPoolAssignments(
  pool: ChorePool,
  date: Date,
): ChoreAssignment[] {
  if (pool.children.length === 0) {
    throw new Error(
      `Chore pool "${pool.id}" has no children in it. Check the ` +
        `choreRotations collection, or src/config/chore-rotation.ts.`,
    );
  }

  const offset = getChoreMonthOffset(pool, date);
  return pool.chores.map((taskId, index) => ({
    taskId,
    poolId: pool.id,
    childId: pool.children[modulo(index + offset, pool.children.length)],
  }));
}

/** Every rotating chore across every pool, for the month containing `date`. */
export function getChoreAssignments(
  pools: readonly ChorePool[],
  date: Date,
): ChoreAssignment[] {
  return pools.flatMap((pool) => getPoolAssignments(pool, date));
}

/** Just this child's rotating chores, as task ids in dealing order. */
export function getChoresForChild(
  pools: readonly ChorePool[],
  date: Date,
  childId: ChildId,
): string[] {
  return getChoreAssignments(pools, date)
    .filter((assignment) => assignment.childId === childId)
    .map((assignment) => assignment.taskId);
}

/** Which child holds one particular chore this month, or `null` if it is not in any pool. */
export function getChoreOwner(
  pools: readonly ChorePool[],
  date: Date,
  taskId: string,
): ChildId | null {
  const match = getChoreAssignments(pools, date).find(
    (assignment) => assignment.taskId === taskId,
  );
  return match ? match.childId : null;
}

/* ------------------------------------------------------------------ */
/* When the chores change hands                                        */
/* ------------------------------------------------------------------ */

/** Midnight on the first of next month — when every pool moves on. */
export function getNextChoreRotation(date: Date): Date {
  return startOfNextMonth(date);
}

/** Whole days until the chores change hands. Never 0 — the 1st reports a full month. */
export function getDaysUntilChoreRotation(date: Date): number {
  return differenceInCalendarDays(date, getNextChoreRotation(date));
}

/** Friendly, child-readable countdown copy. */
export function getChoreCountdownLabel(date: Date): string {
  const days = getDaysUntilChoreRotation(date);
  if (days === 1) return "New chores tomorrow";
  return `New chores in ${days} days`;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Everything that must be true of a set of pools before the app will use them.
 *
 * Reading from the database is forgiving and falls back to the compiled pools
 * (see `rotation-store.ts`); this is the function that decides what "unusable"
 * means, and it is the same one the seed script refuses to write past. One
 * definition of a correct rotation, not two.
 *
 * Returns a human-readable reason, or `null` when the pools are sound.
 */
export function findChorePoolProblem(
  pools: readonly ChorePool[],
): string | null {
  const seenPools = new Set<string>();
  const seenChildren = new Map<ChildId, ChorePoolId>();
  const seenChores = new Map<string, ChorePoolId>();

  for (const pool of pools) {
    if (seenPools.has(pool.id)) {
      return `There are two chore pools called "${pool.id}".`;
    }
    seenPools.add(pool.id);

    if (!parseLocalMonth(pool.anchorMonth)) {
      return (
        `Chore pool "${pool.id}" is anchored on "${pool.anchorMonth}", ` +
        `which is not a valid YYYY-MM month.`
      );
    }

    if (pool.children.length === 0) {
      return `Chore pool "${pool.id}" has no children in it.`;
    }
    if (pool.chores.length === 0) {
      return `Chore pool "${pool.id}" has no chores in it.`;
    }

    for (const childId of pool.children) {
      const clash = seenChildren.get(childId);
      if (clash !== undefined) {
        return (
          `"${childId}" is in both the "${clash}" and "${pool.id}" pools. ` +
          `A child belongs to exactly one pool, otherwise how many chores ` +
          `they have this month has no single answer.`
        );
      }
      seenChildren.set(childId, pool.id);
    }

    for (const taskId of pool.chores) {
      const task = getStarTask(taskId);
      if (!task) {
        return (
          `Chore pool "${pool.id}" rotates "${taskId}", which is not a task ` +
          `in src/config/stars.ts.`
        );
      }
      if (task.assign.kind !== "rotating") {
        return (
          `Chore pool "${pool.id}" rotates "${taskId}", but that task is ` +
          `marked "${task.assign.kind}" in src/config/stars.ts. A task cannot ` +
          `be both assigned and rotated.`
        );
      }

      const clash = seenChores.get(taskId);
      if (clash !== undefined) {
        return (
          `"${taskId}" is in both the "${clash}" and "${pool.id}" pools, so ` +
          `two children would be told to do it.`
        );
      }
      seenChores.set(taskId, pool.id);
    }
  }

  // The other direction: a chore that exists but nobody rotates would simply
  // never appear on anybody's chart, which is the failure mode that is hardest
  // to notice — nothing breaks, a job just quietly stops being done.
  for (const task of getRotatingTasks()) {
    if (!seenChores.has(task.id)) {
      return (
        `"${task.id}" is marked as rotating in src/config/stars.ts but is not ` +
        `in any pool, so no child would ever be given it.`
      );
    }
  }

  return null;
}

/** Throws if the pools are unusable. */
export function assertChorePoolsValid(pools: readonly ChorePool[]): void {
  const problem = findChorePoolProblem(pools);
  if (problem) throw new Error(problem);
}

/** `%` that returns a non-negative result for negative operands. */
function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}
