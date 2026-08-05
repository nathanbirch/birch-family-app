import { describe, expect, it } from "vitest";

import {
  parseContentLine,
  parseDurationMs,
  parseIcs,
  parseIcsTime,
  unescapeText,
  unfoldLines,
} from "@/lib/calendar/ics";

describe("unfoldLines", () => {
  it("rejoins lines folded with a leading space", () => {
    const text = "SUMMARY:Clara — piano les\r\n son\r\nLOCATION:School";
    expect(unfoldLines(text)).toEqual([
      "SUMMARY:Clara — piano lesson",
      "LOCATION:School",
    ]);
  });

  it("rejoins lines folded with a tab", () => {
    expect(unfoldLines("SUMMARY:Swim\r\n\tmeet")).toEqual(["SUMMARY:Swimmeet"]);
  });

  it("accepts CRLF, LF and bare CR as line breaks", () => {
    expect(unfoldLines("A:1\r\nB:2\nC:3\rD:4")).toEqual([
      "A:1",
      "B:2",
      "C:3",
      "D:4",
    ]);
  });

  it("does not treat a leading space on the very first line as a fold", () => {
    expect(unfoldLines(" A:1")).toEqual([" A:1"]);
  });
});

describe("parseContentLine", () => {
  it("splits name, parameters and value", () => {
    const line = parseContentLine("DTSTART;TZID=America/Boise:20260804T150000")!;
    expect(line.name).toBe("DTSTART");
    expect(line.params.get("TZID")).toBe("America/Boise");
    expect(line.value).toBe("20260804T150000");
  });

  it("ignores a colon inside a quoted parameter", () => {
    // The case that breaks a naive split(":") — a quoted zone with an offset.
    const line = parseContentLine('DTSTART;TZID="GMT+05:30":20260804T150000')!;
    expect(line.params.get("TZID")).toBe("GMT+05:30");
    expect(line.value).toBe("20260804T150000");
  });

  it("keeps colons in the value itself", () => {
    const line = parseContentLine("DESCRIPTION:Bring: shoes, towel")!;
    expect(line.value).toBe("Bring: shoes, towel");
  });

  it("upper-cases the property name", () => {
    expect(parseContentLine("summary:Hi")!.name).toBe("SUMMARY");
  });

  it("returns null for a line with no colon", () => {
    expect(parseContentLine("NONSENSE")).toBeNull();
  });
});

describe("unescapeText", () => {
  it("decodes newlines, commas, semicolons and backslashes", () => {
    expect(unescapeText("Bring\\nshoes\\, towel\\; hat\\\\")).toBe(
      "Bring\nshoes, towel; hat\\",
    );
  });

  it("does not turn an escaped backslash followed by n into a newline", () => {
    // "\\n" is a literal backslash then the letter n, not a line break.
    expect(unescapeText("C:\\\\next")).toBe("C:\\next");
  });
});

describe("parseIcsTime", () => {
  it("reads an all-day date", () => {
    const time = parseIcsTime("20260804", new Map())!;
    expect(time.kind).toBe("date");
    expect(time.civil).toMatchObject({ year: 2026, month: 8, day: 4 });
  });

  it("reads a zoned date-time", () => {
    const params = new Map([["TZID", "America/Boise"]]);
    const time = parseIcsTime("20260804T150000", params)!;
    expect(time).toMatchObject({ kind: "dateTime", zone: "America/Boise" });
    expect(time.civil).toMatchObject({ hour: 15, minute: 0 });
  });

  it("treats a trailing Z as UTC and ignores any TZID", () => {
    const params = new Map([["TZID", "America/Boise"]]);
    const time = parseIcsTime("20260804T210000Z", params)!;
    expect(time).toMatchObject({ kind: "dateTime", zone: "UTC" });
  });

  it("reads a floating time as having no zone", () => {
    const time = parseIcsTime("20260804T150000", new Map())!;
    expect(time).toMatchObject({ kind: "dateTime", zone: null });
  });

  it("returns null for anything else", () => {
    expect(parseIcsTime("not-a-date", new Map())).toBeNull();
  });
});

describe("parseDurationMs", () => {
  it("reads hours and minutes", () => {
    expect(parseDurationMs("PT1H30M")).toBe(90 * 60 * 1000);
  });

  it("reads whole days and weeks", () => {
    expect(parseDurationMs("P2D")).toBe(2 * 86400 * 1000);
    expect(parseDurationMs("P1W")).toBe(7 * 86400 * 1000);
  });

  it("returns null for a value that is not a duration", () => {
    expect(parseDurationMs("90 minutes")).toBeNull();
  });
});

describe("parseIcs", () => {
  const feed = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "X-WR-CALNAME:Birch Family",
    "X-WR-TIMEZONE:America/Boise",
    "BEGIN:VEVENT",
    "UID:piano@google.com",
    "SUMMARY:Clara — piano",
    "LOCATION:Mrs Adams",
    "DTSTART;TZID=America/Boise:20260804T150000",
    "DTEND;TZID=America/Boise:20260804T154500",
    "RRULE:FREQ=WEEKLY;BYDAY=TU",
    "EXDATE;TZID=America/Boise:20260901T150000",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:trip@google.com",
    "SUMMARY:James — field trip",
    "DTSTART;VALUE=DATE:20260806",
    "DTEND;VALUE=DATE:20260807",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("reads the calendar's name and default zone", () => {
    const calendar = parseIcs(feed);
    expect(calendar.name).toBe("Birch Family");
    expect(calendar.timeZone).toBe("America/Boise");
  });

  it("reads both events", () => {
    expect(parseIcs(feed).events).toHaveLength(2);
  });

  it("keeps a VALARM's own DESCRIPTION off the event", () => {
    // The reminder inside the piano lesson has DESCRIPTION:Reminder. If the
    // nested component were not skipped, the event would claim it.
    const piano = parseIcs(feed).events[0];
    expect(piano.description).toBeNull();
    expect(piano.summary).toBe("Clara — piano");
  });

  it("collects the recurrence rule and exclusions", () => {
    const piano = parseIcs(feed).events[0];
    expect(piano.rrule).toBe("FREQ=WEEKLY;BYDAY=TU");
    expect(piano.exdates).toHaveLength(1);
    expect(piano.exdates[0].civil).toMatchObject({ month: 9, day: 1 });
  });

  it("marks an all-day event as a date, not a date-time", () => {
    const trip = parseIcs(feed).events[1];
    expect(trip.start.kind).toBe("date");
    expect(trip.end?.kind).toBe("date");
  });

  it("drops an event with no DTSTART rather than throwing", () => {
    const broken = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:broken",
      "SUMMARY:No start",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcs(broken).events).toEqual([]);
  });

  it("survives complete rubbish", () => {
    expect(() => parseIcs("this is not a calendar")).not.toThrow();
    expect(parseIcs("this is not a calendar").events).toEqual([]);
  });
});
