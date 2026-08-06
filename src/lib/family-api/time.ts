/**
 * The family's clock, not the server's.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE HAS TO EXIST
 * ---------------------------------------------------------------------------
 * Every date helper in `src/lib/dates.ts` works in the *runtime's* local
 * timezone, which is correct for the app — those functions run in a browser,
 * on a phone, in Rexburg. This API has no browser. It runs on Vercel, where
 * the runtime's local timezone is UTC, and Rexburg is six or seven hours
 * behind that. Between 5pm and midnight Mountain Time, "today" on the server
 * is already tomorrow.
 *
 * Getting that wrong is not a rounding error. It would hand a child Tuesday's
 * chores on Monday evening, roll the pet rotation half a day early, and report
 * a birthday as "0 days away" the night before. So this module resolves the
 * civil date and time in `America/Boise` and hands the rest of the app a
 * *proxy* `Date`: an ordinary `Date` whose year, month and day fields read
 * back as Boise's, pinned to local noon.
 *
 * Noon is what makes the proxy safe. Every existing helper reads only
 * `getFullYear`/`getMonth`/`getDate`, and noon is at least eleven hours from
 * either midnight, so no daylight-saving shift and no runtime timezone can
 * move the proxy onto a different calendar day. Feeding one of these into
 * `startOfWeekMonday()` or `differenceInCalendarDays()` therefore gives the
 * answer Rexburg would give.
 *
 * The proxy's *instant* is meaningless and must never be formatted, compared
 * against `Date.now()`, or serialised. `generatedAt` in the response comes
 * from `toOffsetIso()` below, which is built from the real instant.
 *
 * ---------------------------------------------------------------------------
 * IT IS NO LONGER ONLY THE API'S
 * ---------------------------------------------------------------------------
 * The weekly report's two pages use it as well, for exactly the same reason:
 * they decide on the *server* which week has finished, and from Sunday teatime
 * onwards a UTC clock would already have published a report for a week that,
 * in Rexburg, has not ended. Any page that has to make a calendar decision
 * without a browser belongs here rather than reaching for `new Date()`.
 *
 * That makes the name slightly wrong — this is the family's clock and not the
 * family API's — and it stays put anyway, because moving it would touch every
 * import in the API for a filename. If a third caller turns up, move it to
 * `lib/family-time.ts` and leave a re-export behind.
 */

import { zoneOffsetMs } from "@/lib/calendar/civil";
import { parseLocalDate } from "@/lib/dates";

import { TIMEZONE } from "./config";

export type FamilyNow = {
  /** The real instant the request was served. */
  instant: Date;
  /** The IANA zone these fields were resolved in, e.g. `America/Boise`. */
  timezoneName: string;
  /** `YYYY-MM-DD` in America/Boise. */
  date: string;
  /** `HH:MM`, 24-hour, in America/Boise. */
  time: string;
  /** Minutes since midnight in America/Boise. Used for the wind-down check. */
  minutesSinceMidnight: number;
  /**
   * A `Date` whose local calendar fields are Boise's, at noon. Pass this — and
   * only this — to the helpers in `src/lib/dates.ts`.
   */
  civilNoon: Date;
};

const cachedFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = cachedFormatters.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  cachedFormatters.set(timeZone, formatter);
  return formatter;
}

/** Resolve the wall clock in `timeZone` at `instant`. */
export function familyNow(
  instant: Date = new Date(),
  timeZone: string = TIMEZONE,
): FamilyNow {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };

  const year = field("year");
  const month = field("month");
  const day = field("day");
  // Some ICU builds render midnight as "24" under `hour12: false`, which would
  // otherwise put the clock an hour past the end of the day. `civil.ts` has
  // the same guard for the same reason.
  const hour = field("hour") % 24;
  const minute = field("minute");

  return {
    instant,
    timezoneName: timeZone,
    date: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`,
    time: `${pad(hour, 2)}:${pad(minute, 2)}`,
    minutesSinceMidnight: hour * 60 + minute,
    civilNoon: new Date(year, month - 1, day, 12, 0, 0, 0),
  };
}

/**
 * An ISO 8601 timestamp carrying Boise's offset rather than `Z`.
 *
 * `2026-08-05T12:00:00-06:00` is the same instant as the `Z` form and reads as
 * the family's own clock, which is what the payload is describing. A model
 * asked "is that this afternoon?" should not have to do timezone arithmetic to
 * find out.
 */
export function toOffsetIso(instant: Date, timeZone: string = TIMEZONE): string {
  const offsetMs = zoneOffsetMs(instant.getTime(), timeZone);
  const shifted = new Date(instant.getTime() + offsetMs);

  const sign = offsetMs < 0 ? "-" : "+";
  const totalMinutes = Math.abs(Math.round(offsetMs / 60_000));

  return (
    `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1, 2)}-` +
    `${pad(shifted.getUTCDate(), 2)}T${pad(shifted.getUTCHours(), 2)}:` +
    `${pad(shifted.getUTCMinutes(), 2)}:${pad(shifted.getUTCSeconds(), 2)}` +
    `${sign}${pad(Math.floor(totalMinutes / 60), 2)}:${pad(totalMinutes % 60, 2)}`
  );
}

/* ------------------------------------------------------------------ */
/* Ages and birthdays                                                  */
/* ------------------------------------------------------------------ */

/**
 * Whole years from `birthDate` to `onDate`, both `YYYY-MM-DD`.
 *
 * Pure integer arithmetic on the three fields — no milliseconds, no leap-year
 * special case, no library. A child turns a year older on the morning of their
 * birthday and not the evening before, which is the only property that has
 * ever mattered here.
 *
 * Returns `null` for an unparseable birth date rather than a wrong number.
 * `docs/ai/10` is explicit that the model must be told an age rather than
 * derive one, so a missing age has to be *visibly* missing.
 */
export function calculateAge(birthDate: string, onDate: string): number | null {
  const birth = splitIsoDate(birthDate);
  const on = splitIsoDate(onDate);
  if (!birth || !on) return null;

  let age = on.year - birth.year;
  // Not yet had this year's birthday: the month is earlier, or it is the same
  // month and the day has not arrived.
  if (on.month < birth.month || (on.month === birth.month && on.day < birth.day)) {
    age -= 1;
  }

  return age < 0 ? null : age;
}

/**
 * Days from `fromDate` to the next occurrence of `--MM-DD`, inclusive of today.
 *
 * Returns `0` on the birthday itself. Crossing a year boundary is handled by
 * trying this year first and next year second, so 28 December to 5 January is
 * eight days rather than minus three hundred and fifty-seven.
 *
 * 29 February falls back to 1 March in a common year, which is the convention
 * this family uses out loud and the only one that keeps the reminder window
 * from silently skipping three years in four.
 */
export function daysUntilAnniversary(
  monthDay: { month: number; day: number },
  fromDate: string,
): { daysAway: number; date: string } | null {
  const from = splitIsoDate(fromDate);
  if (!from) return null;

  for (const year of [from.year, from.year + 1]) {
    const resolved = resolveInYear(monthDay, year);
    const days = daysBetweenIso(from, resolved);
    if (days >= 0) {
      return {
        daysAway: days,
        date: `${pad(resolved.year, 4)}-${pad(resolved.month, 2)}-${pad(resolved.day, 2)}`,
      };
    }
  }

  return null;
}

/** Parse `--MM-DD` (parents) or `YYYY-MM-DD` (children) into month and day. */
export function parseMonthDay(
  value: string,
): { month: number; day: number } | null {
  const partial = /^--(\d{2})-(\d{2})$/.exec(value.trim());
  if (partial) {
    return validMonthDay(Number(partial[1]), Number(partial[2]));
  }

  const full = splitIsoDate(value);
  if (full) return { month: full.month, day: full.day };

  return null;
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

type YearMonthDay = { year: number; month: number; day: number };

function splitIsoDate(value: unknown): YearMonthDay | null {
  if (typeof value !== "string") return null;
  // Reuses the app's parser so "2026-02-30" is rejected here exactly as it is
  // everywhere else, rather than silently rolling over to 2 March.
  const parsed = parseLocalDate(value);
  if (!parsed) return null;
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

function validMonthDay(
  month: number,
  day: number,
): { month: number; day: number } | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function resolveInYear(
  monthDay: { month: number; day: number },
  year: number,
): YearMonthDay {
  // 29 February in a common year: the anniversary is kept rather than skipped.
  if (monthDay.month === 2 && monthDay.day === 29 && !isLeapYear(year)) {
    return { year, month: 3, day: 1 };
  }
  return { year, month: monthDay.month, day: monthDay.day };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days between two civil dates.
 *
 * Both sides go through `Date.UTC`, which has no timezone and no daylight
 * saving in it at all, so this is exact integer division rather than the
 * noon-anchored rounding the app uses for `Date` objects.
 */
function daysBetweenIso(from: YearMonthDay, to: YearMonthDay): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / MS_PER_DAY);
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}
