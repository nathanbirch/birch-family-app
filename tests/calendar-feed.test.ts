/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * `feed.ts` imports `server-only`, which throws outside a React Server
 * Component. Stubbing it is what lets the fetch-and-expand pipeline be covered
 * end to end without standing up a Next server — the same trick the other
 * server-side suites use.
 */
vi.mock("server-only", () => ({}));

const { loadCalendarFeed, calendarWindow } = await import("@/lib/calendar/feed");

const NOW = new Date(Date.UTC(2026, 7, 4, 15));

/** A feed shaped the way Google actually writes one. */
const FEED = [
  "BEGIN:VCALENDAR",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "VERSION:2.0",
  "X-WR-CALNAME:Birch Family",
  "X-WR-TIMEZONE:America/Boise",
  "BEGIN:VEVENT",
  "UID:piano@google.com",
  "SUMMARY:Clara — piano",
  "LOCATION:Mrs Adams",
  "DTSTART;TZID=America/Boise:20260804T150000",
  "DTEND;TZID=America/Boise:20260804T154500",
  "RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=4",
  "EXDATE;TZID=America/Boise:20260818T150000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:trip@google.com",
  "SUMMARY:James — field trip",
  "DTSTART;VALUE=DATE:20260806",
  "DTEND;VALUE=DATE:20260808",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const URL_KEY = "CALENDAR_ICS_URL";
const SECRET = "https://calendar.google.com/calendar/ical/abc/private-xyz/basic.ics";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env[URL_KEY] = SECRET;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env[URL_KEY];
  vi.unstubAllGlobals();
});

function respond(body: string, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

describe("loadCalendarFeed", () => {
  it("reports being unconfigured rather than failing", async () => {
    delete process.env[URL_KEY];
    expect(await loadCalendarFeed(NOW)).toEqual({ status: "unconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a blank variable as unconfigured", async () => {
    process.env[URL_KEY] = "   ";
    expect(await loadCalendarFeed(NOW)).toEqual({ status: "unconfigured" });
  });

  it("expands a real-shaped feed end to end", async () => {
    respond(FEED);
    const result = await loadCalendarFeed(NOW);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.name).toBe("Birch Family");
    expect(result.truncated).toBe(false);

    const piano = result.events.filter((event) => event.title === "Clara — piano");
    // Four weekly occurrences, one of them excluded by EXDATE.
    expect(piano).toHaveLength(3);
    expect(piano[0].start).toBe(Date.UTC(2026, 7, 4, 21));
    expect(piano.map((event) => event.start)).not.toContain(Date.UTC(2026, 7, 18, 21));

    const trip = result.events.find((event) => event.title.includes("field trip"))!;
    expect(trip.allDay).toBe(true);
    // DTEND is exclusive: the 8th on the feed means the trip ends on the 7th.
    expect(trip.startDate).toBe("2026-08-06");
    expect(trip.endDate).toBe("2026-08-07");
  });

  it("asks Google to cache the feed rather than refetching per render", async () => {
    respond(FEED);
    await loadCalendarFeed(NOW);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SECRET);
    expect(init.next.revalidate).toBeGreaterThan(0);
  });

  it("names a 404 as a reset secret address", async () => {
    respond("", 404);
    const result = await loadCalendarFeed(NOW);
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toMatch(/404/);
  });

  it("catches Google answering with an HTML error page", async () => {
    respond("<!doctype html><title>Error 404</title>");
    const result = await loadCalendarFeed(NOW);
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toMatch(/did not return a calendar/);
  });

  it("survives the network failing", async () => {
    fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    expect((await loadCalendarFeed(NOW)).status).toBe("error");
  });

  it("never puts the secret URL in a message it renders", async () => {
    // Error text ends up in screenshots. Every failure path is checked, because
    // this is the one that would leak the whole calendar.
    const failures: Array<() => void> = [
      () => respond("", 404),
      () => respond("", 403),
      () => respond("", 500),
      () => respond("<html>nope</html>"),
      () => fetchMock.mockRejectedValue(new Error(`fetch failed for ${SECRET}`)),
    ];

    for (const arrange of failures) {
      arrange();
      const result = await loadCalendarFeed(NOW);
      if (result.status === "error") {
        expect(result.message).not.toContain("private-xyz");
        expect(result.message).not.toContain(SECRET);
      }
    }
  });
});

describe("calendarWindow", () => {
  it("aligns to month boundaries either side of now", () => {
    const { startMs, endMs } = calendarWindow(NOW);
    expect(new Date(startMs).toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(new Date(endMs).toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });

  it("crosses a year boundary correctly", () => {
    const { startMs } = calendarWindow(new Date(Date.UTC(2026, 0, 15)));
    expect(new Date(startMs).toISOString()).toBe("2025-12-01T00:00:00.000Z");
  });
});
