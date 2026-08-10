import { describe, expect, it } from "vitest";

import { CHORE_POOLS } from "@/config/chore-rotation";
import { CHILD_IDS, type ChildId } from "@/config/family";
import {
  CHARTS,
  STAR_DAY_COUNT,
  STAR_DAY_LABELS,
  STAR_TASKS,
  getChartTasks,
} from "@/config/stars";
import { tally, rowFor, isRowComplete, perfectCharts } from "@/lib/stars/counting";
import { getTasksForChild, getChartSectionsForChild } from "@/lib/stars/tasks";

function localDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** The week the charts were photographed. */
const AUGUST = localDate("2026-08-04");

describe("the task list", () => {
  it("gives every task a unique id", () => {
    const ids = STAR_TASKS.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps ids free of dots, which MongoDB reads as paths", () => {
    for (const task of STAR_TASKS) {
      // These become field names inside a `starWeeks` document; a dot would be
      // read as a path separator and quietly nest the row.
      expect(task.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("puts every task on a chart that exists", () => {
    const charts = new Set(CHARTS.map((chart) => chart.id));
    for (const task of STAR_TASKS) {
      expect(charts.has(task.chart)).toBe(true);
    }
  });

  it("names only real children on a fixed task", () => {
    for (const task of STAR_TASKS) {
      if (task.assign.kind !== "fixed") continue;
      expect(task.assign.children.length).toBeGreaterThan(0);
      for (const child of task.assign.children) {
        expect(CHILD_IDS).toContain(child);
      }
    }
  });

  it("has five weekday columns, as printed", () => {
    expect(STAR_DAY_COUNT).toBe(5);
    expect(STAR_DAY_LABELS).toEqual(["M", "T", "W", "T", "F"]);
  });
});

describe("what each child's chart says", () => {
  /*
   * Read straight off the three photographs, one column at a time. These
   * counts are the transcription's proof: if somebody adds a task and forgets
   * to say who it belongs to, or drops a child off a shared row, this fails.
   */
  const EXPECTED: Record<ChildId, { chores: number; learning: number; hygiene: number }> = {
    // The cello row is scored out in red pen on the fridge, so Hannah has the
    // same four learning rows as everybody else again.
    hannah: { chores: 4, learning: 4, hygiene: 4 },
    emily: { chores: 4, learning: 4, hygiene: 4 },
    clara: { chores: 4, learning: 4, hygiene: 4 },
    william: { chores: 4, learning: 4, hygiene: 4 },
    james: { chores: 4, learning: 4, hygiene: 4 },
  };

  it.each(CHILD_IDS)("gives %s the right number of rows", (childId) => {
    const tasks = getTasksForChild(CHORE_POOLS, AUGUST, childId);
    const expected = EXPECTED[childId];

    for (const chart of ["chores", "learning", "hygiene"] as const) {
      expect(tasks.filter((task) => task.chart === chart)).toHaveLength(
        expected[chart],
      );
    }
  });

  it("gives nobody the cello, and keeps its id retired", () => {
    // It was Hannah's, and it is crossed out on the chart. The id must not
    // come back on some other row: every star ever filed against `cello` is
    // still in the database under that name.
    for (const childId of CHILD_IDS) {
      const has = getTasksForChild(CHORE_POOLS, AUGUST, childId).some(
        (task) => task.id === "cello",
      );
      expect(has).toBe(false);
    }
    expect(STAR_TASKS.some((task) => task.id === "cello")).toBe(false);
  });

  it("gives every child the same four hygiene rows", () => {
    const hygiene = getChartTasks("hygiene").map((task) => task.label);
    for (const childId of CHILD_IDS) {
      const theirs = getTasksForChild(CHORE_POOLS, AUGUST, childId)
        .filter((task) => task.chart === "hygiene")
        .map((task) => task.label);
      expect(theirs).toEqual(hygiene);
    }
  });

  it("keeps the printed wording", () => {
    const labels = STAR_TASKS.map((task) => task.label);
    expect(labels).toContain("Unload & load dishwasher");
    // The one row worded ahead of the laminate rather than off it: the star is
    // earned by either half of the job. See the note in `config/stars.ts`.
    expect(labels).toContain("Put away laundry, or do a load of laundry");
    expect(labels).not.toContain("Take laundry upstairs & put away");
    expect(labels).toContain("IXL Math & fluency practice");
    expect(labels).toContain("1 Reading.com lesson");
    expect(labels).toContain("Brush & floss before bed");
  });

  it("never gives a child a chore from the other pool", () => {
    const littles = new Set(
      CHORE_POOLS.find((pool) => pool.id === "littles")!.chores,
    );
    for (const childId of ["hannah", "emily", "clara"] as const) {
      for (const task of getTasksForChild(CHORE_POOLS, AUGUST, childId)) {
        expect(littles.has(task.id)).toBe(false);
      }
    }
  });

  it("drops no section, because every child has all three charts", () => {
    for (const childId of CHILD_IDS) {
      const sections = getChartSectionsForChild(CHORE_POOLS, AUGUST, childId);
      expect(sections.map((section) => section.chart.id)).toEqual(
        CHARTS.map((chart) => chart.id),
      );
    }
  });
});

describe("counting a week", () => {
  const tasks = getTasksForChild(CHORE_POOLS, AUGUST, "clara");

  it("treats a task that was never ticked as a blank row", () => {
    expect(rowFor({}, "tidy-room")).toEqual([false, false, false, false, false]);
  });

  it("pads and trims a row that was stored badly", () => {
    expect(rowFor({ "tidy-room": [true] }, "tidy-room")).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("counts stars and whole rows", () => {
    const marks = {
      "tidy-room": [true, true, true, true, true],
      piano: [true, true, false, false, false],
    };
    const result = tally(marks, tasks);

    expect(result.earned).toBe(7);
    expect(result.possible).toBe(tasks.length * 5);
    expect(result.completeRows).toBe(1);
    expect(result.rows).toBe(tasks.length);
  });

  it("knows a whole row when it sees one", () => {
    expect(isRowComplete([true, true, true, true, true])).toBe(true);
    expect(isRowComplete([true, true, true, true, false])).toBe(false);
  });

  it("finds the charts a child was perfect on", () => {
    const marks: Record<string, boolean[]> = {};
    for (const task of tasks) {
      if (task.chart === "hygiene") {
        marks[task.id] = [true, true, true, true, true];
      }
    }

    expect(perfectCharts(marks, tasks, ["chores", "learning", "hygiene"])).toEqual([
      "hygiene",
    ]);
  });

  it("does not call an empty chart perfect", () => {
    expect(perfectCharts({}, [], ["chores"])).toEqual([]);
  });
});
