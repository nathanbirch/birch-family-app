"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isStarDealId } from "@/config/deals";
import { CHILD_IDS, type ChildId } from "@/config/family";
import { STAR_MAX_DAY_COUNT } from "@/config/stars";
import { requireUser } from "@/lib/auth/dal";
import { familyNow } from "@/lib/family-api/time";

import type { StarActionResult } from "./action-result";
import { isDealForChild } from "./deals";
import { setStarMark } from "./marks";
import { getChorePools } from "./rotation-store";
import { isTaskForChild } from "./tasks";
import { openDayIndex, parseWeekStart } from "./week";

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
  /*
   * The widest a week ever is. The real gate is `openDayIndex` below, which
   * knows which week this is and what day it is where the children are; this
   * only keeps a nonsense number out of the parser.
   */
  dayIndex: z.number().int().min(0).max(STAR_MAX_DAY_COUNT - 1),
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
   * Only today's column, and only in the week that is actually running.
   *
   * The chart already renders the other four columns as untappable, but that
   * is a rendering decision and this is a POST endpoint — see the note at the
   * top. `familyNow()` rather than `new Date()` because the check has to be
   * made on Rexburg's calendar: this runs on Vercel, where from teatime
   * onwards "today" is already tomorrow, and a UTC clock would spend every
   * evening refusing the column the children were looking at and opening the
   * one they were not.
   *
   * See `openDayIndex()` for why a star is a record of a day rather than a box
   * to fill in whenever the row looks untidy.
   */
  const openIndex = openDayIndex(monday, familyNow().civilNoon);
  if (dayIndex !== openIndex) {
    return {
      ok: false,
      message:
        openIndex === -1
          ? "Stars can only be coloured in Monday to Saturday."
          : "Only today's star can be coloured in.",
    };
  }

  /*
   * The task must be on *this child's* chart for *that* week. Without this,
   * the endpoint would happily file a cello star against James, or a chore
   * against the child who had it last week — and the weekly report would then
   * award stars nobody could have earned.
   *
   * The rotation is asked about the week's own Monday, which is the same date
   * the chart was rendered from and the same one the report will use later.
   */
  /*
   * A Star Deal is checked against the day rather than against the week. It is
   * one child's, on one day, and derived from the calendar — so this rejects
   * yesterday's deal filed against today, a sibling's deal, and the pick of
   * the whole list of fifty-three, all with the same comparison. `dayIndex` is
   * already known to be today's; see the check above.
   */
  if (isStarDealId(taskId)) {
    if (!isDealForChild(monday, dayIndex, childId as ChildId, taskId)) {
      return { ok: false, message: "That is not today’s deal." };
    }
  } else {
    const pools = await getChorePools();
    if (!isTaskForChild(pools, monday, childId as ChildId, taskId)) {
      return { ok: false, message: "That is not on this chart." };
    }
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
