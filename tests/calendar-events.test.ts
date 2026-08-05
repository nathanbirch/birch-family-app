import { describe, expect, it } from "vitest";

import {
  buildEvents,
  eventsOnDay,
  nextEvent,
  upcomingEvents,
  type CalendarEvent,
} from "@/lib/calendar/events";
import {
  formatEventTiming,
  formatNextEventBadge,
} from "@/lib/calendar/format";
import { parseIcs } from "@/lib/calendar/ics";

const WINDOW = {
  windowStartMs: Date.UTC(2026, 6, 1),
  windowEndMs: Date.UTC(2027, 0, 1),
  limit: 1000,
};

/** Wrap `lines` in a VCALENDAR and expand it. */
function build(lines: string[], zone = "America/Boise"): CalendarEvent[] {
  const feed = [
    "BEGIN:VCALENDAR",
    `X-WR-TIMEZONE:${zone}`,
    ...lines,
    "END:VCALENDAR",
  ].join("\r\n");
  return buildEvents(parseIcs(feed), WINDOW).events;
}

function event(lines: string[]): string[] {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
}

describe("all-day events", () => {
  it("treats DTEND as exclusive and reports the last day inclusively", () => {
    // A trip from the 6th to the 8th is written with DTEND on the 9th.
    const [trip] = build(
      event([
        "UID:trip",
        "SUMMARY:James — field trip",
        "DTSTART;VALUE=DATE:20260806",
        "DTEND;VALUE=DATE:20260809",
      ]),
    );

    expect(trip.allDay).toBe(true);
    expect(trip.startDate).toBe("2026-08-06");
    expect(trip.endDate).toBe("2026-08-08");
  });

  it("gives a single-day event the same start and end day", () => {
    const [day] = build(
      event([
        "UID:one",
        "SUMMARY:School photos",
        "DTSTART;VALUE=DATE:20260806",
        "DTEND;VALUE=DATE:20260807",
      ]),
    );
    expect(day.startDate).toBe("2026-08-06");
    expect(day.endDate).toBe("2026-08-06");
  });

  it("defaults to one day when DTEND is missing", () => {
    const [day] = build(
      event(["UID:one", "SUMMARY:Birthday", "DTSTART;VALUE=DATE:20260806"]),
    );
    expect(day.endDate).toBe("2026-08-06");
  });

  it("never converts an all-day date through a timezone", () => {
    // The date on the feed is the date on the calendar, whatever zone the
    // server or the reader happens to be in.
    const [day] = build(
      event(["UID:one", "SUMMARY:Birthday", "DTSTART;VALUE=DATE:20260806"]),
      "Pacific/Kiritimati",
    );
    expect(day.startDate).toBe("2026-08-06");
  });
});

describe("timed events", () => {
  it("converts a zoned start to the right instant", () => {
    const [piano] = build(
      event([
        "UID:piano",
        "SUMMARY:Clara — piano",
        "DTSTART;TZID=America/Boise:20260804T150000",
        "DTEND;TZID=America/Boise:20260804T154500",
      ]),
    );

    expect(piano.allDay).toBe(false);
    expect(piano.start).toBe(Date.UTC(2026, 7, 4, 21));
    expect(piano.end).toBe(Date.UTC(2026, 7, 4, 21, 45));
  });

  it("falls back to the calendar's own zone when an event has no TZID", () => {
    const [dinner] = build(
      event(["UID:d", "SUMMARY:Dinner", "DTSTART:20260804T180000"]),
    );
    // 6pm Mountain Daylight Time is midnight UTC the next day.
    expect(dinner.start).toBe(Date.UTC(2026, 7, 5, 0));
  });

  it("uses DURATION when there is no DTEND", () => {
    const [swim] = build(
      event([
        "UID:s",
        "SUMMARY:Swim",
        "DTSTART;TZID=America/Boise:20260804T150000",
        "DURATION:PT1H30M",
      ]),
    );
    expect(swim.end - swim.start).toBe(90 * 60 * 1000);
  });

  it("keeps each occurrence the same length as the first", () => {
    const events = build(
      event([
        "UID:piano",
        "SUMMARY:Clara — piano",
        "DTSTART;TZID=America/Boise:20260804T150000",
        "DTEND;TZID=America/Boise:20260804T154500",
        "RRULE:FREQ=WEEKLY;COUNT=3",
      ]),
    );

    expect(events).toHaveLength(3);
    for (const occurrence of events) {
      expect(occurrence.end - occurrence.start).toBe(45 * 60 * 1000);
    }
  });

  it("holds a repeating event at the same local time across a DST change", () => {
    const events = build(
      event([
        "UID:piano",
        "SUMMARY:Clara — piano",
        "DTSTART;TZID=America/Boise:20261028T150000",
        "DTEND;TZID=America/Boise:20261028T154500",
        "RRULE:FREQ=WEEKLY;COUNT=3",
      ]),
    );

    // 2026 daylight saving ends on 1 November, between the 2nd and 3rd of
    // these. All three must still read 3pm in Boise.
    const local = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Boise",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    });

    const times = events.map((occurrence) => local.format(new Date(occurrence.start)));
    expect(times).toEqual(["15:00", "15:00", "15:00"]);
  });
});

describe("exclusions and overrides", () => {
  const base = [
    "UID:piano",
    "SUMMARY:Clara — piano",
    "DTSTART;TZID=America/Boise:20260804T150000",
    "DTEND;TZID=America/Boise:20260804T154500",
    "RRULE:FREQ=WEEKLY;COUNT=4",
  ];

  it("removes an occurrence named by EXDATE", () => {
    const events = build(
      event([...base, "EXDATE;TZID=America/Boise:20260811T150000"]),
    );
    expect(events).toHaveLength(3);
    expect(events.map((occurrence) => occurrence.start)).not.toContain(
      Date.UTC(2026, 7, 11, 21),
    );
  });

  it("moves an occurrence named by RECURRENCE-ID", () => {
    const events = build([
      ...event(base),
      ...event([
        "UID:piano",
        "SUMMARY:Clara — piano (later)",
        "RECURRENCE-ID;TZID=America/Boise:20260811T150000",
        "DTSTART;TZID=America/Boise:20260811T160000",
        "DTEND;TZID=America/Boise:20260811T164500",
      ]),
    ]);

    expect(events).toHaveLength(4);
    const moved = events.find((occurrence) => occurrence.title.includes("later"))!;
    expect(moved.start).toBe(Date.UTC(2026, 7, 11, 22));
    // The 3pm slot it replaced is gone, not doubled up.
    expect(events.map((occurrence) => occurrence.start)).not.toContain(
      Date.UTC(2026, 7, 11, 21),
    );
  });

  it("deletes an occurrence cancelled by an override", () => {
    const events = build([
      ...event(base),
      ...event([
        "UID:piano",
        "STATUS:CANCELLED",
        "RECURRENCE-ID;TZID=America/Boise:20260811T150000",
        "DTSTART;TZID=America/Boise:20260811T150000",
      ]),
    ]);
    expect(events).toHaveLength(3);
  });

  it("drops a cancelled series entirely", () => {
    expect(build(event([...base, "STATUS:CANCELLED"]))).toEqual([]);
  });

  it("adds a one-off RDATE outside the rule", () => {
    const events = build(
      event([...base, "RDATE;TZID=America/Boise:20260815T150000"]),
    );
    expect(events.map((occurrence) => occurrence.start)).toContain(
      Date.UTC(2026, 7, 15, 21),
    );
  });
});

describe("eventsOnDay", () => {
  /** A timed event built from the device's local clock. */
  function timed(
    title: string,
    start: [number, number, number, number],
    hours: number,
  ): CalendarEvent {
    const startMs = new Date(start[0], start[1], start[2], start[3]).getTime();
    return {
      id: title,
      title,
      location: null,
      description: null,
      allDay: false,
      start: startMs,
      end: startMs + hours * 60 * 60 * 1000,
      startDate: null,
      endDate: null,
    };
  }

  function allDay(title: string, from: string, to: string): CalendarEvent {
    return {
      id: title,
      title,
      location: null,
      description: null,
      allDay: true,
      start: Date.parse(`${from}T00:00:00Z`),
      end: Date.parse(`${to}T00:00:00Z`) + 86400000,
      startDate: from,
      endDate: to,
    };
  }

  it("finds an event on the day it starts", () => {
    const piano = timed("piano", [2026, 7, 4, 15], 1);
    expect(eventsOnDay([piano], new Date(2026, 7, 4))).toEqual([piano]);
    expect(eventsOnDay([piano], new Date(2026, 7, 5))).toEqual([]);
  });

  it("finds a multi-day all-day event on every day it covers", () => {
    const trip = allDay("trip", "2026-08-06", "2026-08-08");
    for (const day of [6, 7, 8]) {
      expect(eventsOnDay([trip], new Date(2026, 7, day))).toHaveLength(1);
    }
    expect(eventsOnDay([trip], new Date(2026, 7, 9))).toHaveLength(0);
  });

  it("finds an event that runs past midnight on both days", () => {
    const party = timed("party", [2026, 7, 7, 21], 4);
    expect(eventsOnDay([party], new Date(2026, 7, 7))).toHaveLength(1);
    expect(eventsOnDay([party], new Date(2026, 7, 8))).toHaveLength(1);
  });

  it("keeps a zero-length event on its own day", () => {
    const reminder = timed("reminder", [2026, 7, 4, 9], 0);
    expect(eventsOnDay([reminder], new Date(2026, 7, 4))).toHaveLength(1);
  });

  it("sorts all-day events above timed ones", () => {
    const trip = allDay("trip", "2026-08-04", "2026-08-04");
    const piano = timed("piano", [2026, 7, 4, 15], 1);
    expect(
      eventsOnDay([piano, trip], new Date(2026, 7, 4)).map((e) => e.title),
    ).toEqual(["trip", "piano"]);
  });
});

describe("the dashboard badge", () => {
  const today = new Date(2026, 7, 4, 9, 0);

  function timed(title: string, hoursFromNow: number): CalendarEvent {
    const start = today.getTime() + hoursFromNow * 60 * 60 * 1000;
    return {
      id: title,
      title,
      location: null,
      description: null,
      allDay: false,
      start,
      end: start + 60 * 60 * 1000,
      startDate: null,
      endDate: null,
    };
  }

  it("picks the soonest event still ahead", () => {
    const past = timed("past", -5);
    const soon = timed("soon", 2);
    const later = timed("later", 30);
    expect(nextEvent([later, past, soon], today)?.title).toBe("soon");
  });

  it("shows only the time for something later today", () => {
    expect(formatNextEventBadge(timed("soon", 2), today)).toMatch(/11/);
  });

  it("names the day for something further out", () => {
    const badge = formatNextEventBadge(timed("later", 30), today)!;
    expect(badge.startsWith("Tomorrow")).toBe(true);
  });

  it("says nothing when there is nothing ahead", () => {
    expect(formatNextEventBadge(null, today)).toBeNull();
    expect(nextEvent([timed("past", -5)], today)).toBeNull();
  });

  it("trims the list the dashboard is sent", () => {
    const many = Array.from({ length: 50 }, (_, index) => timed(`e${index}`, index + 1));
    expect(upcomingEvents(many, today.getTime(), 10)).toHaveLength(10);
  });
});

describe("formatEventTiming", () => {
  const day = new Date(2026, 7, 7);

  function span(startHour: number, endHour: number, dayOffset = 0): CalendarEvent {
    return {
      id: "x",
      title: "x",
      location: null,
      description: null,
      allDay: false,
      start: new Date(2026, 7, 7 + dayOffset, startHour).getTime(),
      end: new Date(2026, 7, 7 + dayOffset, endHour).getTime(),
      startDate: null,
      endDate: null,
    };
  }

  it("shows a range for an event contained in the day", () => {
    expect(formatEventTiming(span(15, 16), day)).toMatch(/–/);
  });

  it("shows only a start for an event running past midnight", () => {
    const overnight: CalendarEvent = { ...span(21, 21), end: new Date(2026, 7, 8, 1).getTime() };
    expect(formatEventTiming(overnight, day)).toMatch(/^from /);
  });

  it("shows only an end on the second day of an overnight event", () => {
    const overnight: CalendarEvent = {
      ...span(21, 21, -1),
      end: new Date(2026, 7, 7, 1).getTime(),
    };
    expect(formatEventTiming(overnight, day)).toMatch(/^until /);
  });

  it("does not spill an event ending exactly at midnight into the next day", () => {
    const untilMidnight: CalendarEvent = {
      ...span(21, 21),
      end: new Date(2026, 7, 8, 0).getTime(),
    };
    expect(formatEventTiming(untilMidnight, day)).toMatch(/–/);
  });

  it("says All day for an all-day event", () => {
    expect(
      formatEventTiming({ ...span(0, 0), allDay: true }, day),
    ).toBe("All day");
  });
});
