/**
 * From parsed iCalendar records to the occurrences the UI draws.
 *
 * This is where the three moving parts meet: the raw `VEVENT`s from `ics.ts`,
 * the recurrence expansion in `recurrence.ts`, and the timezone conversion in
 * `civil.ts`. What comes out is a flat, sorted list of occurrences with
 * absolute start and end instants — no rules left to evaluate, nothing further
 * to expand.
 *
 * ---------------------------------------------------------------------------
 * ALL-DAY EVENTS ARE NOT MIDNIGHT-TO-MIDNIGHT
 * ---------------------------------------------------------------------------
 * The single most common calendar bug is treating an all-day event as an
 * instant. "James — field trip, 6 August" is a *calendar square*. Turn it into
 * midnight in some timezone and it lands on the 5th for anyone east or west of
 * wherever you did the conversion — which for this app matters, because the
 * server renders in UTC and the phones are in Mountain Time.
 *
 * So all-day occurrences carry `startDate`/`endDate` as plain `YYYY-MM-DD`
 * strings and are matched against the grid by string comparison, never by
 * timestamp. Timed occurrences carry instants and are matched by overlap. The
 * two kinds never share a code path.
 */

import { toIsoDate } from "@/lib/dates";

import {
  addCivilDays,
  civilInLocalZoneToInstant,
  civilInZoneToInstant,
  civilToUtcMs,
  utcMsToCivil,
  zoneOffsetMs,
  type Civil,
} from "./civil";
import {
  parseDurationMs,
  type IcsCalendar,
  type IcsEvent,
  type IcsTime,
} from "./ics";
import { expandRrule, parseRrule } from "./recurrence";

/** One occurrence, ready to render. Serialisable — it crosses to the client. */
export type CalendarEvent = {
  /** Stable across renders: the series id plus which occurrence this is. */
  id: string;
  title: string;
  location: string | null;
  description: string | null;
  allDay: boolean;
  /**
   * Absolute start, epoch milliseconds.
   *
   * For an all-day occurrence this is a *sort key only* — it is the date read
   * as UTC midnight, and must not be formatted or converted. Use `startDate`.
   */
  start: number;
  /** Absolute end, exclusive. Same caveat for all-day occurrences. */
  end: number;
  /** All-day only: the first day, `YYYY-MM-DD`. `null` on timed events. */
  startDate: string | null;
  /** All-day only: the last day, **inclusive**. `null` on timed events. */
  endDate: string | null;
};

export type BuildOptions = {
  /** Instant the window opens. */
  windowStartMs: number;
  /** Instant the window closes. */
  windowEndMs: number;
  /** Ceiling on returned occurrences. */
  limit: number;
};

export type BuildResult = {
  events: CalendarEvent[];
  /** `true` when `limit` cut the expansion short. */
  truncated: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Expand a parsed calendar into occurrences inside the window.
 *
 * Ordering of the three passes matters:
 *
 * 1. **Split** the records into series and the one-off records that *override*
 *    a single occurrence of a series ("this week's lesson is at 4pm").
 * 2. **Expand** each series, then let its overrides replace or delete
 *    individual occurrences. An override arriving before expansion would have
 *    nothing to attach to.
 * 3. **Emit** overrides whose series is absent — which happens legitimately
 *    when the series itself started before the window.
 */
export function buildEvents(
  calendar: IcsCalendar,
  options: BuildOptions,
): BuildResult {
  const { windowStartMs, windowEndMs, limit } = options;

  const series: IcsEvent[] = [];
  const overrides = new Map<string, IcsEvent[]>();

  for (const event of calendar.events) {
    if (event.recurrenceId) {
      const existing = overrides.get(event.uid);
      if (existing) existing.push(event);
      else overrides.set(event.uid, [event]);
    } else {
      series.push(event);
    }
  }

  const results: CalendarEvent[] = [];
  let truncated = false;

  for (const event of series) {
    if (results.length >= limit) {
      truncated = true;
      break;
    }

    const built = expandSeries(
      event,
      overrides.get(event.uid) ?? [],
      calendar.timeZone,
      { windowStartMs, windowEndMs, limit: limit - results.length },
    );

    results.push(...built.events);
    truncated ||= built.truncated;
  }

  // Overrides for a series we never saw. Their `RECURRENCE-ID` points at an
  // occurrence that does not exist here, so they are simply standalone events.
  const seriesUids = new Set(series.map((event) => event.uid));
  for (const [uid, list] of overrides) {
    if (seriesUids.has(uid)) continue;
    for (const override of list) {
      if (results.length >= limit) {
        truncated = true;
        break;
      }
      const occurrence = toOccurrence(override, override.start, calendar.timeZone);
      if (occurrence && overlapsWindow(occurrence, windowStartMs, windowEndMs)) {
        results.push(occurrence);
      }
    }
  }

  results.sort(compareEvents);

  return { events: results, truncated };
}

/** All-day first, then by start, then alphabetically so the order is stable. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.start !== b.start) return a.start - b.start;
  return a.title.localeCompare(b.title);
}

/* ------------------------------------------------------------------ */
/* One series                                                          */
/* ------------------------------------------------------------------ */

function expandSeries(
  event: IcsEvent,
  overrides: IcsEvent[],
  calendarZone: string | null,
  options: BuildOptions,
): BuildResult {
  // A cancelled series produces nothing, overrides included.
  if (event.status === "CANCELLED") return { events: [], truncated: false };

  const zone = resolveZone(event.start, calendarZone);

  // Occurrences the series explicitly does not have.
  const excluded = new Set(
    event.exdates.map((time) => civilToUtcMs(time.civil)),
  );

  // Occurrences replaced or deleted by a more specific record, keyed by the
  // civil time of the occurrence they name.
  const overrideByStart = new Map<number, IcsEvent>();
  for (const override of overrides) {
    if (!override.recurrenceId) continue;
    const key = civilToUtcMs(override.recurrenceId.civil);
    const existing = overrideByStart.get(key);
    // Higher SEQUENCE wins when a feed carries both an old and a new revision.
    if (!existing || override.sequence >= existing.sequence) {
      overrideByStart.set(key, override);
    }
  }

  const starts = occurrenceStarts(event, zone, options);

  const events: CalendarEvent[] = [];
  let truncated = starts.truncated;

  for (const civil of starts.civils) {
    if (events.length >= options.limit) {
      truncated = true;
      break;
    }

    const key = civilToUtcMs(civil);
    if (excluded.has(key)) continue;

    const override = overrideByStart.get(key);

    if (override) {
      if (override.status === "CANCELLED") continue;
      const moved = toOccurrence(override, override.start, calendarZone);
      if (moved && overlapsWindow(moved, options.windowStartMs, options.windowEndMs)) {
        events.push(moved);
      }
      continue;
    }

    const occurrence = toOccurrence(event, { ...event.start, civil }, calendarZone);
    if (occurrence && overlapsWindow(occurrence, options.windowStartMs, options.windowEndMs)) {
      events.push(occurrence);
    }
  }

  return { events, truncated };
}

/**
 * The civil start times this series occurs at, before exclusions.
 *
 * The recurrence window is expressed in the *event's* zone, so it is derived
 * from the requested instants rather than passed straight through.
 */
function occurrenceStarts(
  event: IcsEvent,
  zone: string | null,
  options: BuildOptions,
): { civils: Civil[]; truncated: boolean } {
  const extra = event.rdates.map((time) => time.civil);

  if (!event.rrule) {
    return { civils: [event.start.civil, ...extra], truncated: false };
  }

  const rule = parseRrule(event.rrule);

  const offsetAtStart = zone && zone !== "UTC"
    ? zoneOffsetMs(civilInZoneToInstant(event.start.civil, zone), zone)
    : 0;

  const windowStart = utcMsToCivil(options.windowStartMs + offsetAtStart);
  const windowEnd = utcMsToCivil(options.windowEndMs + offsetAtStart);

  const civils = expandRrule({
    start: event.start.civil,
    rule,
    windowStart,
    windowEnd,
    limit: options.limit,
    untilOffsetMs: offsetAtStart,
  });

  const truncated = civils.length >= options.limit;

  // RDATEs sit outside the rule and may land anywhere, including inside the
  // window when the rule's own occurrences do not.
  return { civils: [...civils, ...extra], truncated };
}

/* ------------------------------------------------------------------ */
/* One occurrence                                                      */
/* ------------------------------------------------------------------ */

/** Build a renderable occurrence from a record and the start it happens at. */
function toOccurrence(
  event: IcsEvent,
  start: IcsTime,
  calendarZone: string | null,
): CalendarEvent | null {
  if (event.status === "CANCELLED") return null;

  const title = event.summary || "Untitled event";
  const id = `${event.uid}:${start.kind}:${civilToUtcMs(start.civil)}`;

  if (start.kind === "date") {
    // DTEND on an all-day event is *exclusive*: a single day on the 4th is
    // written DTSTART 20260804 / DTEND 20260805. Subtracting a day gives the
    // last day someone would actually point at on a calendar.
    const startCivil = start.civil;

    let endCivil = addCivilDays(startCivil, 1);
    if (event.end?.kind === "date") {
      endCivil = event.end.civil;
    } else if (event.duration) {
      const durationMs = parseDurationMs(event.duration);
      if (durationMs && durationMs > 0) {
        endCivil = utcMsToCivil(civilToUtcMs(startCivil) + durationMs);
      }
    }

    const lastDay = utcMsToCivil(
      // Never let a malformed feed produce an end before the start.
      Math.max(civilToUtcMs(endCivil) - MS_PER_DAY, civilToUtcMs(startCivil)),
    );

    return {
      id,
      title,
      location: event.location,
      description: event.description,
      allDay: true,
      start: civilToUtcMs(startCivil),
      end: civilToUtcMs(endCivil),
      startDate: isoFromCivil(startCivil),
      endDate: isoFromCivil(lastDay),
    };
  }

  const zone = resolveZone(start, calendarZone);
  const startMs = toInstant(start.civil, zone);

  let endMs: number;
  if (event.end && event.end.kind === "dateTime") {
    const endZone = resolveZone(event.end, calendarZone);
    // The end is recomputed as start-plus-duration rather than taken
    // literally, because on an expanded occurrence the record's own DTEND
    // still describes the *first* occurrence.
    const seriesStartMs = toInstant(event.start.civil, resolveZone(event.start, calendarZone));
    const seriesEndMs = toInstant(event.end.civil, endZone);
    endMs = startMs + Math.max(seriesEndMs - seriesStartMs, 0);
  } else if (event.duration) {
    endMs = startMs + Math.max(parseDurationMs(event.duration) ?? 0, 0);
  } else {
    endMs = startMs;
  }

  return {
    id,
    title,
    location: event.location,
    description: event.description,
    allDay: false,
    start: startMs,
    end: endMs,
    startDate: null,
    endDate: null,
  };
}

/**
 * Which zone a time is in.
 *
 * `TZID` on the value wins; failing that the calendar's own `X-WR-TIMEZONE`;
 * failing that the time is floating and means local wherever it is read.
 */
function resolveZone(time: IcsTime, calendarZone: string | null): string | null {
  if (time.kind === "date") return null;
  return time.zone ?? calendarZone;
}

function toInstant(civil: Civil, zone: string | null): number {
  if (zone === "UTC") return civilToUtcMs(civil);
  if (zone) return civilInZoneToInstant(civil, zone);
  return civilInLocalZoneToInstant(civil);
}

function isoFromCivil(civil: Civil): string {
  const year = String(civil.year).padStart(4, "0");
  const month = String(civil.month).padStart(2, "0");
  const day = String(civil.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Whether an occurrence is worth keeping.
 *
 * A zero-length event (start === end, which Google emits for some imported
 * reminders) would fail a strict overlap test on its own start instant, hence
 * the `>=` on the trailing edge.
 */
function overlapsWindow(
  event: CalendarEvent,
  windowStartMs: number,
  windowEndMs: number,
): boolean {
  if (event.allDay) {
    // Compared as UTC-read dates on both sides, which is the frame all-day
    // events live in. A month of slack either side of the window absorbs the
    // difference between that and any real timezone.
    return event.start <= windowEndMs && event.end >= windowStartMs;
  }
  return event.start <= windowEndMs && event.end >= windowStartMs;
}

/* ------------------------------------------------------------------ */
/* Querying, for the views                                             */
/* ------------------------------------------------------------------ */

/**
 * The occurrences that touch a given local calendar day, in display order.
 *
 * `day` is a `Date` in the *device's* local zone, which is why this runs on
 * the client: the same occurrence list renders against Mountain Time on a
 * phone and would render against UTC on the server.
 */
export function eventsOnDay(
  events: readonly CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  const iso = toIsoDate(day);

  const dayStart = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const dayEnd = dayStart + MS_PER_DAY;

  return events
    .filter((event) => {
      if (event.allDay) {
        // String comparison on `YYYY-MM-DD` is chronological, and keeps
        // all-day events out of timezone arithmetic entirely.
        return (
          event.startDate !== null &&
          event.endDate !== null &&
          event.startDate <= iso &&
          event.endDate >= iso
        );
      }
      // A zero-length event still belongs to the day it starts on.
      if (event.start === event.end) {
        return event.start >= dayStart && event.start < dayEnd;
      }
      return event.start < dayEnd && event.end > dayStart;
    })
    .sort(compareEvents);
}

/**
 * A short slice of what is coming up, for the dashboard.
 *
 * The dashboard only needs enough events to name the next one, so sending it
 * the whole six-month window would be tens of kilobytes to render a badge four
 * words long. A day of slack on the leading edge covers the gap between the
 * server's clock (UTC on Vercel) and the device's, so an event that is still
 * "next" in Mountain Time is never trimmed off before the client sees it.
 */
export function upcomingEvents(
  events: readonly CalendarEvent[],
  nowMs: number,
  limit: number,
): CalendarEvent[] {
  const from = nowMs - MS_PER_DAY;
  return events
    .filter((event) => event.end >= from)
    .sort(compareEvents)
    .slice(0, limit);
}

/**
 * The next occurrence starting at or after `now`, for the dashboard card.
 *
 * An all-day event counts as "on" for the whole of its day rather than as
 * something that started at midnight, so today's field trip is still the next
 * thing at nine in the morning.
 */
export function nextEvent(
  events: readonly CalendarEvent[],
  now: Date,
): CalendarEvent | null {
  const todayIso = toIsoDate(now);
  const nowMs = now.getTime();

  let best: CalendarEvent | null = null;

  for (const event of events) {
    const upcoming = event.allDay
      ? event.endDate !== null && event.endDate >= todayIso
      : event.end > nowMs;

    if (!upcoming) continue;
    if (!best) {
      best = event;
      continue;
    }

    // All-day events sort ahead of timed ones on the same day, which is also
    // the order the day and week views draw them in.
    if (compareEventsForNext(event, best, todayIso) < 0) best = event;
  }

  return best;
}

function compareEventsForNext(
  a: CalendarEvent,
  b: CalendarEvent,
  todayIso: string,
): number {
  const dayOf = (event: CalendarEvent): string =>
    event.allDay && event.startDate ? maxIso(event.startDate, todayIso) : "";

  if (a.allDay && b.allDay) return dayOf(a).localeCompare(dayOf(b));
  return a.start - b.start;
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}
