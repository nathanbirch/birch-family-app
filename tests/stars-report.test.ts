import { describe, expect, it } from "vitest";

import { CHORE_POOLS } from "@/config/chore-rotation";
import { CHILD_IDS, type ChildId } from "@/config/family";
import { CENTS_PER_STAR, centsForStars, formatMoney } from "@/config/rewards";
import { STAR_DAY_COUNT } from "@/config/stars";
import { parseLocalDate } from "@/lib/dates";
import type { WeekMarks } from "@/lib/stars/counting";
import {
  buildWeekReport,
  ceremonyOrder,
  isCompletedWeek,
  latestCompletedWeekStart,
  praiseFor,
  reportableWeeks,
  wholeRowsLabel,
} from "@/lib/stars/report";
import { getChartTasksForChild, getTasksForChild } from "@/lib/stars/tasks";

/**
 * The weekly report.
 *
 * Nothing here is stored, so these tests are really about two things: that a
 * finished week is counted the same way the live chart counts it, and that a
 * week which has *not* finished can never be reported on. The second is the
 * one that matters — a ceremony for a Wednesday-in-progress would congratulate
 * five children for a week half of which has not happened.
 */

/** The Monday of the week the charts were photographed. */
const WEEK = "2026-08-03";
const MONDAY = parseLocalDate(WEEK)!;

function blankWeek(): WeekMarks {
  return Object.fromEntries(CHILD_IDS.map((id) => [id, {}])) as WeekMarks;
}

/** Every star on `chart`, ticked, for one child. */
function fillChart(marks: WeekMarks, childId: ChildId, chart: "hygiene" | "chores") {
  for (const task of getChartTasksForChild(CHORE_POOLS, MONDAY, childId, chart)) {
    marks[childId][task.id] = Array.from({ length: STAR_DAY_COUNT }, () => true);
  }
}

describe("the ceremony order", () => {
  it("puts the youngest on first", () => {
    // The roster is oldest first; the ceremony is the other way round, so the
    // four-year-old has his moment while everyone is still watching and the
    // totals build towards the family finale.
    expect(ceremonyOrder()).toEqual([...CHILD_IDS].reverse());
  });

  it("gives every child exactly one slide", () => {
    const report = buildWeekReport(CHORE_POOLS, MONDAY, blankWeek());
    expect(report.children.map((child) => child.childId)).toEqual(ceremonyOrder());
  });
});

describe("counting a week", () => {
  it("reports a week nobody touched as a week of nothing, not as an error", () => {
    const report = buildWeekReport(CHORE_POOLS, MONDAY, blankWeek());

    expect(report.earned).toBe(0);
    expect(report.cents).toBe(0);
    expect(report.possible).toBeGreaterThan(0);
    for (const child of report.children) {
      expect(child.earned).toBe(0);
      expect(child.charts.every((result) => !result.perfect)).toBe(true);
    }
  });

  it("counts what was ticked, chart by chart and in total", () => {
    const marks = blankWeek();
    fillChart(marks, "hannah", "hygiene");

    const report = buildWeekReport(CHORE_POOLS, MONDAY, marks);
    const hannah = report.children.find((child) => child.childId === "hannah")!;
    const hygiene = hannah.charts.find((result) => result.chart.id === "hygiene")!;

    // Four hygiene rows on everybody's chart, five days each.
    expect(hygiene.possible).toBe(20);
    expect(hygiene.earned).toBe(20);
    expect(hygiene.completeRows).toBe(4);
    expect(hygiene.perfect).toBe(true);

    // The other charts are untouched, and the totals are the sum.
    expect(hannah.earned).toBe(20);
    expect(hannah.completeRows).toBe(4);
    expect(report.earned).toBe(20);
  });

  it("only calls a chart perfect when every star on it was earned", () => {
    const marks = blankWeek();
    fillChart(marks, "james", "hygiene");
    // Rub one out again.
    marks.james["brush-morning"] = [true, true, true, true, false];

    const report = buildWeekReport(CHORE_POOLS, MONDAY, marks);
    const james = report.children.find((child) => child.childId === "james")!;
    const hygiene = james.charts.find((result) => result.chart.id === "hygiene")!;

    expect(hygiene.earned).toBe(19);
    expect(hygiene.perfect).toBe(false);
    expect(hygiene.completeRows).toBe(3);
  });

  it("leaves out a chart the child has no rows on", () => {
    const report = buildWeekReport(CHORE_POOLS, MONDAY, blankWeek());
    for (const child of report.children) {
      expect(child.charts.every((result) => result.possible > 0)).toBe(true);
    }
  });

  it("offers exactly the stars the live chart offers", () => {
    // The report and the chart must not be able to disagree about how big a
    // week was: a report that inflated the denominator would quietly turn a
    // perfect week into 90%.
    const report = buildWeekReport(CHORE_POOLS, MONDAY, blankWeek());
    for (const child of report.children) {
      const tasks = getTasksForChild(CHORE_POOLS, MONDAY, child.childId);
      expect(child.possible).toBe(tasks.length * STAR_DAY_COUNT);
    }
  });

  it("names the Monday and the Friday", () => {
    const report = buildWeekReport(CHORE_POOLS, MONDAY, blankWeek());
    expect(report.weekStart).toBe("2026-08-03");
    expect(report.weekEnd).toBe("2026-08-07");
  });

  it("takes the week from the date it is given, not from today", () => {
    // Handed a Wednesday, it still reports that Wednesday's week.
    const report = buildWeekReport(
      CHORE_POOLS,
      parseLocalDate("2026-08-05")!,
      blankWeek(),
    );
    expect(report.weekStart).toBe("2026-08-03");
  });
});

describe("what a week is worth", () => {
  it("is a nickel a star", () => {
    expect(CENTS_PER_STAR).toBe(5);
    expect(centsForStars(47)).toBe(235);
    expect(centsForStars(0)).toBe(0);
  });

  it("counts the family's money from the family's stars", () => {
    const marks = blankWeek();
    fillChart(marks, "hannah", "hygiene");
    fillChart(marks, "clara", "hygiene");

    const report = buildWeekReport(CHORE_POOLS, MONDAY, marks);
    expect(report.earned).toBe(40);
    expect(report.cents).toBe(200);
    // …and the slides that led to it add up to exactly the same number.
    const summed = report.children.reduce((total, child) => total + child.cents, 0);
    expect(summed).toBe(report.cents);
  });

  it("formats money without ever showing a floating-point tail", () => {
    // 0.05 cannot be represented exactly, so dollars-as-a-float would print
    // $2.3500000000000005 in front of a child who is counting.
    expect(formatMoney(centsForStars(47))).toBe("$2.35");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(100)).toBe("$1.00");
    expect(formatMoney(1005)).toBe("$10.05");
  });
});

describe("which weeks have a report", () => {
  it("publishes the week that has just ended, and nothing newer", () => {
    // A Wednesday. The week that has finished is the one before it.
    expect(latestCompletedWeekStart(parseLocalDate("2026-08-12")!)).toBe("2026-08-03");
  });

  it("holds that answer for seven days, then steps once", () => {
    const days = [
      "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13",
      "2026-08-14", "2026-08-15", "2026-08-16",
    ];
    for (const day of days) {
      expect(latestCompletedWeekStart(parseLocalDate(day)!)).toBe("2026-08-03");
    }
    // The next Monday, and the card at the top of the page becomes a new one.
    expect(latestCompletedWeekStart(parseLocalDate("2026-08-17")!)).toBe("2026-08-10");
  });

  it("refuses this week and every week after it", () => {
    const now = parseLocalDate("2026-08-12")!;
    expect(isCompletedWeek("2026-08-03", now)).toBe(true);
    expect(isCompletedWeek("2026-07-27", now)).toBe(true);
    // This week — half of it has not happened yet.
    expect(isCompletedWeek("2026-08-10", now)).toBe(false);
    // And a URL somebody typed for October.
    expect(isCompletedWeek("2026-10-05", now)).toBe(false);
  });

  it("always lists the latest week, even if nobody ticked a star in it", () => {
    const now = parseLocalDate("2026-08-12")!;
    // The page promises a report every Monday; "nobody earned anything" is a
    // true report rather than a missing one.
    expect(reportableWeeks([], now)).toEqual(["2026-08-03"]);
  });

  it("lists the stored weeks newest first, without duplicating the latest", () => {
    const now = parseLocalDate("2026-08-12")!;
    const weeks = reportableWeeks(
      ["2026-07-20", "2026-08-03", "2026-07-27", "2026-08-03"],
      now,
    );
    expect(weeks).toEqual(["2026-08-03", "2026-07-27", "2026-07-20"]);
  });

  it("drops a stored week that has not finished", () => {
    const now = parseLocalDate("2026-08-12")!;
    // The current week has stars in it — it is Wednesday — but it is not a
    // report yet.
    const weeks = reportableWeeks(["2026-08-10", "2026-08-03"], now);
    expect(weeks).toEqual(["2026-08-03"]);
  });
});

describe("the words on a slide", () => {
  function child(earned: number, possible: number) {
    return {
      childId: "clara" as ChildId,
      name: "Clara",
      color: "#ec4899",
      colorDark: "#be185d",
      charts: [],
      earned,
      possible,
      completeRows: 0,
      cents: centsForStars(earned),
    };
  }

  it("praises a perfect week as perfect and a thin one without a lie", () => {
    expect(praiseFor(child(100, 100))).toBe("A perfect week — every single star!");
    expect(praiseFor(child(95, 100))).toBe("What a week!");
    expect(praiseFor(child(75, 100))).toBe("Brilliant work");
    expect(praiseFor(child(50, 100))).toBe("Good going");
    // Eleven stars out of a hundred is not "amazing", and it is not a telling
    // off either.
    expect(praiseFor(child(11, 100))).toBe("Every star counts");
  });

  it("has something to say about a week with no stars at all", () => {
    expect(praiseFor(child(0, 100))).toBe("A fresh start this week");
    expect(praiseFor(child(0, 0))).toBe("Nothing on the chart this week");
  });

  it("counts whole rows in English", () => {
    expect(wholeRowsLabel(0)).toBe("");
    expect(wholeRowsLabel(1)).toBe("1 whole row");
    expect(wholeRowsLabel(4)).toBe("4 whole rows");
  });
});
