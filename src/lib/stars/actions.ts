"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CHILD_IDS, type ChildId } from "@/config/family";
import { STAR_DAY_COUNT } from "@/config/stars";
import { requireUser } from "@/lib/auth/dal";

import type { StarActionResult } from "./action-result";
import { setStarMark } from "./marks";
import { getChorePools } from "./rotation-store";
import { isTaskForChild } from "./tasks";
import { parseWeekStart, referenceDateFor } from "./week";

/**
 * Ticking a star.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE MAY ONLY EXPORT ASYNC FUNCTIONS
 * ---------------------------------------------------------------------------
 * `"use server"` makes every export a POST endpoint reachable by anyone who can
 * reach the site, whether or not they went through the page. So every check
 * lives *inside* the action — rendering only the child's own tasks is a
 * rendering decision, not a security boundary. The result type lives in
 * `action-result.ts` because exporting it from here would make Next.js reject
 * the whole module.
 */

const ToggleSchema = z.object({
  childId: z.enum(CHILD_IDS as unknown as [string, ...string[]]),
  /** The Monday of the week, `YYYY-MM-DD`. */
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That is not a date."),
  taskId: z.string().min(1).max(64),
  dayIndex: z.number().int().min(0).max(STAR_DAY_COUNT - 1),
  value: z.boolean(),
});

/**
 * Colour in a star, or rub one out.
 *
 * Deliberately idempotent — it sets a value rather than flipping one. Two taps
 * racing each other, or a retry after a flaky connection, land on the state the
 * child last asked for instead of undoing it.
 */
export async function setStar(input: {
  childId: string;
  weekStart: string;
  taskId: string;
  dayIndex: number;
  value: boolean;
}): Promise<StarActionResult> {
  await requireUser();

  const parsed = ToggleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That star could not be saved." };
  }
  const { childId, weekStart, taskId, dayIndex, value } = parsed.data;

  const monday = parseWeekStart(weekStart);
  if (!monday) {
    return { ok: false, message: "That week could not be saved." };
  }

  /*
   * The task must be on *this child's* chart for *that* week. Without this,
   * the endpoint would happily file a cello star against James, or a chore
   * against the child who had it last month — and the weekly report would then
   * award stars nobody could have earned.
   */
  const pools = await getChorePools();
  const reference = referenceDateFor(monday, new Date());
  if (!isTaskForChild(pools, reference, childId as ChildId, taskId)) {
    return { ok: false, message: "That is not on this chart." };
  }

  try {
    await setStarMark(childId as ChildId, weekStart, taskId, dayIndex, value);
  } catch (error) {
    console.error(
      `[stars] Could not save a star for ${childId}/${taskId}:`,
      error,
    );
    return { ok: false, message: "That star could not be saved. Try again." };
  }

  revalidatePath("/stars");
  return { ok: true };
}
