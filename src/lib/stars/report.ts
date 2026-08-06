/**
 * The weekly report: one finished week, turned into an award ceremony.
 *
 * Pure, and deliberately free of `server-only` — the page builds a report on
 * the server and the ceremony counts the same numbers in the browser, so they
 * must be the *same* arithmetic rather than two implementations that agree
 * today. Nothing here knows about MongoDB; the marks arrive as an argument.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS STORED
 * ---------------------------------------------------------------------------
 * There is no `reports` collection and there should not be one. A report is
 * `starWeeks` read back through `counting.ts`, so it cannot drift from the
 * charts, a star corrected on Saturday morning is in Sunday's report, and a
 * chore that changed hands in March still reports March correctly because the
 * rotation is recomputed for that week rather than remembered.
 *
 * The cost is that a report is only as good as the rows the config still has.
 * Retire a task and last month's report loses it — which is the same trade
 * `marks.ts` already makes, and the reason task ids are permanent.
 *
 * ---------------------------------------------------------------------------
 * WHICH WEEK
 * ---------------------------------------------------------------------------
 * A week is reportable once it is *over*. The chart runs Monday to Friday but
 * the week does not end until Sunday night, so the report for the week of the
 * 3rd appears on Monday the 10th and is the newest one for exactly seven days
 * — which is what makes "the latest report" a card that sits at the top of the
 * page for a week rather than something that has to be published.
 */

import { getChildren, getPerson, type ChildId } from "@/config/family";
import { CENTS_PER_STAR, centsForStars } from "@/config/rewards";
import { CHARTS, type Chart } from "@/config/stars";
import type { ChorePool } from "@/config/chore-rotation";
import { addDays, startOfWeekMonday, toIsoDate } from "@/lib/dates";

import { tally, type StarMarks, type WeekMarks } from "./counting";
import { getTasksForChild } from "./tasks";

/** How one of the three charts went for one child. */
export type ChartResult = {
  chart: Chart;
  earned: number;
  possible: number;
  /** Rows filled all five days — the reward printed on the paper chart. */
  completeRows: number;
  /** Every star on this chart, earned. Never true for a chart with no rows. */
  perfect: boolean;
};

/** One child's slide. */
export type ChildReport = {
  childId: ChildId;
  name: string;
  /** Their identifying colour, so the slide can be theirs without a lookup. */
  color: string;
  colorDark: string;
  /** In `CHARTS` order. A chart the child had no rows on is left out. */
  charts: ChartResult[];
  earned: number;
  possible: number;
  completeRows: number;
  /** What the week is worth to them, in cents. See `config/rewards.ts`. */
  cents: number;
};

/** A whole week's ceremony. */
export type WeekReport = {
  /** The Monday, `YYYY-MM-DD`. The report's identity and its URL. */
  weekStart: string;
  /** The Friday — the last day a star could be earned. */
  weekEnd: string;
  /** In ceremony order; see `ceremonyOrder()`. */
  children: ChildReport[];
  /** The family's totals, which are the finale. */
  earned: number;
  possible: number;
  cents: number;
};

/**
 * The order the children take the stage: **youngest first**.
 *
 * Two reasons, and the second is the one that decides it. The youngest is
 * four, and four-year-olds watch the first ninety seconds of anything and then
 * wander off — so his moment happens while the room is still watching. And a
 * ceremony should build: the eldest has the most rows on her chart and
 * therefore, most weeks, the biggest number, so going up the ages means the
 * totals tend to climb towards the family finale rather than sag after the
 * first slide.
 *
 * `getChildren()` is in roster order, which is oldest first.
 */
export function ceremonyOrder(): ChildId[] {
  return getChildren()
    .map((child) => child.id as ChildId)
    .reverse();
}

/**
 * Build a report for the week beginning `monday`.
 *
 * `monday` is also the date the chore rotation is asked about: a finished week
 * is always reported as of its own Monday, so looking back at July in December
 * gives July's answer. (The live chart uses today instead — see
 * `referenceDateFor()` in `week.ts` — because a chore handed over mid-week
 * should show on the new child's chart straight away. A finished week has no
 * such "now".)
 */
export function buildWeekReport(
  pools: readonly ChorePool[],
  monday: Date,
  marks: WeekMarks,
): WeekReport {
  const children = ceremonyOrder().map((childId) =>
    buildChildReport(pools, monday, childId, marks[childId] ?? {}),
  );

  const earned = children.reduce((total, child) => total + child.earned, 0);
  const possible = children.reduce((total, child) => total + child.possible, 0);

  return {
    weekStart: toIsoDate(startOfWeekMonday(monday)),
    weekEnd: toIsoDate(addDays(startOfWeekMonday(monday), 4)),
    children,
    earned,
    possible,
    // Counted from the family total rather than summed from the five, so the
    // finale can never be a cent away from the slides that led to it.
    cents: centsForStars(earned),
  };
}

function buildChildReport(
  pools: readonly ChorePool[],
  monday: Date,
  childId: ChildId,
  marks: StarMarks,
): ChildReport {
  const tasks = getTasksForChild(pools, monday, childId);
  const person = getPerson(childId);

  const charts: ChartResult[] = CHARTS.map((chart) => {
    const chartTasks = tasks.filter((task) => task.chart === chart.id);
    const counts = tally(marks, chartTasks);
    return {
      chart,
      earned: counts.earned,
      possible: counts.possible,
      completeRows: counts.completeRows,
      // An empty chart is not a perfect one: there was nothing to finish.
      // Same rule as `isPerfect()`, which this deliberately mirrors rather
      // than calls — the tally is already in hand.
      perfect: chartTasks.length > 0 && counts.earned === counts.possible,
    };
  }).filter((result) => result.possible > 0);

  const whole = tally(marks, tasks);

  return {
    childId,
    name: person.name,
    color: person.avatarColor,
    colorDark: person.avatarColorDark,
    charts,
    earned: whole.earned,
    possible: whole.possible,
    completeRows: whole.completeRows,
    cents: centsForStars(whole.earned),
  };
}

/* ------------------------------------------------------------------ */
/* Which weeks have a report                                           */
/* ------------------------------------------------------------------ */

/**
 * The Monday of the most recently *finished* week, `YYYY-MM-DD`.
 *
 * Not "seven days ago": the answer steps once, at midnight on Monday, and then
 * holds for the whole week. That is precisely the seven days the report card
 * sits at the top of the page for.
 */
export function latestCompletedWeekStart(now: Date): string {
  return toIsoDate(addDays(startOfWeekMonday(now), -7));
}

/**
 * Whether `weekStart` names a week that is over.
 *
 * The current week is not: half its stars have not been earned yet, and a
 * ceremony that congratulates a child for a Tuesday is not a ceremony. A
 * future week is not either, which is what stops a hand-typed URL from
 * conjuring a report full of zeroes for October.
 */
export function isCompletedWeek(weekStart: string, now: Date): boolean {
  return weekStart <= latestCompletedWeekStart(now);
}

/**
 * Every finished week, newest first — the stored ones plus the latest.
 *
 * The latest completed week is always in the list even when nobody ticked a
 * single star, because the page promises a report every Monday and "nobody
 * earned anything last week" is a true report rather than a missing one. Any
 * *other* empty week is simply absent: the app was not being used, and a page
 * of zeroes going back to the beginning of time is noise.
 *
 * Weeks are `YYYY-MM-DD`, so they sort as strings exactly as they sort as
 * dates — no parsing, and no timezone in the comparison.
 */
export function reportableWeeks(
  storedWeeks: readonly string[],
  now: Date,
): string[] {
  const latest = latestCompletedWeekStart(now);
  const weeks = new Set<string>([latest]);
  for (const week of storedWeeks) {
    if (isCompletedWeek(week, now)) weeks.add(week);
  }
  return [...weeks].sort().reverse();
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/**
 * The line under a child's total on their slide.
 *
 * Written as praise that is still *true* on a thin week: a child who earned
 * eleven stars should not be told they were amazing, and should not be told
 * off either. The bands are deliberately generous at the bottom and hard to
 * reach at the top.
 */
export function praiseFor(child: ChildReport): string {
  if (child.possible === 0) return "Nothing on the chart this week";
  if (child.earned === 0) return "A fresh start this week";

  const share = child.earned / child.possible;
  if (share === 1) return "A perfect week — every single star!";
  if (share >= 0.9) return "What a week!";
  if (share >= 0.7) return "Brilliant work";
  if (share >= 0.4) return "Good going";
  return "Every star counts";
}

/** "3 whole rows" / "1 whole row" / "" when there were none. */
export function wholeRowsLabel(completeRows: number): string {
  if (completeRows <= 0) return "";
  return `${completeRows} whole ${completeRows === 1 ? "row" : "rows"}`;
}

/**
 * How a report's money is explained, once, on the finale.
 *
 * Exported so the card, the slide and the docs cannot each invent their own
 * wording for the rate.
 */
export const STAR_RATE_LABEL = `${CENTS_PER_STAR}¢ a star`;
