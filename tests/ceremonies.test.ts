import { describe, expect, it } from "vitest";

import {
  SPAN_CEREMONIES,
  getVisibleSpanCeremony,
  isCeremonyVisible,
  visibleSpanCeremonies,
  type SpanCeremony,
} from "@/config/ceremonies";
import { CHORE_POOLS } from "@/config/chore-rotation";
import { CHILD_IDS, type ChildId } from "@/config/family";
import { centsForStars } from "@/config/rewards";
import { STAR_DAY_COUNT } from "@/config/stars";
import { parseLocalDate, toIsoDate } from "@/lib/dates";
import type { WeekMarks } from "@/lib/stars/counting";
import {
  buildSpanReport,
  buildWeekReport,
  isCompletedWeek,
  periodNoun,
  periodPhrase,
  praiseFor,
  totalCaption,
} from "@/lib/stars/report";
import { getChartTasksForChild } from "@/lib/stars/tasks";
import { parseWeekStart } from "@/lib/stars/week";

/**
 * Ceremonies that cover more than one week.
 *
 * Two halves, and they fail for different reasons. The arithmetic half is
 * about a span never disagreeing with the weeks it is made of — a child who
 * adds up three slides must get the number on the fourth. The window half is
 * about a ceremony that is meant to be up for one evening actually being gone
 * the next morning, on the family's clock rather than the server's.
 */

const WEEKS = ["2026-07-20", "2026-07-27", "2026-08-03"] as const;

function blankWeek(): WeekMarks {
  return Object.fromEntries(CHILD_IDS.map((id) => [id, {}])) as WeekMarks;
}

/** Every star on `chart`, ticked, for one child in one week. */
function fillChart(
  marks: WeekMarks,
  monday: Date,
  childId: ChildId,
  chart: "hygiene" | "chores",
) {
  for (const task of getChartTasksForChild(CHORE_POOLS, monday, childId, chart)) {
    marks[childId][task.id] = Array.from({ length: STAR_DAY_COUNT }, () => true);
  }
}

/** The three weeks, each with whatever `prepare` puts in it. */
function span(
  prepare: (marks: WeekMarks, monday: Date, index: number) => void = () => {},
) {
  return WEEKS.map((week, index) => {
    const monday = parseLocalDate(week)!;
    const marks = blankWeek();
    prepare(marks, monday, index);
    return { monday, marks };
  });
}

describe("adding several weeks into one ceremony", () => {
  it("totals exactly what the weekly ceremonies total", () => {
    /*
     * The property the whole feature rests on. A span is built by summing the
     * *reports*, not by merging the marks, so this is the assertion that the
     * summing is faithful — and it is written as a comparison against the
     * weeks themselves rather than against a hardcoded number, so it still
     * means something after somebody edits a chart.
     */
    const weeks = span((marks, monday, index) => {
      fillChart(marks, monday, "hannah", "hygiene");
      if (index > 0) fillChart(marks, monday, "james", "chores");
    });

    const weekly = weeks.map(({ monday, marks }) =>
      buildWeekReport(CHORE_POOLS, monday, marks),
    );
    const report = buildSpanReport(CHORE_POOLS, "three", weeks);

    expect(report.earned).toBe(
      weekly.reduce((total, week) => total + week.earned, 0),
    );
    expect(report.possible).toBe(
      weekly.reduce((total, week) => total + week.possible, 0),
    );
    expect(report.cents).toBe(centsForStars(report.earned));
  });

  it("totals every child the same way", () => {
    const weeks = span((marks, monday) => {
      fillChart(marks, monday, "hannah", "hygiene");
    });
    const weekly = weeks.map(({ monday, marks }) =>
      buildWeekReport(CHORE_POOLS, monday, marks),
    );
    const report = buildSpanReport(CHORE_POOLS, "three", weeks);

    for (const child of report.children) {
      const parts = weekly.map(
        (week) => week.children.find((one) => one.childId === child.childId)!,
      );
      expect(child.earned).toBe(
        parts.reduce((total, part) => total + part.earned, 0),
      );
      expect(child.possible).toBe(
        parts.reduce((total, part) => total + part.possible, 0),
      );
      expect(child.cents).toBe(centsForStars(child.earned));
    }
  });

  it("counts a row filled three weeks running as three whole rows", () => {
    // Not as one. The reward on the paper chart is per week, and a span must
    // not quietly revalue what was earned.
    const weeks = span((marks, monday) => {
      fillChart(marks, monday, "hannah", "hygiene");
    });
    const report = buildSpanReport(CHORE_POOLS, "three", weeks);
    const hannah = report.children.find((child) => child.childId === "hannah")!;
    const hygiene = hannah.charts.find((chart) => chart.chart.id === "hygiene")!;

    const rowsInOneWeek = getChartTasksForChild(
      CHORE_POOLS,
      parseLocalDate(WEEKS[0])!,
      "hannah",
      "hygiene",
    ).length;

    expect(hygiene.completeRows).toBe(rowsInOneWeek * WEEKS.length);
  });

  it("calls a chart perfect only when it was perfect in every week", () => {
    const nearly = span((marks, monday, index) => {
      if (index < WEEKS.length - 1) fillChart(marks, monday, "hannah", "hygiene");
    });
    const hygieneOf = (weeks: ReturnType<typeof span>) =>
      buildSpanReport(CHORE_POOLS, "three", weeks)
        .children.find((child) => child.childId === "hannah")!
        .charts.find((chart) => chart.chart.id === "hygiene")!;

    expect(hygieneOf(nearly).perfect).toBe(false);

    const every = span((marks, monday) => {
      fillChart(marks, monday, "hannah", "hygiene");
    });
    expect(hygieneOf(every).perfect).toBe(true);
  });

  it("runs from the first Monday to the last Friday", () => {
    const report = buildSpanReport(CHORE_POOLS, "three", span());
    expect(report.weekStart).toBe("2026-07-20");
    expect(report.weekEnd).toBe("2026-08-07");
    expect(report.weekCount).toBe(3);
    expect(report.slug).toBe("three");
  });

  it("does not care what order the weeks are given in", () => {
    // The config is written by hand, and a range that printed backwards
    // because somebody listed the newest first would be a silly way to fail.
    const forwards = buildSpanReport(CHORE_POOLS, "three", span());
    const backwards = buildSpanReport(CHORE_POOLS, "three", [...span()].reverse());

    expect(backwards.weekStart).toBe(forwards.weekStart);
    expect(backwards.weekEnd).toBe(forwards.weekEnd);
    expect(backwards.earned).toBe(forwards.earned);
  });

  it("keeps every child, in ceremony order, even on an empty span", () => {
    const report = buildSpanReport(CHORE_POOLS, "three", span());
    expect(report.children.map((child) => child.childId)).toEqual(
      [...CHILD_IDS].reverse(),
    );
    expect(report.earned).toBe(0);
    // A span of nothing is still a real ceremony with real charts to fail at.
    expect(report.possible).toBeGreaterThan(0);
  });

  it("refuses a span of no weeks at all", () => {
    expect(() => buildSpanReport(CHORE_POOLS, "empty", [])).toThrow(/no weeks/);
  });

  it("gives an ordinary week a slug of its own Monday", () => {
    const report = buildWeekReport(
      CHORE_POOLS,
      parseLocalDate(WEEKS[0])!,
      blankWeek(),
    );
    expect(report.slug).toBe(WEEKS[0]);
    expect(report.weekCount).toBe(1);
  });
});

describe("the words for a period", () => {
  it("names one week and several weeks differently", () => {
    expect(periodNoun(1)).toBe("week");
    expect(periodNoun(3)).toBe("3 weeks");
    expect(periodPhrase(1)).toBe("this week");
    expect(periodPhrase(3)).toBe("these 3 weeks");
    expect(totalCaption(1)).toBe("stars this week");
    expect(totalCaption(3)).toBe("stars in 3 weeks");
  });

  it("praises a span without turning the praise into nonsense", () => {
    const child = (earned: number, possible: number) => ({
      childId: "clara" as ChildId,
      name: "Clara",
      color: "#ec4899",
      colorDark: "#be185d",
      charts: [],
      earned,
      possible,
      completeRows: 0,
      cents: centsForStars(earned),
    });

    expect(praiseFor(child(100, 100), 3)).toBe(
      "A perfect 3 weeks — every single star!",
    );
    // "What a 3 weeks!" is not a sentence, so a span gets its own word.
    expect(praiseFor(child(95, 100), 3)).toBe("What a run!");
    expect(praiseFor(child(95, 100))).toBe("What a week!");
    expect(praiseFor(child(0, 100), 3)).toBe("A fresh start these 3 weeks");
    expect(praiseFor(child(0, 0), 3)).toBe("Nothing on the chart these 3 weeks");
    // The bands that read the same either way are left alone.
    expect(praiseFor(child(75, 100), 3)).toBe("Brilliant work");
  });
});

describe("when a span ceremony may be watched", () => {
  const ceremony: SpanCeremony = {
    id: "test-span",
    title: "A Test",
    blurb: "",
    weekStarts: [...WEEKS],
    hiddenFrom: "2026-08-11",
  };

  it("is watchable on the last day and gone the next", () => {
    // The window closes at midnight, family time, which is what makes
    // `hiddenFrom` exclusive: the 10th is the last evening.
    expect(isCeremonyVisible(ceremony, "2026-08-10")).toBe(true);
    expect(isCeremonyVisible(ceremony, "2026-08-11")).toBe(false);
    expect(isCeremonyVisible(ceremony, "2026-09-01")).toBe(false);
  });

  it("is not watchable before it opens, when it has an opening date", () => {
    const later = { ...ceremony, visibleFrom: "2026-08-09" };
    expect(isCeremonyVisible(later, "2026-08-08")).toBe(false);
    expect(isCeremonyVisible(later, "2026-08-09")).toBe(true);
  });

  it("has no URL at all once it is hidden", () => {
    /*
     * Not a greyed-out card and not a page saying "this has finished". A
     * ceremony that has had its evening should be a 404, or a home-screen
     * shortcut becomes a dead link into an empty stage.
     */
    for (const configured of SPAN_CEREMONIES) {
      const dayAfter = configured.hiddenFrom;
      expect(getVisibleSpanCeremony(configured.id, dayAfter)).toBeUndefined();
      expect(visibleSpanCeremonies(dayAfter)).not.toContain(configured);
    }
  });

  it("cannot be reached by an id nobody configured", () => {
    expect(getVisibleSpanCeremony("whatever", "2026-08-10")).toBeUndefined();
    expect(getVisibleSpanCeremony("2026-08-03", "2026-08-10")).toBeUndefined();
  });
});

describe("the configured ceremonies", () => {
  it("gives each one an id that could never be mistaken for a week", () => {
    // Both live under `/ceremonies/…`, and the page tries the span lookup
    // first — an id shaped like a Monday would shadow a real week's ceremony.
    for (const ceremony of SPAN_CEREMONIES) {
      expect(ceremony.id).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(ceremony.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("gives each one a unique id", () => {
    const ids = SPAN_CEREMONIES.map((ceremony) => ceremony.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("spans at least two finished weeks, in order, with no repeats", () => {
    for (const ceremony of SPAN_CEREMONIES) {
      expect(ceremony.weekStarts.length).toBeGreaterThan(1);
      expect(new Set(ceremony.weekStarts).size).toBe(ceremony.weekStarts.length);
      expect([...ceremony.weekStarts].sort()).toEqual([...ceremony.weekStarts]);

      for (const week of ceremony.weekStarts) {
        // A Monday, exactly as the star charts and the weekly ceremonies
        // demand — otherwise the span would report a second, offset week.
        expect(parseWeekStart(week)).not.toBeNull();
      }
    }
  });

  it("never puts an unfinished week in front of anybody", () => {
    /*
     * Checked against the day the ceremony *opens*, not against today: a
     * ceremony written now for a window in October may perfectly well cover a
     * week that has not finished yet, as long as it has by the time anybody
     * can watch it.
     */
    for (const ceremony of SPAN_CEREMONIES) {
      const opens =
        parseLocalDate(ceremony.visibleFrom ?? toIsoDate(new Date())) ??
        new Date();
      for (const week of ceremony.weekStarts) {
        expect(isCompletedWeek(week, opens)).toBe(true);
      }
    }
  });

  it("closes after it opens", () => {
    for (const ceremony of SPAN_CEREMONIES) {
      expect(parseLocalDate(ceremony.hiddenFrom)).not.toBeNull();
      if (ceremony.visibleFrom) {
        expect(ceremony.visibleFrom < ceremony.hiddenFrom).toBe(true);
      }
    }
  });

  it("has Summer So Far, covering every week the charts have ever had", () => {
    const summer = SPAN_CEREMONIES.find(
      (ceremony) => ceremony.id === "summer-so-far",
    );
    expect(summer).toBeDefined();
    expect(summer!.weekStarts).toEqual([...WEEKS]);
    // One evening — Monday 10 August 2026 — and gone at midnight.
    expect(summer!.hiddenFrom).toBe("2026-08-11");
    expect(isCeremonyVisible(summer!, "2026-08-10")).toBe(true);
    expect(isCeremonyVisible(summer!, "2026-08-11")).toBe(false);
  });
});
