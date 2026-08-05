import { describe, expect, it } from "vitest";

import {
  addCivilMonths,
  civilInZoneToInstant,
  daysInMonth,
  zoneOffsetMs,
  type Civil,
} from "@/lib/calendar/civil";
import { expandRrule, parseRrule } from "@/lib/calendar/recurrence";

const HOUR = 60 * 60 * 1000;

/** `2026-08-04 15:00` from a compact string, to keep the tests readable. */
function civil(text: string): Civil {
  const [date, time = "00:00"] = text.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return { year, month, day, hour, minute, second: 0 };
}

/** The dates a rule produces, as `YYYY-MM-DD`, within a generous window. */
function occurrences(
  start: string,
  rule: string,
  window: [string, string] = ["2020-01-01", "2030-01-01"],
): string[] {
  return expandRrule({
    start: civil(start),
    rule: parseRrule(rule),
    windowStart: civil(window[0]),
    windowEnd: civil(window[1]),
    limit: 500,
  }).map(
    (occurrence) =>
      `${occurrence.year}-${String(occurrence.month).padStart(2, "0")}-${String(
        occurrence.day,
      ).padStart(2, "0")}`,
  );
}

describe("parseRrule", () => {
  it("reads the common Google shape", () => {
    const rule = parseRrule("FREQ=WEEKLY;BYDAY=TU,TH;INTERVAL=2;COUNT=6");
    expect(rule.freq).toBe("WEEKLY");
    expect(rule.interval).toBe(2);
    expect(rule.count).toBe(6);
    expect(rule.byDay).toEqual([
      { weekday: 2, ordinal: null },
      { weekday: 4, ordinal: null },
    ]);
  });

  it("reads an ordinal BYDAY", () => {
    expect(parseRrule("FREQ=MONTHLY;BYDAY=-1SU").byDay).toEqual([
      { weekday: 0, ordinal: -1 },
    ]);
  });

  it("ignores an INTERVAL of zero, which would never advance", () => {
    expect(parseRrule("FREQ=DAILY;INTERVAL=0").interval).toBe(1);
  });

  it("leaves FREQ null for a frequency it cannot expand", () => {
    expect(parseRrule("FREQ=SECONDLY").freq).toBeNull();
  });
});

describe("expandRrule", () => {
  it("always includes DTSTART, even when it does not match the rule", () => {
    // The series says Tuesdays, but begins on a Wednesday. RFC 5545 §3.8.5.3:
    // DTSTART is an occurrence regardless.
    const dates = occurrences("2026-08-05 15:00", "FREQ=WEEKLY;BYDAY=TU", [
      "2026-08-01",
      "2026-08-31",
    ]);
    expect(dates[0]).toBe("2026-08-05");
    expect(dates[1]).toBe("2026-08-11");
  });

  it("does not emit rule days that fall before DTSTART", () => {
    // BYDAY=MO,WE starting on a Wednesday must not generate that week's Monday.
    const dates = occurrences("2026-08-05 15:00", "FREQ=WEEKLY;BYDAY=MO,WE", [
      "2026-08-01",
      "2026-08-20",
    ]);
    expect(dates).toEqual([
      "2026-08-05",
      "2026-08-10",
      "2026-08-12",
      "2026-08-17",
      "2026-08-19",
    ]);
  });

  /*
   * The regression suite for a bug that lost real events off the family
   * calendar: expansion used to begin at the period *after* DTSTART, so any
   * rule naming several days per period silently dropped the ones sharing
   * DTSTART's own week, month or year. Nothing errored; the events were just
   * absent.
   */
  it("emits the rest of DTSTART's own week", () => {
    // The exact rule from the real feed: babysitting Monday to Thursday,
    // beginning on the Monday. All four days belong to that first week.
    expect(
      occurrences("2026-08-03 08:00", "FREQ=WEEKLY;WKST=SU;COUNT=4;BYDAY=MO,TU,WE,TH", [
        "2026-08-01",
        "2026-08-31",
      ]),
    ).toEqual(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"]);
  });

  it("emits later days of the first week when DTSTART is mid-week", () => {
    // Starting Tuesday, the same week's Thursday still counts.
    expect(
      occurrences("2026-08-04 08:00", "FREQ=WEEKLY;BYDAY=MO,TU,TH", [
        "2026-08-01",
        "2026-08-14",
      ]),
    ).toEqual(["2026-08-04", "2026-08-06", "2026-08-10", "2026-08-11", "2026-08-13"]);
  });

  it("emits the rest of DTSTART's own month", () => {
    expect(
      occurrences("2026-08-01", "FREQ=MONTHLY;BYMONTHDAY=1,15", [
        "2026-08-01",
        "2026-09-30",
      ]),
    ).toEqual(["2026-08-01", "2026-08-15", "2026-09-01", "2026-09-15"]);
  });

  it("emits the rest of DTSTART's own year", () => {
    expect(
      occurrences("2026-03-15", "FREQ=YEARLY;BYMONTH=3,9", ["2026-01-01", "2027-06-01"]),
    ).toEqual(["2026-03-15", "2026-09-15", "2027-03-15"]);
  });

  it("still does not emit DTSTART twice", () => {
    // Period 0 regenerates DTSTART as a candidate; it must be filtered, not
    // counted again — which COUNT would otherwise reveal by coming up short.
    const dates = occurrences("2026-08-03 08:00", "FREQ=WEEKLY;BYDAY=MO;COUNT=3", [
      "2026-08-01",
      "2026-09-30",
    ]);
    expect(dates).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("repeats weekly", () => {
    expect(
      occurrences("2026-08-04 15:00", "FREQ=WEEKLY", ["2026-08-01", "2026-08-31"]),
    ).toEqual(["2026-08-04", "2026-08-11", "2026-08-18", "2026-08-25"]);
  });

  it("honours INTERVAL on whole weeks", () => {
    expect(
      occurrences("2026-08-04 15:00", "FREQ=WEEKLY;INTERVAL=2", [
        "2026-08-01",
        "2026-09-30",
      ]),
    ).toEqual(["2026-08-04", "2026-08-18", "2026-09-01", "2026-09-15", "2026-09-29"]);
  });

  it("repeats daily with an interval", () => {
    expect(
      occurrences("2026-08-04", "FREQ=DAILY;INTERVAL=3", ["2026-08-01", "2026-08-15"]),
    ).toEqual(["2026-08-04", "2026-08-07", "2026-08-10", "2026-08-13"]);
  });

  it("stops after COUNT occurrences", () => {
    expect(
      occurrences("2026-08-04 15:00", "FREQ=WEEKLY;COUNT=3"),
    ).toEqual(["2026-08-04", "2026-08-11", "2026-08-18"]);
  });

  it("stops at UNTIL", () => {
    expect(
      occurrences("2026-08-04 15:00", "FREQ=WEEKLY;UNTIL=20260819T000000"),
    ).toEqual(["2026-08-04", "2026-08-11", "2026-08-18"]);
  });

  it("repeats monthly on the same day of the month", () => {
    expect(
      occurrences("2026-08-15", "FREQ=MONTHLY", ["2026-08-01", "2026-12-01"]),
    ).toEqual(["2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15"]);
  });

  it("skips months that have no 31st rather than clamping to the 30th", () => {
    const dates = occurrences("2026-01-31", "FREQ=MONTHLY", [
      "2026-01-01",
      "2026-06-01",
    ]);
    // February, April and June are absent; nothing lands on the 1st of March.
    expect(dates).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
  });

  it("handles the last Friday of the month", () => {
    expect(
      occurrences("2026-08-28", "FREQ=MONTHLY;BYDAY=-1FR", [
        "2026-08-01",
        "2026-12-01",
      ]),
    ).toEqual(["2026-08-28", "2026-09-25", "2026-10-30", "2026-11-27"]);
  });

  it("handles the second Tuesday of the month", () => {
    expect(
      occurrences("2026-08-11", "FREQ=MONTHLY;BYDAY=2TU", [
        "2026-08-01",
        "2026-11-01",
      ]),
    ).toEqual(["2026-08-11", "2026-09-08", "2026-10-13"]);
  });

  it("handles a negative BYMONTHDAY", () => {
    expect(
      occurrences("2026-08-31", "FREQ=MONTHLY;BYMONTHDAY=-1", [
        "2026-08-01",
        "2026-11-01",
      ]),
    ).toEqual(["2026-08-31", "2026-09-30", "2026-10-31"]);
  });

  it("intersects BYDAY and BYMONTHDAY for Friday the 13th", () => {
    expect(
      occurrences("2026-02-13", "FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13", [
        "2026-01-01",
        "2027-01-01",
      ]),
    ).toEqual(["2026-02-13", "2026-03-13", "2026-11-13"]);
  });

  it("selects with BYSETPOS", () => {
    // The last weekday of each month.
    expect(
      occurrences("2026-08-31", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1", [
        "2026-08-01",
        "2026-12-01",
      ]),
    ).toEqual(["2026-08-31", "2026-09-30", "2026-10-30", "2026-11-30"]);
  });

  it("repeats yearly on the anniversary", () => {
    expect(
      occurrences("2026-08-04", "FREQ=YEARLY", ["2026-01-01", "2030-01-01"]),
    ).toEqual(["2026-08-04", "2027-08-04", "2028-08-04", "2029-08-04"]);
  });

  it("returns only DTSTART for a frequency it cannot expand", () => {
    expect(
      occurrences("2026-08-04 15:00", "FREQ=HOURLY", ["2026-08-01", "2026-08-31"]),
    ).toEqual(["2026-08-04"]);
  });

  it("clips to the requested window without losing its place", () => {
    // Occurrences before the window are counted but not returned, so the first
    // one inside it is the correct week rather than the series' first week.
    expect(
      occurrences("2026-01-06 15:00", "FREQ=WEEKLY", ["2026-08-01", "2026-08-20"]),
    ).toEqual(["2026-08-04", "2026-08-11", "2026-08-18"]);
  });

  it("respects the occurrence limit on an endless rule", () => {
    const result = expandRrule({
      start: civil("2026-01-01"),
      rule: parseRrule("FREQ=DAILY"),
      windowStart: civil("2020-01-01"),
      windowEnd: civil("2040-01-01"),
      limit: 10,
    });
    expect(result).toHaveLength(10);
  });
});

describe("civil arithmetic", () => {
  it("knows how long each month is, leap years included", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 8)).toBe(31);
  });

  it("refuses to roll a 31st into the following month", () => {
    expect(addCivilMonths(civil("2026-01-31"), 1)).toBeNull();
    expect(addCivilMonths(civil("2026-01-31"), 2)).toMatchObject({
      month: 3,
      day: 31,
    });
  });

  it("crosses a year boundary", () => {
    expect(addCivilMonths(civil("2026-11-15"), 3)).toMatchObject({
      year: 2027,
      month: 2,
      day: 15,
    });
  });
});

describe("zone conversion", () => {
  it("reads the offset either side of a daylight-saving change", () => {
    // 2026: US daylight saving runs 8 March to 1 November.
    const winter = Date.UTC(2026, 0, 15, 20);
    const summer = Date.UTC(2026, 6, 15, 20);
    expect(zoneOffsetMs(winter, "America/Boise")).toBe(-7 * HOUR);
    expect(zoneOffsetMs(summer, "America/Boise")).toBe(-6 * HOUR);
  });

  it("turns a wall-clock reading into the right instant", () => {
    // 3pm Mountain Daylight Time is 21:00 UTC.
    expect(civilInZoneToInstant(civil("2026-08-04 15:00"), "America/Boise")).toBe(
      Date.UTC(2026, 7, 4, 21),
    );
    // 3pm Mountain Standard Time is 22:00 UTC.
    expect(civilInZoneToInstant(civil("2026-01-15 15:00"), "America/Boise")).toBe(
      Date.UTC(2026, 0, 15, 22),
    );
  });

  it("keeps a weekly 3pm event at 3pm across the spring transition", () => {
    // This is the whole reason recurrence runs in civil time. The two
    // occurrences are 167 hours apart, not 168 — but both read 3pm locally.
    const before = civilInZoneToInstant(civil("2026-03-04 15:00"), "America/Boise");
    const after = civilInZoneToInstant(civil("2026-03-11 15:00"), "America/Boise");

    expect(after - before).toBe(167 * HOUR);

    const local = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Boise",
      hour: "numeric",
      hour12: false,
    });
    expect(local.format(new Date(before))).toBe(local.format(new Date(after)));
  });

  it("falls back to a zero offset for a zone id Intl does not know", () => {
    // Outlook-sourced calendars can carry Windows zone names.
    expect(zoneOffsetMs(Date.UTC(2026, 7, 4), "Mountain Standard Time")).toBe(0);
  });
});

describe("long-lived series", () => {
  it("reaches a window years after a daily series began", () => {
    // The period walk starts at DTSTART, so a series running since 2010 has to
    // be stepped through to get here. Too small a cap and it never arrives —
    // and, like every bug in this file, it fails by showing nothing at all.
    const dates = expandRrule({
      start: { year: 2010, month: 1, day: 1, hour: 8, minute: 0, second: 0 },
      rule: parseRrule("FREQ=DAILY"),
      windowStart: { year: 2026, month: 8, day: 3, hour: 0, minute: 0, second: 0 },
      windowEnd: { year: 2026, month: 8, day: 5, hour: 23, minute: 59, second: 59 },
      limit: 100,
    });

    expect(dates).toHaveLength(3);
    expect(dates[0]).toMatchObject({ year: 2026, month: 8, day: 3 });
  });

  it("reaches the window for a weekly series from a decade ago", () => {
    const dates = expandRrule({
      start: { year: 2015, month: 6, day: 1, hour: 8, minute: 0, second: 0 },
      rule: parseRrule("FREQ=WEEKLY;BYDAY=MO"),
      windowStart: { year: 2026, month: 8, day: 1, hour: 0, minute: 0, second: 0 },
      windowEnd: { year: 2026, month: 8, day: 31, hour: 23, minute: 59, second: 59 },
      limit: 100,
    });
    expect(dates.length).toBeGreaterThanOrEqual(4);
  });
});
