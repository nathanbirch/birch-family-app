import "server-only";

/**
 * Fetching the family calendar.
 *
 * ---------------------------------------------------------------------------
 * THE SECRET NEVER LEAVES THE SERVER
 * ---------------------------------------------------------------------------
 * `CALENDAR_ICS_URL` is a bearer credential: anyone holding it can read the
 * whole calendar, with no login. This module imports `"server-only"`, which
 * turns "this accidentally got imported into a client component" from a silent
 * leak of that URL into a build error.
 *
 * The URL is also deliberately absent from what this module returns. Even the
 * error paths describe the failure without quoting the address, because error
 * text is exactly the sort of thing that ends up in a screenshot.
 *
 * ---------------------------------------------------------------------------
 * A MISSING CALENDAR IS NOT AN ERROR
 * ---------------------------------------------------------------------------
 * There are three legitimate outcomes here and the caller has to tell them
 * apart, so they are modelled as a discriminated union rather than "events, or
 * an exception". A clone without `CALENDAR_ICS_URL` set should show a page
 * explaining how to connect one — not a crash, and not a blank week.
 */

import {
  CALENDAR_FEED_ENV,
  CALENDAR_MAX_OCCURRENCES,
  CALENDAR_MONTHS_AHEAD,
  CALENDAR_MONTHS_BEHIND,
  CALENDAR_REFRESH_SECONDS,
} from "@/config/calendar";

import { buildEvents, type CalendarEvent } from "./events";
import { parseIcs } from "./ics";

/** The configured feed URL, or `null` when the app has not been given one. */
function getCalendarFeedUrl(): string | null {
  return process.env[CALENDAR_FEED_ENV]?.trim() || null;
}

export type CalendarFeed =
  /** No `CALENDAR_ICS_URL`. The page explains how to connect one. */
  | { status: "unconfigured" }
  /** Configured, but Google did not answer or answered with rubbish. */
  | { status: "error"; message: string }
  | {
      status: "ok";
      name: string | null;
      events: CalendarEvent[];
      /** Bounds of the expanded window, as `YYYY-MM-DD`. */
      windowStart: string;
      windowEnd: string;
      /** `true` when the occurrence cap cut the expansion short. */
      truncated: boolean;
    };

/**
 * The window, month-aligned around `now`.
 *
 * Aligning to month boundaries rather than "today minus 30 days" means the
 * month view never opens on a half-populated grid, and it keeps the window
 * stable across a day's worth of requests — which matters because the fetched
 * feed is shared between them.
 */
export function calendarWindow(now: Date): { startMs: number; endMs: number } {
  const startMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() - CALENDAR_MONTHS_BEHIND,
    1,
  );
  const endMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + CALENDAR_MONTHS_AHEAD + 1,
    1,
  );
  return { startMs, endMs };
}

/**
 * Fetch, parse and expand the calendar.
 *
 * The fetch is cached for `CALENDAR_REFRESH_SECONDS` by Next's data cache.
 * The page itself is dynamic — `requireUser()` reads the session cookie — so
 * without this every render would pull the whole `.ics` file from Google
 * again. Caching the fetch and not the page is the right split: the expansion
 * below is cheap, and it has to run per request anyway because the window
 * moves with the calendar day.
 */
export async function loadCalendarFeed(now: Date = new Date()): Promise<CalendarFeed> {
  const url = getCalendarFeedUrl();
  if (!url) return { status: "unconfigured" };

  const { startMs, endMs } = calendarWindow(now);

  let text: string;
  try {
    const response = await fetch(url, {
      next: { revalidate: CALENDAR_REFRESH_SECONDS, tags: ["calendar"] },
      headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8" },
      // Google is normally quick, but a hung request must not hold a page
      // render open indefinitely.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { status: "error", message: describeHttpFailure(response.status) };
    }

    text = await response.text();
  } catch (error) {
    return { status: "error", message: describeFetchError(error) };
  }

  // Google serves an HTML error page rather than a 4xx for some bad URLs, so
  // the content is checked rather than trusted.
  if (!text.includes("BEGIN:VCALENDAR")) {
    return {
      status: "error",
      message:
        "That address did not return a calendar. Check CALENDAR_ICS_URL is " +
        "the secret address in iCal format, ending in .ics.",
    };
  }

  const calendar = parseIcs(text);
  const { events, truncated } = buildEvents(calendar, {
    windowStartMs: startMs,
    windowEndMs: endMs,
    limit: CALENDAR_MAX_OCCURRENCES,
  });

  return {
    status: "ok",
    name: calendar.name,
    events,
    windowStart: isoDay(startMs),
    windowEnd: isoDay(endMs - 1),
    truncated,
  };
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function describeHttpFailure(status: number): string {
  if (status === 404) {
    return (
      "Google does not recognise that calendar address (404). If the secret " +
      "address was reset, copy the new one into CALENDAR_ICS_URL."
    );
  }
  if (status === 401 || status === 403) {
    return (
      "Google refused that calendar address. A secret iCal address needs no " +
      "sign-in, so this usually means the URL is a private *sharing* link " +
      "rather than the iCal one."
    );
  }
  return `Google returned ${status} for the calendar feed.`;
}

function describeFetchError(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "Google did not respond within 10 seconds.";
  }
  // Deliberately not interpolating the error: a fetch failure on a URL with
  // credentials in it can include that URL in its message.
  return "Could not reach Google to fetch the calendar.";
}
