import { describe, expect, it } from "vitest";

import { CHILD_IDS, getChildren } from "@/config/family";
import { CHILD_ROTATION_SCHEDULE } from "@/config/rotation";
import {
  ADJACENCY_MODELS,
  CHILD_POSITIONS,
  TABLE_ADJACENCY,
  VEHICLE_ADJACENCY,
} from "@/config/seating";
import {
  analyseSchedule,
  getPairAdjacencyCounts,
  isCyclicShiftOf,
  isReversalOf,
  pairKey,
  validateRotationSchedule,
} from "@/lib/schedule-analysis";

const SCHEDULE = CHILD_ROTATION_SCHEDULE;

describe("hard fairness requirements", () => {
  it("passes every validation rule", () => {
    expect(validateRotationSchedule(SCHEDULE)).toEqual([]);
  });

  it("contains exactly five weeks", () => {
    expect(SCHEDULE).toHaveLength(5);
  });

  it("gives every week exactly five children, each exactly once", () => {
    for (const week of SCHEDULE) {
      expect(week).toHaveLength(5);
      expect(new Set(week).size).toBe(5);
      expect([...week].sort()).toEqual([...CHILD_IDS].sort());
    }
  });

  it("gives every child every position exactly once over the cycle", () => {
    for (const child of CHILD_IDS) {
      const positions = SCHEDULE.map((week) => week.indexOf(child));
      expect(positions).not.toContain(-1);
      expect(new Set(positions).size).toBe(5);
    }
  });

  it("never keeps a child in the same position two weeks running", () => {
    for (let i = 0; i < SCHEDULE.length; i += 1) {
      const current = SCHEDULE[i];
      const next = SCHEDULE[(i + 1) % SCHEDULE.length];
      current.forEach((child, position) => {
        expect(next[position]).not.toBe(child);
      });
    }
  });

  it("handles the week 5 to week 1 wrap like any other transition", () => {
    const week5 = SCHEDULE[4];
    const week1 = SCHEDULE[0];
    week5.forEach((child, position) => {
      expect(week1[position]).not.toBe(child);
    });
  });

  it("is not a rotation or a mirror of the previous week", () => {
    for (let i = 0; i < SCHEDULE.length; i += 1) {
      const current = SCHEDULE[i];
      const next = SCHEDULE[(i + 1) % SCHEDULE.length];
      expect(isCyclicShiftOf(current, next)).toBe(false);
      expect(isReversalOf(current, next)).toBe(false);
    }
  });

  it("matches the roster in config/family.ts", () => {
    expect(getChildren().map((child) => child.id).sort()).toEqual(
      [...CHILD_IDS].sort(),
    );
  });
});

describe("shared position mapping", () => {
  it("uses the same five position numbers in both layouts", () => {
    expect([...CHILD_POSITIONS]).toEqual([1, 2, 3, 4, 5]);
    for (const model of ADJACENCY_MODELS) {
      const referenced = new Set(
        [...model.strong, ...model.weak].flatMap((pair) => [...pair]),
      );
      for (const position of referenced) {
        expect(CHILD_POSITIONS).toContain(position);
      }
    }
  });
});

describe("validator catches bad schedules", () => {
  it("rejects a duplicate child in a week", () => {
    const broken = [
      ["hannah", "hannah", "clara", "william", "james"],
      ...SCHEDULE.slice(1),
    ] as const;
    const issues = validateRotationSchedule(broken as never);
    expect(issues.some((issue) => issue.code === "duplicate-child")).toBe(true);
  });

  it("rejects a plain clockwise rotation", () => {
    // The naive approach this project deliberately avoids: shift by one each
    // week. It satisfies position coverage but pins the same siblings
    // together forever, which the adjacency numbers below expose.
    const naive = [0, 1, 2, 3, 4].map((offset) =>
      CHILD_IDS.map((_, i) => CHILD_IDS[(i + offset) % 5]),
    );
    expect(validateRotationSchedule(naive)).toEqual([]);

    const naiveReport = analyseSchedule(naive);
    const chosenReport = analyseSchedule(SCHEDULE);

    // Every single transition of the naive schedule keeps siblings together.
    expect(naiveReport.totalRepeats).toBeGreaterThan(0);
    expect(chosenReport.totalRepeats).toBe(0);
  });

  it("rejects a schedule that keeps a child in place", () => {
    const stuck = SCHEDULE.map((week) => [...week]);
    stuck[1][0] = stuck[0][0];
    stuck[1][stuck[1].indexOf(stuck[0][0], 1)] = SCHEDULE[1][0];
    const issues = validateRotationSchedule(stuck);
    expect(issues.some((issue) => issue.code === "consecutive-position")).toBe(
      true,
    );
  });
});

describe("sibling adjacency report", () => {
  const report = analyseSchedule(SCHEDULE);

  it("produces counts for both layouts", () => {
    const table = getPairAdjacencyCounts(SCHEDULE, [TABLE_ADJACENCY]);
    const vehicle = getPairAdjacencyCounts(SCHEDULE, [VEHICLE_ADJACENCY]);

    // Three strong pairs per layout per week, over five weeks.
    const sum = (map: Map<string, number>) =>
      [...map.values()].reduce((total, value) => total + value, 0);
    expect(sum(table.strong)).toBe(15);
    expect(sum(vehicle.strong)).toBe(15);
    expect(sum(table.weak)).toBe(10); // 2 opposite pairs per week
    expect(sum(vehicle.weak)).toBe(20); // 4 front/behind pairs per week
  });

  it("covers all ten sibling pairs", () => {
    expect(report.perPair).toHaveLength(10);
    const keys = new Set(
      report.perPair.map((entry) => pairKey(entry.pair[0], entry.pair[1])),
    );
    expect(keys.size).toBe(10);
  });

  it("keeps no sibling pair side by side across a rotation", () => {
    expect(report.totalRepeats).toBe(0);
    for (const transition of report.transitions) {
      expect(transition.repeats).toBe(0);
    }
  });

  /*
   * Documented, measured result — not an aspiration.
   *
   * Every pair sits shoulder-to-shoulder either 2 or 4 times across the ten
   * shared seatings (5 weeks x 2 layouts). This is NOT perfectly equal, and
   * the test asserts the real numbers rather than pretending otherwise. See
   * the comment block in src/config/rotation.ts for the trade-off that
   * produced it.
   */
  it("distributes pairings within a measured 2-to-4 band", () => {
    for (const entry of report.perPair) {
      expect(entry.combinedStrong).toBeGreaterThanOrEqual(2);
      expect(entry.combinedStrong).toBeLessThanOrEqual(4);
    }
    expect(report.spread.min).toBe(3);
    expect(report.spread.max).toBe(6);
  });

  it("prints the adjacency table for the development record", () => {
    const lines = report.perPair.map(
      (entry) =>
        `${`${entry.pair[0]} + ${entry.pair[1]}`.padEnd(20)} ` +
        `table ${entry.tableStrong}/${entry.tableWeak}  ` +
        `vehicle ${entry.vehicleStrong}/${entry.vehicleWeak}  ` +
        `combined ${entry.combinedStrong} strong, ${entry.combinedWeighted} weighted`,
    );
    // Visible with `npm test -- --reporter=verbose`.
    console.log(
      ["", "Sibling adjacency (strong/weak) over the five-week cycle", ...lines, ""].join(
        "\n",
      ),
    );
    expect(lines).toHaveLength(10);
  });
});
