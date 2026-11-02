import { describe, expect, it } from "vitest";

import { getVisibleSpanCeremony, SPAN_CEREMONIES } from "@/config/ceremonies";
import { CHORE_POOLS } from "@/config/chore-rotation";
import { CHILD_IDS } from "@/config/family";
import { starDayCount } from "@/config/stars";
import { parseLocalDate } from "@/lib/dates";
import { familyNow } from "@/lib/family-api/time";
import type { WeekMarks } from "@/lib/stars/counting";
import { buildSpanReport, buildWeekReport, ceremonyDateFor } from "@/lib/stars/report";
import { getChartTasksForChild } from "@/lib/stars/tasks";

const catchup = SPAN_CEREMONIES.find((item) => item.id === "five-weeks-of-stars")!;

describe("November 1 catch-up ceremony", () => {
  it("covers exactly the five requested Sunday ceremonies", () => {
    expect(catchup.weekStarts.map(ceremonyDateFor)).toEqual([
      "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01",
    ]);
    expect(new Set(catchup.weekStarts).size).toBe(5);
  });

  it.each([
    ["2026-11-01T05:59:59Z", false],
    ["2026-11-01T06:00:00Z", true],
    ["2026-11-02T06:59:59Z", true],
    ["2026-11-02T07:00:00Z", false],
  ])("uses Boise's date at %s, including the DST change", (instant, visible) => {
    const today = familyNow(new Date(instant)).date;
    expect(Boolean(getVisibleSpanCeremony(catchup.id, today))).toBe(visible);
  });

  it("sums each week's charts and rows without inventing perfect awards", () => {
    const weeks = catchup.weekStarts.map((week, index) => {
      const monday = parseLocalDate(week)!;
      const marks = Object.fromEntries(CHILD_IDS.map((childId) => [
        childId,
        Object.fromEntries(getChartTasksForChild(CHORE_POOLS, monday, childId, "hygiene")
          .map((task) => [task.id, Array.from({ length: starDayCount(week) },
            (_, day) => index === 0 || day % (index + 1) === 0)])),
      ])) as WeekMarks;
      return { monday, marks };
    });
    const original = structuredClone(weeks);
    const parts = weeks.map(({ monday, marks }) => buildWeekReport(CHORE_POOLS, monday, marks));
    const combined = buildSpanReport(CHORE_POOLS, catchup.id, weeks);
    expect(combined.weekStart).toBe("2026-09-28");
    expect(combined.weekEnd).toBe("2026-10-31");
    expect(combined.weekCount).toBe(5);
    for (const metric of ["earned", "possible", "cents"] as const) {
      expect(combined[metric]).toBe(parts.reduce((sum, part) => sum + part[metric], 0));
    }
    for (const child of combined.children) {
      const children = parts.map((part) => part.children.find((one) => one.childId === child.childId)!);
      for (const metric of ["earned", "possible", "cents", "completeRows"] as const) {
        expect(child[metric]).toBe(children.reduce((sum, one) => sum + one[metric], 0));
      }
      for (const chart of child.charts) {
        const charts = children.flatMap((one) => one.charts.filter((item) => item.chart.id === chart.chart.id));
        for (const metric of ["earned", "possible", "completeRows"] as const) {
          expect(chart[metric]).toBe(charts.reduce((sum, one) => sum + one[metric], 0));
        }
        expect(chart.perfect).toBe(chart.possible > 0 && charts.every((one) => one.perfect));
      }
    }
    expect(weeks).toEqual(original);
  });
});
