import { afterEach, describe, expect, it, vi } from "vitest";

import { ROTATION_START_DATE } from "@/config/app";
import { CHILD_ROTATION_SCHEDULE } from "@/config/rotation";
import {
  differenceInCalendarDays,
  parseLocalDate,
  startOfWeekMonday,
} from "@/lib/dates";
import {
  getChildAtPosition,
  getCountdownLabel,
  getDaysUntilNextRotation,
  getElapsedWeeks,
  getNextRotationDate,
  getRotationDateRange,
  getRotationIndex,
  getRotationStartDate,
  getRotationStatus,
  getWeekPermutation,
  getWeeklyAssignments,
  isRotationDay,
} from "@/lib/rotation";

/** Local date at noon, so tests never depend on the machine's timezone. */
function localDate(iso: string, hour = 12, minute = 0): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/**
 * A fixed anchor for the date maths below, deliberately *not* read from the
 * config. Re-anchoring the real rotation is a one-line config change the family
 * should be able to make without a wall of failing tests; what these tests are
 * for is the arithmetic relative to whatever the anchor happens to be. The
 * config value itself is asserted separately, just below.
 */
const START = getRotationStartDate("2026-08-03");

describe("configuration sanity", () => {
  it("uses a configured start date that is a Monday", () => {
    const configured = parseLocalDate(ROTATION_START_DATE);
    expect(configured).not.toBeNull();
    // 1 === Monday
    expect(configured!.getDay()).toBe(1);
    // ...and `getRotationStartDate()` passes it through untouched.
    expect(differenceInCalendarDays(configured!, getRotationStartDate())).toBe(
      0,
    );
  });
});

describe("week-by-week assignments", () => {
  const cases = [
    { label: "Week 1", date: "2026-08-03", index: 0 },
    { label: "Week 2", date: "2026-08-10", index: 1 },
    { label: "Week 3", date: "2026-08-17", index: 2 },
    { label: "Week 4", date: "2026-08-24", index: 3 },
    { label: "Week 5", date: "2026-08-31", index: 4 },
  ];

  for (const testCase of cases) {
    it(`${testCase.label} uses schedule entry ${testCase.index}`, () => {
      const date = localDate(testCase.date);
      expect(getRotationIndex(date, START)).toBe(testCase.index);

      const assignments = getWeeklyAssignments(date, START);
      expect(assignments.weekNumber).toBe(testCase.index + 1);
      expect(assignments.children.map((entry) => entry.childId)).toEqual([
        ...CHILD_ROTATION_SCHEDULE[testCase.index],
      ]);
    });
  }

  it("wraps from week 5 back to week 1", () => {
    // The Monday after week 5 restarts the cycle.
    expect(getRotationIndex(localDate("2026-09-07"), START)).toBe(0);
    expect(getRotationIndex(localDate("2026-09-14"), START)).toBe(1);
  });

  it("keeps wrapping for many cycles", () => {
    // 52 weeks later: 52 % 5 === 2, so week 3.
    expect(getRotationIndex(localDate("2027-08-02"), START)).toBe(2);
  });

  it("gives the table and the Expedition the same position mapping", () => {
    const assignments = getWeeklyAssignments(localDate("2026-08-17"), START);
    // Both scenes read `assignments.children`, so the mapping is shared by
    // construction — this asserts the shape they both rely on.
    expect(assignments.children.map((entry) => entry.position)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });
});

describe("Monday boundaries", () => {
  it("rotates on Monday, not Sunday evening", () => {
    // Sunday 23:59 local is still week 1.
    expect(getRotationIndex(localDate("2026-08-09", 23, 59), START)).toBe(0);
    // Monday 00:00 local is week 2.
    expect(getRotationIndex(localDate("2026-08-10", 0, 0), START)).toBe(1);
  });

  it("treats every day of a week as the same rotation", () => {
    const indexes = [
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ].map((iso) => getRotationIndex(localDate(iso), START));

    expect(new Set(indexes).size).toBe(1);
  });

  it("reports the Monday-to-Sunday date range", () => {
    const { start, end } = getRotationDateRange(localDate("2026-08-13"));
    expect(start.getDate()).toBe(10);
    expect(end.getDate()).toBe(16);
    expect(start.getDay()).toBe(1);
    expect(end.getDay()).toBe(0);
  });

  it("counts down to the next rotation", () => {
    expect(getDaysUntilNextRotation(localDate("2026-08-10"))).toBe(7);
    expect(getDaysUntilNextRotation(localDate("2026-08-15"))).toBe(2);
    expect(getDaysUntilNextRotation(localDate("2026-08-16"))).toBe(1);
    expect(getNextRotationDate(localDate("2026-08-16")).getDate()).toBe(17);
  });

  it("uses friendly countdown language", () => {
    const monday = localDate("2026-08-10");
    const sunday = localDate("2026-08-16");
    const friday = localDate("2026-08-14");

    expect(isRotationDay(monday)).toBe(true);
    expect(getCountdownLabel(monday, getDaysUntilNextRotation(monday))).toBe(
      "Seats rotate today",
    );
    expect(getCountdownLabel(sunday, getDaysUntilNextRotation(sunday))).toBe(
      "New seats tomorrow",
    );
    expect(getCountdownLabel(friday, getDaysUntilNextRotation(friday))).toBe(
      "New seats in 3 days",
    );
  });
});

describe("dates before the rotation starts", () => {
  it("never produces a negative index", () => {
    for (const iso of ["2026-08-02", "2026-07-20", "2020-01-01"]) {
      const index = getRotationIndex(localDate(iso), START);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(CHILD_ROTATION_SCHEDULE.length);
    }
  });

  it("shows week 1 as the upcoming assignment", () => {
    const status = getRotationStatus(localDate("2026-07-15"), START);
    expect(status.hasStarted).toBe(false);
    expect(status.weekNumber).toBe(1);
    expect(getElapsedWeeks(localDate("2026-07-15"), START)).toBe(0);
  });

  it("counts down to the start date, not to the next Monday", () => {
    // 2026-07-20 is a Monday, but the rotation does not begin until Aug 3.
    const status = getRotationStatus(localDate("2026-07-20"), START);
    expect(status.countdownLabel).toBe("New seats in 14 days");
    expect(status.nextRotation.getDate()).toBe(3);
    expect(status.nextRotation.getMonth()).toBe(7); // August
    // The displayed range is week 1's real dates, not the current week's.
    expect(status.weekStart.getDate()).toBe(3);
    expect(status.weekEnd.getDate()).toBe(9);
  });

  it("switches to normal countdowns once the rotation begins", () => {
    const status = getRotationStatus(localDate("2026-08-03"), START);
    expect(status.hasStarted).toBe(true);
    expect(status.countdownLabel).toBe("Seats rotate today");
    expect(status.weekStart.getDate()).toBe(3);
  });

  it("flags the rotation as started on and after the start date", () => {
    expect(getRotationStatus(localDate("2026-08-03"), START).hasStarted).toBe(
      true,
    );
    expect(getRotationStatus(localDate("2026-08-02"), START).hasStarted).toBe(
      false,
    );
  });
});

describe("local-time and calendar edge cases", () => {
  it("survives the spring-forward daylight-saving boundary", () => {
    // US DST begins Sunday 2027-03-14; that week starts Monday 2027-03-08.
    const before = localDate("2027-03-13");
    const after = localDate("2027-03-15");
    expect(differenceInCalendarDays(before, after)).toBe(2);
    expect(getRotationIndex(before, START)).not.toBe(getRotationIndex(after, START));
    expect(startOfWeekMonday(after).getDate()).toBe(15);
  });

  it("survives the autumn fall-back boundary", () => {
    // US DST ends Sunday 2026-11-01.
    const saturday = localDate("2026-10-31");
    const monday = localDate("2026-11-02");
    expect(differenceInCalendarDays(saturday, monday)).toBe(2);
    expect(startOfWeekMonday(saturday).getDate()).toBe(26);
    expect(startOfWeekMonday(monday).getDate()).toBe(2);
  });

  it("crosses a year boundary", () => {
    // 2026-12-28 is a Monday; 2027-01-04 is the next one.
    const range = getRotationDateRange(localDate("2026-12-31"));
    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getDate()).toBe(28);
    expect(range.end.getFullYear()).toBe(2027);
    expect(range.end.getDate()).toBe(3);

    const weeks = differenceInCalendarDays(
      startOfWeekMonday(localDate("2026-12-28")),
      startOfWeekMonday(localDate("2027-01-04")),
    );
    expect(weeks).toBe(7);
  });

  it("counts across a leap day", () => {
    // 2028 is a leap year: Feb has 29 days.
    expect(
      differenceInCalendarDays(localDate("2028-02-28"), localDate("2028-03-01")),
    ).toBe(2);
    expect(parseLocalDate("2028-02-29")).not.toBeNull();
    expect(parseLocalDate("2027-02-29")).toBeNull();
  });

  it("rejects malformed configuration dates", () => {
    expect(parseLocalDate("not-a-date")).toBeNull();
    expect(parseLocalDate("2026-13-01")).toBeNull();
    expect(parseLocalDate("2026-08-32")).toBeNull();
  });
});

describe("elapsed weeks", () => {
  it("counts complete weeks since the start Monday", () => {
    expect(getElapsedWeeks(localDate("2026-08-03"), START)).toBe(0);
    expect(getElapsedWeeks(localDate("2026-08-09"), START)).toBe(0);
    expect(getElapsedWeeks(localDate("2026-08-10"), START)).toBe(1);
    expect(getElapsedWeeks(localDate("2026-10-05"), START)).toBe(9);
  });
});

describe("rotation lookups", () => {
  it("returns the raw permutation for a week", () => {
    expect(getWeekPermutation(localDate("2026-08-03"), START)).toEqual(
      CHILD_ROTATION_SCHEDULE[0],
    );
    expect(getWeekPermutation(localDate("2026-08-24"), START)).toEqual(
      CHILD_ROTATION_SCHEDULE[3],
    );
  });

  it("looks a child up by position", () => {
    const assignments = getWeeklyAssignments(localDate("2026-08-03"), START);
    for (const position of [1, 2, 3, 4, 5] as const) {
      expect(getChildAtPosition(assignments, position)).toBe(
        CHILD_ROTATION_SCHEDULE[0][position - 1],
      );
    }
  });

  it("throws for a position that does not exist", () => {
    const assignments = getWeeklyAssignments(localDate("2026-08-03"), START);
    expect(() =>
      // @ts-expect-error deliberately out of range
      getChildAtPosition(assignments, 9),
    ).toThrow(/No child assigned to position/);
  });
});

describe("invalid configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails loudly for a malformed start date outside production", () => {
    expect(() => getRotationStartDate("the first Monday")).toThrow(
      /not a valid YYYY-MM-DD date/,
    );
    expect(() => getRotationStartDate("2026-02-30")).toThrow();
  });

  it("snaps a mid-week start date back to its Monday", () => {
    // 2026-08-05 is a Wednesday.
    const start = getRotationStartDate("2026-08-05");
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(3);
  });

  it("falls back to the current week in production rather than crashing", () => {
    vi.stubEnv("NODE_ENV", "production");

    // 2026-08-05 is a Wednesday, so the fallback is that week's Monday.
    const start = getRotationStartDate("nonsense", localDate("2026-08-05"));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(3);
  });
});
