import { describe, expect, it } from "vitest";

import { CHORE_POOLS, cycleLengthOf, type ChorePool } from "@/config/chore-rotation";
import { CHILD_IDS } from "@/config/family";
import {
  CHARTS,
  STAR_DAY_NAMES,
  STAR_MAX_DAY_COUNT,
  getChart,
  getChartTasks,
  getRotatingTasks,
  getStarTask,
  isStarTaskId,
} from "@/config/stars";
import {
  getChoreWeekOffset,
  getChoreCountdownLabel,
  getNextChoreRotation,
  getPoolAssignments,
  assertChorePoolsValid,
} from "@/lib/stars/rotation";
import {
  getChartSectionsForChild,
  getChartTasksForChild,
  getTasksForChild,
  getWeeklyStarTotal,
  isTaskForChild,
} from "@/lib/stars/tasks";

function localDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** Wednesday of the anchor week, Monday 10 August 2026. */
const AUGUST = localDate("2026-08-12");

describe("looking things up in the config", () => {
  it("finds a task by id, and admits when there is no such task", () => {
    expect(getStarTask("piano")?.label).toBe("Piano practice");
    expect(getStarTask("nope")).toBeUndefined();
    expect(isStarTaskId("piano")).toBe(true);
    expect(isStarTaskId("nope")).toBe(false);
    // The id check is what stands between a request and a MongoDB field name.
    expect(isStarTaskId("marks.tidy-room")).toBe(false);
    expect(isStarTaskId("__proto__")).toBe(false);
  });

  it("finds a chart, and throws with a useful message when asked for one that is not there", () => {
    expect(getChart("chores").title).toMatch(/Chore Chart/);
    // @ts-expect-error deliberately wrong, to prove the guard fires
    expect(() => getChart("laundry")).toThrow(/laundry/);
  });

  it("returns a chart's tasks in configured order", () => {
    const chores = getChartTasks("chores");
    expect(chores.length).toBeGreaterThan(0);
    expect(chores.every((task) => task.chart === "chores")).toBe(true);
    expect(chores[0].id).toBe("tidy-room");
  });

  it("returns every rotating chore, and only those", () => {
    const rotating = getRotatingTasks();
    // Seven: the eighth, feeding Bella, became James's own when the pairs
    // started swapping weekly and left him with nobody to trade with.
    expect(rotating.length).toBe(7);
    expect(rotating.map((task) => task.id)).not.toContain("feed-bella");
    expect(rotating.every((task) => task.assign.kind === "rotating")).toBe(true);
  });

  it("names Monday to Saturday, matching the widest a chart gets", () => {
    expect(STAR_DAY_NAMES).toHaveLength(STAR_MAX_DAY_COUNT);
    expect(STAR_DAY_NAMES[0]).toBe("Monday");
    expect(STAR_DAY_NAMES[STAR_MAX_DAY_COUNT - 1]).toBe("Saturday");
    // Sunday is the ceremony, not a column, and must never appear here.
    expect(STAR_DAY_NAMES).not.toContain("Sunday");
  });

  it("reports how long a pool takes to come back round", () => {
    for (const pool of CHORE_POOLS) {
      expect(cycleLengthOf(pool)).toBe(pool.children.length);
    }
  });

  it("accepts the shipped pools without complaint", () => {
    expect(() => assertChorePoolsValid(CHORE_POOLS)).not.toThrow();
  });
});

describe("one child's tasks", () => {
  it("is the same list however you slice it", () => {
    for (const childId of CHILD_IDS) {
      const all = getTasksForChild(CHORE_POOLS, AUGUST, childId);
      const bySection = getChartSectionsForChild(CHORE_POOLS, AUGUST, childId)
        .flatMap((section) => section.tasks)
        .map((task) => task.id);

      expect(bySection).toEqual(all.map((task) => task.id));

      const byChart = CHARTS.flatMap((chart) =>
        getChartTasksForChild(CHORE_POOLS, AUGUST, childId, chart.id).map(
          (task) => task.id,
        ),
      );
      expect([...byChart].sort()).toEqual([...bySection].sort());
    }
  });

  it("counts one star per row per day on offer", () => {
    for (const childId of CHILD_IDS) {
      const rows = getTasksForChild(CHORE_POOLS, AUGUST, childId).length;
      expect(
        getWeeklyStarTotal(CHORE_POOLS, AUGUST, childId, STAR_MAX_DAY_COUNT),
      ).toBe(rows * STAR_MAX_DAY_COUNT);
    }
  });

  it("knows what is on a child's chart and what is not", () => {
    // Hannah's in August, off the photograph.
    expect(isTaskForChild(CHORE_POOLS, AUGUST, "hannah", "reading-40")).toBe(
      true,
    );
    expect(isTaskForChild(CHORE_POOLS, AUGUST, "hannah", "kitchen-island")).toBe(
      true,
    );
    // Retired off the chart in red pen, so it is on nobody's.
    expect(isTaskForChild(CHORE_POOLS, AUGUST, "hannah", "cello")).toBe(false);
    // Emily's chore that month, not Hannah's.
    expect(isTaskForChild(CHORE_POOLS, AUGUST, "hannah", "dishwasher")).toBe(
      false,
    );
    // James's row, and he is not even in her pool.
    expect(isTaskForChild(CHORE_POOLS, AUGUST, "hannah", "write-alphabet")).toBe(
      false,
    );
    // Not a task at all.
    expect(isTaskForChild(CHORE_POOLS, AUGUST, "hannah", "feed-the-dragon")).toBe(
      false,
    );
  });

  it("moves a chore between children as the weeks turn", () => {
    const nextWeek = localDate("2026-08-19");
    expect(isTaskForChild(CHORE_POOLS, AUGUST, "emily", "dishwasher")).toBe(true);
    expect(isTaskForChild(CHORE_POOLS, nextWeek, "emily", "dishwasher")).toBe(
      false,
    );
    expect(isTaskForChild(CHORE_POOLS, nextWeek, "hannah", "dishwasher")).toBe(
      true,
    );
  });

  it("leaves James's chore where it is, week after week", () => {
    // The one child in no pool: his rows are `fixed`, so nothing about the
    // calendar can take feeding Bella off him.
    for (const iso of ["2026-08-12", "2026-08-19", "2026-11-04", "2027-03-08"]) {
      expect(
        isTaskForChild(CHORE_POOLS, localDate(iso), "james", "feed-bella"),
      ).toBe(true);
      expect(
        isTaskForChild(CHORE_POOLS, localDate(iso), "william", "feed-bella"),
      ).toBe(false);
    }
  });

  it("gives a child with no pool their everyone-and-fixed rows only", () => {
    // A pool that has forgotten Clara: she keeps hygiene, tidy room and her
    // learning rows, and simply has no rotating chore that week. The page must
    // not blow up on that — it is what a mid-week edit to the database looks
    // like from here.
    const poolWithoutClara: ChorePool[] = [
      CHORE_POOLS[0],
      {
        ...CHORE_POOLS[1],
        children: ["william"],
      },
    ];

    const tasks = getTasksForChild(poolWithoutClara, AUGUST, "clara");
    expect(tasks.some((task) => task.id === "tidy-room")).toBe(true);
    expect(tasks.some((task) => task.id === "reading-20")).toBe(true);
    expect(tasks.some((task) => task.assign.kind === "rotating")).toBe(false);
  });

  it("drops a chart entirely when a child has nothing on it", () => {
    // Not true of anybody today — every child has all three — so it is proved
    // by construction rather than left as an untested branch.
    const noLearning = getChartSectionsForChild(
      CHORE_POOLS,
      AUGUST,
      "hannah",
    ).filter((section) => section.chart.id !== "learning");
    expect(noLearning.map((section) => section.chart.id)).toEqual([
      "chores",
      "hygiene",
    ]);
  });
});

describe("pools that are wrong in the ways real ones go wrong", () => {
  it("throws, naming the pool, when it has no children left in it", () => {
    const empty: ChorePool = { ...CHORE_POOLS[0], children: [] };
    expect(() => getPoolAssignments(empty, AUGUST)).toThrow(/"elder-pair"/);
    expect(() => getPoolAssignments(empty, AUGUST)).toThrow(/no children/);
  });

  it("throws, naming the pool and the value, on an unparseable anchor month", () => {
    const bad: ChorePool = { ...CHORE_POOLS[0], anchorWeek: "last August" };
    expect(() => getChoreWeekOffset(bad, AUGUST)).toThrow(/last August/);
    expect(() => getPoolAssignments(bad, AUGUST)).toThrow(/Monday/);
  });

  it("survives a pool with a single child, who then has every chore", () => {
    const solo: ChorePool = { ...CHORE_POOLS[0], children: ["hannah"] };
    const assignments = getPoolAssignments(solo, AUGUST);
    expect(assignments).toHaveLength(solo.chores.length);
    expect(assignments.every((a) => a.childId === "hannah")).toBe(true);
    // And it stays that way next week rather than dividing by zero.
    expect(
      getPoolAssignments(solo, localDate("2026-11-04")).every(
        (a) => a.childId === "hannah",
      ),
    ).toBe(true);
  });

  it("survives more children than chores — somebody simply has none", () => {
    const wide: ChorePool = {
      ...CHORE_POOLS[1],
      children: ["james", "william", "clara", "emily"],
    };
    const owners = new Set(getPoolAssignments(wide, AUGUST).map((a) => a.childId));
    expect(owners.size).toBe(3);
    // …and the child who misses out this week is not the one who misses out
    // next week.
    const next = new Set(
      getPoolAssignments(wide, localDate("2026-08-19")).map((a) => a.childId),
    );
    expect([...next].sort()).not.toEqual([...owners].sort());
  });
});

describe("the countdown to new chores", () => {
  it("lands on next Monday", () => {
    const next = getNextChoreRotation(localDate("2026-08-20"));
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(24);
  });

  it("rolls the year over between Christmas and January", () => {
    const next = getNextChoreRotation(localDate("2026-12-30"));
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0);
    expect(next.getDay()).toBe(1);
  });

  it("says tomorrow on Sunday, and never says today", () => {
    expect(getChoreCountdownLabel(localDate("2026-08-16"))).toBe(
      "New chores tomorrow",
    );
    // Monday is a full week away, not zero days — the swap has *just*
    // happened, and a child reading "new chores in 0 days" would be waiting
    // for something that already occurred.
    expect(getChoreCountdownLabel(localDate("2026-08-17"))).toBe(
      "New chores in 7 days",
    );
    expect(getChoreCountdownLabel(localDate("2026-08-12"))).toBe(
      "New chores in 5 days",
    );
  });
});
