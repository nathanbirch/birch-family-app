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

import { DEALS_CHART } from "@/config/deals";
import { getChildren, getPerson, type ChildId } from "@/config/family";
import { CENTS_PER_STAR, centsForStars } from "@/config/rewards";
import { CHARTS, type Chart } from "@/config/stars";
import type { ChorePool } from "@/config/chore-rotation";
import { addDays, startOfWeekMonday, toIsoDate } from "@/lib/dates";

import { tally, tallyDeals, type StarMarks, type WeekMarks } from "./counting";
import { getWeekDealsForChild } from "./deals";
import { getTasksForChild } from "./tasks";

/**
 * The sections of a ceremony slide, in the order they arrive on it.
 *
 * The three printed charts, then the Star Deals. Deals go last on purpose: it
 * is the line with the biggest number behind the smallest count, so a child
 * watching their slide reads "Chores 18, Learning 20, Hygiene 20, Star Deals
 * 9" and the last one is the surprise rather than the preamble.
 *
 * `CHARTS` itself is left alone — it is the three sheets on the fridge, and
 * `config/stars.ts` keeps it that way. See `DEALS_CHART`.
 */
const CEREMONY_CHARTS: readonly Chart[] = [...CHARTS, DEALS_CHART];

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

/**
 * A ceremony's numbers: one week's, or several weeks added together.
 *
 * The type is deliberately the *same* for both. Everything downstream — the
 * card, the archive row, the seven slides, the count-up on the finale — asks a
 * report the same questions whatever period it covers, and the two places that
 * genuinely have to know the difference (the wording, and the URL) are the two
 * fields below rather than a second type and a second set of components.
 */
export type WeekReport = {
  /** The first Monday, `YYYY-MM-DD`. */
  weekStart: string;
  /** The last Friday — the last day a star could be earned. */
  weekEnd: string;
  /**
   * The segment under `/ceremonies` where this ceremony lives.
   *
   * A week's own Monday for an ordinary report, and the id from
   * `config/ceremonies.ts` for one that spans several. Reports carry it rather
   * than every link rebuilding it from `weekStart`, which stopped being a
   * unique identity the moment two reports could start on the same Monday.
   */
  slug: string;
  /** How many chart weeks this covers. 1 for an ordinary report. */
  weekCount: number;
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
 * `monday` is also the date the chore rotation is asked about: a week is
 * always reported as of its own Monday, so looking back at July in December
 * gives July's answer. The live chart asks about the same date, which is the
 * whole reason the chores swap on Monday morning rather than mid-week — a week
 * has one deal from end to end, and the report and the chart cannot disagree
 * about it.
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

  const weekStart = toIsoDate(startOfWeekMonday(monday));

  return {
    weekStart,
    weekEnd: toIsoDate(addDays(startOfWeekMonday(monday), 4)),
    // A week is addressed by its own Monday. Nothing else has to be invented,
    // and a URL somebody typed from the date on the card still works.
    slug: weekStart,
    weekCount: 1,
    children,
    earned,
    possible,
    // Counted from the family total rather than summed from the five, so the
    // finale can never be a cent away from the slides that led to it.
    cents: centsForStars(earned),
  };
}

/**
 * Several finished weeks, added up into one ceremony.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS ADDS UP REPORTS RATHER THAN MERGING MARKS
 * ---------------------------------------------------------------------------
 * The tempting shortcut is to merge three weeks of `marks` into one and hand
 * the result to `buildWeekReport`. It would be wrong twice over, and quietly:
 *
 *  - **A row is five days long.** Merging would have to decide what
 *    `tidy-room` means when three weeks each have five days of it, and every
 *    answer is a lie — including the one where a fifteen-day row is a "whole
 *    row" once instead of three times.
 *  - **The rotation moves.** Which chores were Clara's is a property of the
 *    week, not of the span, so July's stars have to be counted against July's
 *    chart and August's against August's. One merged report could only ask
 *    once.
 *
 * So each week is built exactly as it would be on its own — same rotation,
 * same rows, same arithmetic — and the totals are summed afterwards. A span
 * ceremony can therefore never disagree with the individual weeks it is made
 * of, which is the property that matters when a child adds them up themselves.
 *
 * `weeks` is oldest first, each one a Monday and the marks belonging to it.
 * The charts on a child's slide are summed by chart, so a chart nobody had a
 * row on in any of the weeks is still dropped.
 */
export function buildSpanReport(
  pools: readonly ChorePool[],
  slug: string,
  weeks: readonly { monday: Date; marks: WeekMarks }[],
): WeekReport {
  if (weeks.length === 0) {
    throw new Error(
      `Ceremony "${slug}" spans no weeks at all. Check config/ceremonies.ts.`,
    );
  }

  const reports = weeks.map(({ monday, marks }) =>
    buildWeekReport(pools, monday, marks),
  );

  // Sorted rather than trusted: the first Monday and the last Friday are what
  // the ceremony is *called*, and an entry written out of order in the config
  // would otherwise print a range that runs backwards.
  const starts = reports.map((report) => report.weekStart).sort();
  const ends = reports.map((report) => report.weekEnd).sort();

  const children = ceremonyOrder().map((childId) =>
    sumChildReports(
      reports.map(
        (report) =>
          // Every report has every child, in the same order, because
          // `ceremonyOrder()` built them — so this cannot miss.
          report.children.find((child) => child.childId === childId)!,
      ),
    ),
  );

  const earned = children.reduce((total, child) => total + child.earned, 0);

  return {
    weekStart: starts[0],
    weekEnd: ends[ends.length - 1],
    slug,
    weekCount: reports.length,
    children,
    earned,
    possible: children.reduce((total, child) => total + child.possible, 0),
    cents: centsForStars(earned),
  };
}

/** One child's weeks, added together. `parts` is never empty. */
function sumChildReports(parts: readonly ChildReport[]): ChildReport {
  const charts: ChartResult[] = CEREMONY_CHARTS.map((chart) => {
    const across = parts.flatMap((part) =>
      part.charts.filter((result) => result.chart.id === chart.id),
    );

    const earned = across.reduce((total, result) => total + result.earned, 0);
    const possible = across.reduce((total, result) => total + result.possible, 0);

    return {
      chart,
      earned,
      possible,
      /*
       * Whole rows *summed*, not recomputed. Three weeks of tidying a room
       * every day is three whole rows and should be read out as three — the
       * reward on the paper chart is per week, and a span does not change what
       * was earned.
       */
      completeRows: across.reduce(
        (total, result) => total + result.completeRows,
        0,
      ),
      // Perfect across the whole span, which is a much harder thing than
      // perfect in one week — and the only reading that is true.
      perfect: possible > 0 && earned === possible,
    };
  }).filter((result) => result.possible > 0);

  const earned = parts.reduce((total, part) => total + part.earned, 0);
  const first = parts[0];

  return {
    childId: first.childId,
    name: first.name,
    color: first.color,
    colorDark: first.colorDark,
    charts,
    earned,
    possible: parts.reduce((total, part) => total + part.possible, 0),
    completeRows: parts.reduce((total, part) => total + part.completeRows, 0),
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

  /*
   * The week's deals are recomputed from the calendar rather than read back
   * from anything — the same principle as the rotation, and the reason a
   * ceremony for a week in March shows March's deals. See `lib/stars/deals.ts`.
   */
  const deals = tallyDeals(marks, getWeekDealsForChild(monday, childId));

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
  });

  charts.push({
    chart: DEALS_CHART,
    earned: deals.earned,
    possible: deals.possible,
    /*
     * Zero, always. A deal is not a row: it is one day wide, so there is
     * nothing to fill "all the way across" and counting five taken deals as
     * five whole rows would put a number in the ceremony's "whole rows" line
     * that does not mean what the rest of that line means.
     */
    completeRows: 0,
    perfect: deals.offered > 0 && deals.taken === deals.offered,
  });

  const whole = tally(marks, tasks);

  return {
    childId,
    name: person.name,
    color: person.avatarColor,
    colorDark: person.avatarColorDark,
    charts: charts.filter((result) => result.possible > 0),
    // The deals are in the total, at three stars each, which is what makes
    // them worth the interruption — and what puts them in the money below.
    earned: whole.earned + deals.earned,
    possible: whole.possible + deals.possible,
    completeRows: whole.completeRows,
    cents: centsForStars(whole.earned + deals.earned),
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
export function praiseFor(child: ChildReport, weekCount = 1): string {
  const period = periodNoun(weekCount);

  if (child.possible === 0) return `Nothing on the chart ${periodPhrase(weekCount)}`;
  if (child.earned === 0) return `A fresh start ${periodPhrase(weekCount)}`;

  const share = child.earned / child.possible;
  if (share === 1) return `A perfect ${period} — every single star!`;
  // "What a week!" does not survive being made plural, so a span gets its own
  // word rather than "What a 3 weeks!".
  if (share >= 0.9) return weekCount === 1 ? "What a week!" : "What a run!";
  if (share >= 0.7) return "Brilliant work";
  if (share >= 0.4) return "Good going";
  return "Every star counts";
}

/**
 * What to call the period a report covers.
 *
 * Three of them, because English will not let one string do the job: "a
 * perfect week" needs the bare noun, "nothing on the chart this week" needs
 * the demonstrative, and the finale's caption reads better as "in 3 weeks"
 * than as either. They live here rather than in the components so a slide, a
 * card and a row cannot each invent their own phrasing for the same span.
 */

/** "week" / "3 weeks". */
export function periodNoun(weekCount: number): string {
  return weekCount === 1 ? "week" : `${weekCount} weeks`;
}

/** "this week" / "these 3 weeks". */
export function periodPhrase(weekCount: number): string {
  return weekCount === 1 ? "this week" : `these ${weekCount} weeks`;
}

/** The line under the family's total on the finale. */
export function totalCaption(weekCount: number): string {
  return weekCount === 1 ? "stars this week" : `stars in ${weekCount} weeks`;
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
