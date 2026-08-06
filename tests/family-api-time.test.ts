/**
 * @vitest-environment node
 *
 * Dates, ages and birthdays — in Rexburg, not in UTC.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS FILE EXISTS TO PREVENT
 * ---------------------------------------------------------------------------
 * Vercel runs this app in UTC. Rexburg is six or seven hours behind, so from
 * five in the evening until midnight, the server's "today" is the family's
 * "tomorrow". Every one of these has a wrong answer that looks plausible: a
 * child asking about their chores after dinner would be shown tomorrow's
 * column, and a birthday would be reported as today the evening before.
 *
 * So every test below that involves an instant deliberately picks one in that
 * window, and asserts the *family's* answer.
 */
import { describe, expect, it } from "vitest";

import {
  calculateAge,
  daysUntilAnniversary,
  familyNow,
  parseMonthDay,
  toOffsetIso,
} from "@/lib/family-api/time";

const BOISE = "America/Boise";

describe("the family's clock", () => {
  it("reads the evening before as the day before, not the next day", () => {
    // 2026-08-06T04:30Z is 2026-08-05 at 22:30 in Rexburg.
    const now = familyNow(new Date("2026-08-06T04:30:00Z"), BOISE);
    expect(now.date).toBe("2026-08-05");
    expect(now.time).toBe("22:30");
  });

  it("reads the middle of the family's day correctly", () => {
    const now = familyNow(new Date("2026-08-05T18:42:00Z"), BOISE);
    expect(now.date).toBe("2026-08-05");
    expect(now.time).toBe("12:42");
  });

  it("handles midnight without rolling the date forward", () => {
    // 06:00Z in August is midnight in Rexburg — the ICU "hour 24" trap.
    const now = familyNow(new Date("2026-08-05T06:00:00Z"), BOISE);
    expect(now.date).toBe("2026-08-05");
    expect(now.time).toBe("00:00");
    expect(now.minutesSinceMidnight).toBe(0);
  });

  it("gives a proxy date whose calendar fields are the family's", () => {
    const now = familyNow(new Date("2026-08-06T04:30:00Z"), BOISE);
    expect(now.civilNoon.getFullYear()).toBe(2026);
    expect(now.civilNoon.getMonth()).toBe(7); // August
    expect(now.civilNoon.getDate()).toBe(5);
    // Noon, so no timezone or DST shift can move it onto another day.
    expect(now.civilNoon.getHours()).toBe(12);
  });

  it("tracks daylight saving rather than assuming a fixed offset", () => {
    // Mountain Daylight Time in August (-06:00), Mountain Standard in January
    // (-07:00). A hardcoded offset would get one of these wrong.
    expect(toOffsetIso(new Date("2026-08-05T18:00:00Z"), BOISE)).toBe(
      "2026-08-05T12:00:00-06:00",
    );
    expect(toOffsetIso(new Date("2026-01-05T18:00:00Z"), BOISE)).toBe(
      "2026-01-05T11:00:00-07:00",
    );
  });
});

describe("ages", () => {
  // Clara: 2018-04-25.
  it("is one year younger the day before the birthday", () => {
    expect(calculateAge("2018-04-25", "2026-04-24")).toBe(7);
  });

  it("ticks over on the birthday itself", () => {
    expect(calculateAge("2018-04-25", "2026-04-25")).toBe(8);
  });

  it("stays there the day after", () => {
    expect(calculateAge("2018-04-25", "2026-04-26")).toBe(8);
  });

  it("is right for every Birch child on 5 August 2026", () => {
    // The ages named in docs/ai/12: 11, 9, 8, 6 and 4.
    expect(calculateAge("2014-12-05", "2026-08-05")).toBe(11); // Hannah
    expect(calculateAge("2016-11-22", "2026-08-05")).toBe(9); // Emily
    expect(calculateAge("2018-04-25", "2026-08-05")).toBe(8); // Clara
    expect(calculateAge("2019-09-07", "2026-08-05")).toBe(6); // William
    expect(calculateAge("2021-11-19", "2026-08-05")).toBe(4); // James
  });

  it("handles a 29 February birth date in a common year", () => {
    expect(calculateAge("2016-02-29", "2026-02-28")).toBe(9);
    expect(calculateAge("2016-02-29", "2026-03-01")).toBe(10);
  });

  it("returns null rather than a wrong number for a bad date", () => {
    expect(calculateAge("not-a-date", "2026-08-05")).toBeNull();
    expect(calculateAge("2026-02-30", "2026-08-05")).toBeNull();
  });
});

describe("upcoming birthdays", () => {
  it("is zero days away on the day itself", () => {
    expect(daysUntilAnniversary({ month: 8, day: 5 }, "2026-08-05")).toEqual({
      daysAway: 0,
      date: "2026-08-05",
    });
  });

  it("counts forward within a year", () => {
    // William, 7 September, from 5 August 2026.
    expect(daysUntilAnniversary({ month: 9, day: 7 }, "2026-08-05")).toEqual({
      daysAway: 33,
      date: "2026-09-07",
    });
  });

  it("crosses the year boundary rather than going negative", () => {
    // Daddy's birthday is 16 July. Asked on 28 December, the answer is next
    // July, not two hundred days ago.
    const result = daysUntilAnniversary({ month: 7, day: 16 }, "2026-12-28");
    expect(result?.date).toBe("2027-07-16");
    expect(result?.daysAway).toBeGreaterThan(0);
  });

  it("counts a birthday one day into the new year correctly", () => {
    const result = daysUntilAnniversary({ month: 1, day: 5 }, "2026-12-28");
    expect(result).toEqual({ daysAway: 8, date: "2027-01-05" });
  });

  it("counts across a leap day", () => {
    // 2028 is a leap year, so 1 January to 1 March is 60 days, not 59.
    expect(daysUntilAnniversary({ month: 3, day: 1 }, "2028-01-01")?.daysAway).toBe(
      60,
    );
  });

  it("keeps a 29 February anniversary rather than skipping three years in four", () => {
    const result = daysUntilAnniversary({ month: 2, day: 29 }, "2026-02-01");
    expect(result?.date).toBe("2026-03-01");
  });
});

describe("parsing the two birthday formats", () => {
  it("reads a parent's year-less birthday", () => {
    // Deliberately year-less in config/family-birthdays.json: the AI has no
    // business knowing how old Daddy is turning.
    expect(parseMonthDay("--07-16")).toEqual({ month: 7, day: 16 });
    expect(parseMonthDay("--12-09")).toEqual({ month: 12, day: 9 });
  });

  it("reads a child's full birth date", () => {
    expect(parseMonthDay("2018-04-25")).toEqual({ month: 4, day: 25 });
  });

  it("rejects rubbish", () => {
    expect(parseMonthDay("--13-01")).toBeNull();
    expect(parseMonthDay("nonsense")).toBeNull();
  });
});
