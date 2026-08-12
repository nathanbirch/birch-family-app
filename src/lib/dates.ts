/**
 * Local-calendar date helpers.
 *
 * Everything here works in the device's local timezone. Elapsed days are
 * counted by normalising both dates to *local noon* first, which makes the
 * arithmetic immune to daylight-saving transitions: a DST day is 23 or 25
 * hours long, but noon-to-noon is always within 11-13 hours of a multiple of
 * 24, so rounding lands on the right whole number of days.
 *
 * No date library — `Intl.DateTimeFormat` and the built-in `Date` are enough.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Matches a plain `YYYY-MM-DD` calendar date. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a `YYYY-MM-DD` string as a *local* date at noon.
 *
 * `new Date("2026-08-03")` would be parsed as UTC midnight, which is the
 * previous evening in the Americas — exactly the bug this avoids.
 */
export function parseLocalDate(value: string): Date | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  // Rejects impossible dates that JS would silently roll over (e.g. Feb 30).
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** A copy of `date` set to local noon, discarding the time of day. */
export function atLocalNoon(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0,
  );
}

/**
 * Whole calendar days from `from` to `to`. Negative when `to` is earlier.
 * DST-safe (see the module comment).
 */
export function differenceInCalendarDays(from: Date, to: Date): number {
  const start = atLocalNoon(from).getTime();
  const end = atLocalNoon(to).getTime();
  return Math.round((end - start) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  const next = atLocalNoon(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The Monday of the local calendar week containing `date`.
 * Weeks run Monday 00:00 through Sunday 23:59 local time.
 */
export function startOfWeekMonday(date: Date): Date {
  const noon = atLocalNoon(date);
  // getDay(): 0 = Sunday ... 6 = Saturday. Sunday belongs to the week that
  // started six days earlier, not the one starting tomorrow.
  const offset = (noon.getDay() + 6) % 7;
  return addDays(noon, -offset);
}

/**
 * Whole weeks from `from` to `to`, counted between the Mondays their weeks
 * begin on. Negative when `to` is in an earlier week.
 *
 * The day of the week is therefore ignored entirely, exactly as
 * `differenceInCalendarMonths` ignores the day of the month: Sunday to the
 * next Monday is one week, and Monday to the following Sunday is nought. That
 * is what "the chores change hands on Monday morning" needs it to mean.
 */
export function differenceInCalendarWeeks(from: Date, to: Date): number {
  const start = startOfWeekMonday(from);
  const end = startOfWeekMonday(to);
  return Math.round(differenceInCalendarDays(start, end) / 7);
}

/** The Monday that starts the *next* week after `date`, at local noon. */
export function startOfNextWeekMonday(date: Date): Date {
  return addDays(startOfWeekMonday(date), 7);
}

/* ------------------------------------------------------------------ */
/* Months                                                              */
/* ------------------------------------------------------------------ */

/** Matches a plain `YYYY-MM` calendar month. */
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

/**
 * Parse a `YYYY-MM` string as the first of that month, at local noon.
 *
 * Months are counted, never subtracted as milliseconds, so nothing here cares
 * that months are 28-31 days long.
 */
export function parseLocalMonth(value: string): Date | null {
  const match = ISO_MONTH.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  return new Date(year, month - 1, 1, 12, 0, 0, 0);
}

/**
 * Whole calendar months from `from` to `to`. Negative when `to` is earlier.
 *
 * Purely (year, month) arithmetic — the day of the month is ignored entirely,
 * so the 31st of January to the 1st of February is one month, which is what
 * "the rotation changes on the 1st" needs it to mean.
 */
export function differenceInCalendarMonths(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  );
}

/** The first of the *next* month after `date`, at local noon. */
export function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 12, 0, 0, 0);
}

/** e.g. "August 2026". */
export function formatMonthYear(date: Date): string {
  return format(date, { month: "long", year: "numeric" });
}

/** The next local midnight after `date`, used to schedule the day-change tick. */
export function nextLocalMidnight(date: Date): Date {
  const next = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return next;
}

/** `true` when both dates fall on the same local calendar day. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function format(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

/** e.g. "Monday, August 3". */
export function formatLongDate(date: Date): string {
  return format(date, { weekday: "long", month: "long", day: "numeric" });
}

/** e.g. "Mon, Aug 3, 2026". */
export function formatMediumDate(date: Date): string {
  return format(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * A compact range, e.g. "Aug 3 – Aug 9" or "Dec 28 – Jan 3".
 *
 * Deliberately built from two `format()` calls rather than `formatRange()`:
 * Node and browsers disagree about the separator `formatRange` produces (a
 * thin space around the dash in some ICU builds, a normal space in others),
 * which shows up as a React hydration mismatch. Composing it ourselves keeps
 * the server and client output byte-identical.
 */
export function formatDateRange(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

/** Machine-readable `YYYY-MM-DD` for `<time dateTime>`. */
export function toIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
