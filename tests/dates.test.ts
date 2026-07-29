import { describe, expect, it } from "vitest";

import {
  addDays,
  atLocalNoon,
  differenceInCalendarDays,
  formatDateRange,
  formatLongDate,
  formatMediumDate,
  isSameLocalDay,
  nextLocalMidnight,
  parseLocalDate,
  startOfWeekMonday,
  toIsoDate,
} from "@/lib/dates";

describe("parseLocalDate", () => {
  it("reads a plain calendar date as local noon", () => {
    const date = parseLocalDate("2026-08-03")!;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(3);
    // Noon, not midnight — this is what stops a UTC parse landing on the
    // previous evening in the Americas.
    expect(date.getHours()).toBe(12);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseLocalDate("  2026-08-03 ")).not.toBeNull();
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    for (const bad of [
      "",
      "tomorrow",
      "2026/08/03",
      "26-08-03",
      "2026-8-3",
      "2026-08-03T00:00:00Z",
    ]) {
      expect(parseLocalDate(bad), bad).toBeNull();
    }
  });

  it("rejects out-of-range and impossible dates", () => {
    for (const bad of [
      "2026-00-10",
      "2026-13-10",
      "2026-08-00",
      "2026-08-32",
      "2026-02-30",
      "2027-02-29",
    ]) {
      expect(parseLocalDate(bad), bad).toBeNull();
    }
    // ...but a real leap day is fine.
    expect(parseLocalDate("2028-02-29")).not.toBeNull();
  });
});

describe("atLocalNoon", () => {
  it("discards the time of day and keeps the calendar date", () => {
    const noon = atLocalNoon(new Date(2026, 7, 3, 23, 59, 59, 999));
    expect(noon.getDate()).toBe(3);
    expect(noon.getHours()).toBe(12);
    expect(noon.getMinutes()).toBe(0);
    expect(noon.getSeconds()).toBe(0);
    expect(noon.getMilliseconds()).toBe(0);
  });

  it("does not mutate its argument", () => {
    const original = new Date(2026, 7, 3, 6, 30);
    atLocalNoon(original);
    expect(original.getHours()).toBe(6);
  });
});

describe("differenceInCalendarDays", () => {
  it("counts whole days forwards and backwards", () => {
    const a = new Date(2026, 7, 3, 12);
    const b = new Date(2026, 7, 10, 12);
    expect(differenceInCalendarDays(a, b)).toBe(7);
    expect(differenceInCalendarDays(b, a)).toBe(-7);
    expect(differenceInCalendarDays(a, a)).toBe(0);
  });

  it("ignores the time of day entirely", () => {
    const lateMonday = new Date(2026, 7, 3, 23, 59);
    const earlyTuesday = new Date(2026, 7, 4, 0, 1);
    expect(differenceInCalendarDays(lateMonday, earlyTuesday)).toBe(1);
  });

  it("survives a daylight-saving transition", () => {
    // US DST begins Sunday 2027-03-14 — that day is only 23 hours long.
    expect(
      differenceInCalendarDays(new Date(2027, 2, 13, 12), new Date(2027, 2, 15, 12)),
    ).toBe(2);
    // ...and ends Sunday 2026-11-01, a 25-hour day.
    expect(
      differenceInCalendarDays(new Date(2026, 9, 31, 12), new Date(2026, 10, 2, 12)),
    ).toBe(2);
  });
});

describe("addDays", () => {
  it("moves forwards and backwards across month ends", () => {
    expect(addDays(new Date(2026, 7, 30, 12), 3).getDate()).toBe(2);
    expect(addDays(new Date(2026, 7, 30, 12), 3).getMonth()).toBe(8);
    expect(addDays(new Date(2026, 8, 2, 12), -3).getMonth()).toBe(7);
  });

  it("crosses a year boundary", () => {
    const next = addDays(new Date(2026, 11, 30, 12), 5);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getDate()).toBe(4);
  });

  it("does not mutate its argument", () => {
    const original = new Date(2026, 7, 3, 12);
    addDays(original, 10);
    expect(original.getDate()).toBe(3);
  });
});

describe("startOfWeekMonday", () => {
  it("returns the same Monday for every day of that week", () => {
    // 2026-08-03 is a Monday.
    for (let offset = 0; offset < 7; offset += 1) {
      const monday = startOfWeekMonday(new Date(2026, 7, 3 + offset, 12));
      expect(monday.getDate(), `offset ${offset}`).toBe(3);
      expect(monday.getDay()).toBe(1);
    }
  });

  it("treats Sunday as the end of the week, not the start", () => {
    // 2026-08-09 is a Sunday; its week began on the 3rd.
    expect(startOfWeekMonday(new Date(2026, 7, 9, 23, 59)).getDate()).toBe(3);
    // Monday the 10th starts the next one.
    expect(startOfWeekMonday(new Date(2026, 7, 10, 0, 0)).getDate()).toBe(10);
  });

  it("steps back into the previous month or year when it has to", () => {
    // 2027-01-01 is a Friday; its week began Monday 2026-12-28.
    const monday = startOfWeekMonday(new Date(2027, 0, 1, 12));
    expect(monday.getFullYear()).toBe(2026);
    expect(monday.getMonth()).toBe(11);
    expect(monday.getDate()).toBe(28);
  });
});

describe("nextLocalMidnight", () => {
  it("is the very start of the following day", () => {
    const midnight = nextLocalMidnight(new Date(2026, 7, 3, 15, 42));
    expect(midnight.getDate()).toBe(4);
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
  });

  it("is always in the future, even a second before midnight", () => {
    const now = new Date(2026, 7, 3, 23, 59, 59);
    expect(nextLocalMidnight(now).getTime()).toBeGreaterThan(now.getTime());
  });

  it("rolls into the next month", () => {
    const midnight = nextLocalMidnight(new Date(2026, 7, 31, 12));
    expect(midnight.getMonth()).toBe(8);
    expect(midnight.getDate()).toBe(1);
  });
});

describe("isSameLocalDay", () => {
  it("compares calendar days, not timestamps", () => {
    expect(
      isSameLocalDay(new Date(2026, 7, 3, 0, 0), new Date(2026, 7, 3, 23, 59)),
    ).toBe(true);
    expect(
      isSameLocalDay(new Date(2026, 7, 3, 23, 59), new Date(2026, 7, 4, 0, 1)),
    ).toBe(false);
    // Same day-of-month in a different month or year is not the same day.
    expect(
      isSameLocalDay(new Date(2026, 7, 3, 12), new Date(2026, 8, 3, 12)),
    ).toBe(false);
    expect(
      isSameLocalDay(new Date(2026, 7, 3, 12), new Date(2027, 7, 3, 12)),
    ).toBe(false);
  });
});

describe("toIsoDate", () => {
  it("pads months and days", () => {
    expect(toIsoDate(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
    expect(toIsoDate(new Date(2026, 11, 25, 12))).toBe("2026-12-25");
  });

  it("uses the local date, never the UTC one", () => {
    // Late in the evening, the UTC date may already be tomorrow; the machine
    // -readable value must still match what the app displays.
    const date = new Date(2026, 7, 3, 23, 30);
    expect(toIsoDate(date)).toBe("2026-08-03");
  });

  it("round-trips through parseLocalDate", () => {
    const iso = "2026-08-03";
    expect(toIsoDate(parseLocalDate(iso)!)).toBe(iso);
  });
});

describe("formatting", () => {
  const monday = new Date(2026, 7, 3, 12);

  it("produces friendly, non-empty local strings", () => {
    expect(formatLongDate(monday)).toMatch(/Monday/);
    expect(formatLongDate(monday)).toMatch(/3/);
    expect(formatMediumDate(monday)).toMatch(/2026/);
    expect(formatMediumDate(monday)).toMatch(/Mon/);
  });

  it("joins a date range with a single consistent separator", () => {
    const range = formatDateRange(monday, addDays(monday, 6));
    expect(range).toContain(" – ");
    // Exactly one separator, and no thin spaces: this is the byte-identical
    // output that keeps the server and client renders in agreement.
    expect(range.split(" – ")).toHaveLength(2);
    expect(range).not.toMatch(/ /);
  });

  it("spans months and years in a range", () => {
    const range = formatDateRange(new Date(2026, 11, 28, 12), new Date(2027, 0, 3, 12));
    expect(range).toMatch(/Dec/);
    expect(range).toMatch(/Jan/);
  });
});
