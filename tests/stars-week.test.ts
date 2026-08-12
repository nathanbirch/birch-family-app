import { describe, expect, it } from "vitest";

import { getWeekStartIso, parseWeekStart } from "@/lib/stars/week";

/**
 * Which week a star belongs to, and which day of it may be coloured in.
 *
 * Small module, disproportionate blast radius: the page renders a chart from
 * these answers and the Server Action re-derives the same answers to decide
 * whether to accept the tick. If they ever disagreed, a star could be drawn as
 * tappable and refused a tap later.
 */

function localDate(iso: string, hour = 12, minute = 0): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe("naming the week", () => {
  it("names every day of one week after the same Monday", () => {
    // 3 August 2026 is a Monday; the 9th is the Sunday that closes it.
    for (let day = 3; day <= 9; day += 1) {
      expect(getWeekStartIso(localDate(`2026-08-0${day}`))).toBe("2026-08-03");
    }
    expect(getWeekStartIso(localDate("2026-08-10"))).toBe("2026-08-10");
  });

  it("puts Sunday in the week that has already started, not the one about to", () => {
    // The classic off-by-one: `getDay()` calls Sunday 0, which would make it
    // the *first* day of the coming week rather than the last of this one.
    expect(getWeekStartIso(localDate("2026-08-09"))).toBe("2026-08-03");
  });

  it("does not care what time of day it is", () => {
    for (const hour of [0, 1, 9, 12, 18, 23]) {
      expect(getWeekStartIso(localDate("2026-08-05", hour))).toBe("2026-08-03");
    }
  });

  it("crosses a month and a year boundary", () => {
    expect(getWeekStartIso(localDate("2026-09-02"))).toBe("2026-08-31");
    expect(getWeekStartIso(localDate("2027-01-01"))).toBe("2026-12-28");
  });
});

describe("parsing a stored week key", () => {
  it("accepts a Monday", () => {
    const parsed = parseWeekStart("2026-08-03");
    expect(parsed).not.toBeNull();
    expect(parsed!.getDay()).toBe(1);
  });

  it("refuses any other day", () => {
    // Otherwise a hand-crafted request could open a second, offset set of
    // documents covering the same seven days — two charts for one week.
    for (const notMonday of [
      "2026-08-04",
      "2026-08-05",
      "2026-08-08",
      "2026-08-09",
    ]) {
      expect(parseWeekStart(notMonday)).toBeNull();
    }
  });

  it("refuses anything that is not a date at all", () => {
    for (const rubbish of [
      "",
      "  ",
      "not-a-date",
      "2026-8-3",
      "26-08-03",
      "2026-13-01",
      "2026-02-30",
      "2026-08-03T00:00:00Z",
      "../../etc/passwd",
    ]) {
      expect(parseWeekStart(rubbish)).toBeNull();
    }
  });
});
