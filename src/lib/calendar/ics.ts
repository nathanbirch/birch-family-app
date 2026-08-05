/**
 * An iCalendar (RFC 5545) reader, scoped to what Google Calendar emits.
 *
 * This is deliberately not a general iCalendar implementation. It reads the
 * `VEVENT` records out of a Google `.ics` feed and hands back plain data; the
 * turning of that data into occurrences on a calendar grid happens in
 * `recurrence.ts` and `events.ts`.
 *
 * What it does not do, because Google's feeds do not contain it: `VTODO`,
 * `VJOURNAL`, `VFREEBUSY`, alarms, attendees, or `VTIMEZONE` definitions. That
 * last one is worth being explicit about — a `VTIMEZONE` block spells out a
 * zone's daylight-saving rules inline, and this reader skips them, relying on
 * the `TZID` naming a real IANA zone that `Intl` already knows. Google always
 * uses IANA ids, so the inline rules are redundant.
 *
 * Nothing here throws on bad input. A feed is remote data that arrives however
 * it arrives, and one malformed event should cost you that event, not the
 * page: unparseable records are dropped and the rest are returned.
 */

import type { Civil } from "./civil";

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

/**
 * A `DTSTART`/`DTEND`/`EXDATE` value, in one of iCalendar's three flavours.
 *
 * - `date` — an all-day event. `20260804` means the 4th of August *wherever
 *   you are*; it is a calendar square, not a moment, and must never be
 *   converted through a timezone.
 * - `dateTime` with a `zone` — `TZID=America/Boise:20260804T150000`.
 * - `dateTime` with `zone: null` — either a UTC time (`…Z`, recorded as the
 *   zone `"UTC"`) or a floating one with no zone at all.
 */
export type IcsTime =
  | { kind: "date"; civil: Civil }
  | { kind: "dateTime"; civil: Civil; zone: string | null };

export type IcsEvent = {
  uid: string;
  /** Higher wins when two records describe the same occurrence. */
  sequence: number;
  summary: string;
  description: string | null;
  location: string | null;
  /** `CONFIRMED` | `TENTATIVE` | `CANCELLED`, upper-cased. */
  status: string | null;
  start: IcsTime;
  /** Absent on events that carry a `DURATION`, or a zero-length reminder. */
  end: IcsTime | null;
  /** ISO 8601 duration, e.g. `PT1H30M`. Used only when `end` is absent. */
  duration: string | null;
  /** The raw `RRULE` value, unparsed. */
  rrule: string | null;
  /** Dates lifted out of a repeating series. */
  exdates: IcsTime[];
  /** Extra one-off dates added to a series. */
  rdates: IcsTime[];
  /**
   * Set when this record *overrides* one occurrence of a repeating series —
   * "the 12 March piano lesson, moved to 4pm". It shares its `uid` with the
   * series and names the occurrence it replaces.
   */
  recurrenceId: IcsTime | null;
};

export type IcsCalendar = {
  /** `X-WR-CALNAME` — the calendar's display name, when Google sends one. */
  name: string | null;
  /** `X-WR-TIMEZONE` — the calendar's default zone. */
  timeZone: string | null;
  events: IcsEvent[];
};

/* ------------------------------------------------------------------ */
/* Lexing                                                              */
/* ------------------------------------------------------------------ */

/**
 * Undo line folding.
 *
 * iCalendar wraps long lines at 75 octets and marks the continuation with a
 * leading space or tab. A `SUMMARY` of any length arrives in pieces, and
 * joining them back together has to happen before anything else is read.
 *
 * Feeds in the wild use CRLF, LF, or occasionally a stray CR, so all three are
 * accepted as line breaks.
 */
export function unfoldLines(text: string): string[] {
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];

  for (const raw of rawLines) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }

  return lines.filter((line) => line.length > 0);
}

export type ContentLine = {
  name: string;
  params: Map<string, string>;
  value: string;
};

/**
 * Split one unfolded line into `NAME;PARAM=VALUE:value`.
 *
 * The parameter section is scanned character by character rather than split on
 * `:` and `;`, because both characters are legal inside a quoted parameter
 * value — `TZID="GMT+05:30"` is the case that breaks a naive `split(":")`.
 */
export function parseContentLine(line: string): ContentLine | null {
  let index = 0;
  let quoted = false;
  let colonAt = -1;

  while (index < line.length) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ":" && !quoted) {
      colonAt = index;
      break;
    }
    index += 1;
  }

  if (colonAt === -1) return null;

  const head = line.slice(0, colonAt);
  const value = line.slice(colonAt + 1);

  const segments = splitUnquoted(head, ";");
  const name = segments[0]?.trim().toUpperCase();
  if (!name) return null;

  const params = new Map<string, string>();
  for (const segment of segments.slice(1)) {
    const equals = segment.indexOf("=");
    if (equals === -1) continue;
    const key = segment.slice(0, equals).trim().toUpperCase();
    const raw = segment.slice(equals + 1).trim();
    params.set(key, raw.replace(/^"(.*)"$/, "$1"));
  }

  return { name, params, value };
}

/** `split`, but ignoring separators inside double quotes. */
function splitUnquoted(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of text) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
    } else if (char === separator && !quoted) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  parts.push(current);
  return parts;
}

/**
 * Undo iCalendar's text escaping.
 *
 * `\n` is a line break, and `\\`, `\,` and `\;` are the literal characters.
 * Order matters: unescaping the backslash first would turn `\\n` (a literal
 * backslash followed by an "n") into a newline.
 */
export function unescapeText(value: string): string {
  let result = "";
  let index = 0;

  while (index < value.length) {
    const char = value[index];
    if (char === "\\" && index + 1 < value.length) {
      const next = value[index + 1];
      if (next === "n" || next === "N") result += "\n";
      else if (next === "\\" || next === "," || next === ";") result += next;
      else result += next;
      index += 2;
      continue;
    }
    result += char;
    index += 1;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Times                                                               */
/* ------------------------------------------------------------------ */

const DATE_ONLY = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

/**
 * Read one `DATE` or `DATE-TIME` value, using the line's parameters to decide
 * which it is and which zone it is in.
 */
export function parseIcsTime(
  value: string,
  params: Map<string, string>,
): IcsTime | null {
  const text = value.trim();

  const dateMatch = DATE_ONLY.exec(text);
  if (dateMatch) {
    return {
      kind: "date",
      civil: {
        year: Number(dateMatch[1]),
        month: Number(dateMatch[2]),
        day: Number(dateMatch[3]),
        hour: 0,
        minute: 0,
        second: 0,
      },
    };
  }

  const timeMatch = DATE_TIME.exec(text);
  if (!timeMatch) return null;

  const civil: Civil = {
    year: Number(timeMatch[1]),
    month: Number(timeMatch[2]),
    day: Number(timeMatch[3]),
    hour: Number(timeMatch[4]),
    minute: Number(timeMatch[5]),
    second: Number(timeMatch[6]),
  };

  // A trailing Z is UTC and outranks any TZID, which should not be present.
  if (timeMatch[7] === "Z") return { kind: "dateTime", civil, zone: "UTC" };

  const tzid = params.get("TZID");
  return { kind: "dateTime", civil, zone: tzid ?? null };
}

/** `EXDATE` and `RDATE` may carry several comma-separated values on one line. */
function parseIcsTimeList(
  value: string,
  params: Map<string, string>,
): IcsTime[] {
  return value
    .split(",")
    .map((part) => parseIcsTime(part, params))
    .filter((time): time is IcsTime => time !== null);
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Read a whole `.ics` document.
 *
 * Nested components inside a `VEVENT` — `VALARM`, in practice — are tracked
 * with a depth counter and skipped, so a reminder's own `TRIGGER` and
 * `DESCRIPTION` cannot be mistaken for the event's.
 */
export function parseIcs(text: string): IcsCalendar {
  const calendar: IcsCalendar = { name: null, timeZone: null, events: [] };

  let current: Partial<IcsEvent> & { exdates: IcsTime[]; rdates: IcsTime[] } = {
    exdates: [],
    rdates: [],
  };
  let inEvent = false;
  let nestedDepth = 0;

  for (const line of unfoldLines(text)) {
    const parsed = parseContentLine(line);
    if (!parsed) continue;

    const { name, params, value } = parsed;

    if (name === "BEGIN") {
      const component = value.trim().toUpperCase();
      if (component === "VEVENT") {
        inEvent = true;
        nestedDepth = 0;
        current = { exdates: [], rdates: [] };
      } else if (inEvent) {
        nestedDepth += 1;
      }
      continue;
    }

    if (name === "END") {
      const component = value.trim().toUpperCase();
      if (component === "VEVENT" && inEvent) {
        const event = finaliseEvent(current);
        if (event) calendar.events.push(event);
        inEvent = false;
        nestedDepth = 0;
      } else if (inEvent && nestedDepth > 0) {
        nestedDepth -= 1;
      }
      continue;
    }

    if (!inEvent) {
      if (name === "X-WR-CALNAME") calendar.name = unescapeText(value).trim();
      if (name === "X-WR-TIMEZONE") calendar.timeZone = value.trim();
      continue;
    }

    // Inside a VALARM or other sub-component: not ours.
    if (nestedDepth > 0) continue;

    switch (name) {
      case "UID":
        current.uid = value.trim();
        break;
      case "SEQUENCE":
        current.sequence = Number.parseInt(value.trim(), 10) || 0;
        break;
      case "SUMMARY":
        current.summary = unescapeText(value).trim();
        break;
      case "DESCRIPTION":
        current.description = unescapeText(value).trim() || null;
        break;
      case "LOCATION":
        current.location = unescapeText(value).trim() || null;
        break;
      case "STATUS":
        current.status = value.trim().toUpperCase();
        break;
      case "DTSTART":
        current.start = parseIcsTime(value, params) ?? undefined;
        break;
      case "DTEND":
        current.end = parseIcsTime(value, params) ?? undefined;
        break;
      case "DURATION":
        current.duration = value.trim();
        break;
      case "RRULE":
        current.rrule = value.trim();
        break;
      case "RECURRENCE-ID":
        current.recurrenceId = parseIcsTime(value, params) ?? undefined;
        break;
      case "EXDATE":
        current.exdates.push(...parseIcsTimeList(value, params));
        break;
      case "RDATE":
        current.rdates.push(...parseIcsTimeList(value, params));
        break;
      default:
        break;
    }
  }

  return calendar;
}

/** An event without a start is not an event; everything else has a default. */
function finaliseEvent(
  draft: Partial<IcsEvent> & { exdates: IcsTime[]; rdates: IcsTime[] },
): IcsEvent | null {
  if (!draft.start) return null;

  return {
    // A feed with no UID still renders; the fallback only has to be stable
    // enough to key React lists and match overrides, and no override can
    // exist for an event that never had an id.
    uid: draft.uid ?? `${draft.summary ?? "event"}-${draft.start.civil.year}`,
    sequence: draft.sequence ?? 0,
    summary: draft.summary || "Untitled event",
    description: draft.description ?? null,
    location: draft.location ?? null,
    status: draft.status ?? null,
    start: draft.start,
    end: draft.end ?? null,
    duration: draft.duration ?? null,
    rrule: draft.rrule ?? null,
    exdates: draft.exdates,
    rdates: draft.rdates,
    recurrenceId: draft.recurrenceId ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Durations                                                           */
/* ------------------------------------------------------------------ */

const DURATION = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * An ISO 8601 duration in milliseconds, or `null` if it is not one.
 *
 * Only used for events that carry `DURATION` instead of `DTEND`, which Google
 * emits for some imported events.
 */
export function parseDurationMs(value: string): number | null {
  const match = DURATION.exec(value.trim().toUpperCase());
  if (!match) return null;

  const sign = match[1] === "-" ? -1 : 1;
  const weeks = Number(match[2] ?? 0);
  const days = Number(match[3] ?? 0);
  const hours = Number(match[4] ?? 0);
  const minutes = Number(match[5] ?? 0);
  const seconds = Number(match[6] ?? 0);

  const total =
    weeks * 7 * 86400 + days * 86400 + hours * 3600 + minutes * 60 + seconds;

  return sign * total * 1000;
}
