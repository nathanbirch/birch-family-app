"use server";

import { z } from "zod";

import { CHILD_IDS, type ChildId } from "@/config/family";
import { coinsForStars } from "@/config/rewards";
import { requireUser } from "@/lib/auth/dal";
import { familyNow } from "@/lib/family-api/time";
import { getWeekMarks } from "@/lib/stars/marks";
import { buildWeekReport, isCompletedWeek } from "@/lib/stars/report";
import { getChorePools } from "@/lib/stars/rotation-store";
import { parseWeekStart } from "@/lib/stars/week";

import type { CoinsActionResult } from "./action-result";
import { insertConversion } from "./store";

/**
 * Turning a week's stars into coins, from a ceremony slide.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE MAY ONLY EXPORT ASYNC FUNCTIONS
 * ---------------------------------------------------------------------------
 * `"use server"` turns every export into a POST endpoint reachable by anyone
 * who can reach the site, whether or not they went through a ceremony. So
 * every check lives *inside* the action — including the one thing the page
 * enforces only by not drawing the button: this never converts a week that
 * has not finished, and never converts a span. See below.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STAR TOTAL IS RECOMPUTED HERE RATHER THAN TRUSTED FROM THE CLIENT
 * ---------------------------------------------------------------------------
 * The slide already knows the total — it just finished counting it up on
 * screen — but a Server Action must never take a number like that as an
 * argument. `buildWeekReport` is the same pure arithmetic the slide itself
 * used to get that number, run again here against `starWeeks` as it stands
 * *right now*, so a star corrected five minutes after the ceremony converts
 * at the corrected total rather than at whatever the browser remembered.
 */

const ConvertSchema = z.object({
  childId: z.enum(CHILD_IDS as unknown as [ChildId, ...ChildId[]]),
  weekStart: z.string(),
});

export async function convertWeekToCoins(input: {
  childId: string;
  weekStart: string;
}): Promise<CoinsActionResult> {
  const user = await requireUser();

  const parsed = ConvertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That week could not be converted." };
  }
  const { childId, weekStart } = parsed.data;

  const monday = parseWeekStart(weekStart);
  if (!monday) {
    return { ok: false, message: "That is not a week this app knows." };
  }

  // The family's clock, not the device's — the same guard the ceremony page
  // itself uses, so a request replayed after the fact cannot convert a week
  // that had not finished when it claims to have watched it.
  if (!isCompletedWeek(weekStart, familyNow().civilNoon)) {
    return { ok: false, message: "That week has not finished yet." };
  }

  try {
    const [pools, marks] = await Promise.all([
      getChorePools(),
      getWeekMarks(weekStart),
    ]);

    const report = buildWeekReport(pools, monday, marks);
    const child = report.children.find((entry) => entry.childId === childId);
    const stars = child?.earned ?? 0;
    const amount = coinsForStars(stars);

    const result = await insertConversion({
      childId,
      weekStart,
      amount,
      createdBy: user.displayName,
    });

    return {
      ok: true,
      amount: result.amount,
      alreadyConverted: result.outcome === "already-converted",
    };
  } catch (error) {
    console.error(
      `[coins] Could not convert ${childId}'s week of ${weekStart}:`,
      error,
    );
    return { ok: false, message: "That could not be converted. Try again." };
  }
}
