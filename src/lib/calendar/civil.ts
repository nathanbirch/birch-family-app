/**
 * Civil (wall-clock) time, and turning it into an instant.
 *
 * ---------------------------------------------------------------------------
 * THE DISTINCTION THIS MODULE EXISTS TO MAINTAIN
 * ---------------------------------------------------------------------------
 * iCalendar has two genuinely different kinds of time, and conflating them is
 * where calendar bugs come from:
 *
 * - A **civil** time — "3pm on 4 August" — which is a reading on a wall, not a
 *   moment. It needs a timezone before it means anything.
 * - An **instant** — a point on the universal timeline, which we carry as
 *   milliseconds since the epoch.
 *
 * Repeating events repeat in *civil* time. "Piano every Tuesday at 3pm" stays
 * at 3pm across the daylight-saving change, even though the number of elapsed
 * hours between consecutive occurrences is 167 or 169 that week rather than
 * 168. So the recurrence machinery works entirely in civil time, and only at
 * the very end does each occurrence get converted to an instant.
 *
 * ---------------------------------------------------------------------------
 * NO TIMEZONE DATABASE
 * ---------------------------------------------------------------------------
 * `Intl.DateTimeFormat` already contains the full IANA database in every
 * runtime this app targets, which is why there is no `tzdata` dependency here.
 * `zoneOffsetMs` below is the standard way of interrogating it: format a known
 * instant *as* the target zone, read the civil fields back out, and the
 * difference between those and the instant is the offset that applied.
 */

/** A wall-clock reading. `month` is 1-12, unlike `Date`'s 0-11. */
export type Civil = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/**
 * A civil reading treated as though it were UTC.
 *
 * This is the carrier for all recurrence arithmetic. Because UTC has no
 * daylight saving, "add one day" is reliably "add 86,400,000ms" here — which
 * is exactly the property civil-time arithmetic needs and local time lacks.
 * Nothing outside this module should read the result as a real instant.
 */
export function civilToUtcMs(civil: Civil): number {
  return Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    civil.second,
  );
}

/** The inverse of `civilToUtcMs`. */
export function utcMsToCivil(ms: number): Civil {
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

/** Day of the week for a civil date. 0 = Sunday … 6 = Saturday. */
export function civilWeekday(civil: Civil): number {
  return new Date(civilToUtcMs(civil)).getUTCDay();
}

/** `civil` moved by whole days, keeping the time of day. */
export function addCivilDays(civil: Civil, days: number): Civil {
  return utcMsToCivil(civilToUtcMs(civil) + days * MS_PER_DAY);
}

/**
 * `civil` moved by whole months, keeping the day of the month *only if it
 * exists* in the target month.
 *
 * Returns `null` when it does not — 31 January plus one month is not 3 March,
 * and for recurrence purposes it is not anything at all. RFC 5545 is explicit
 * that a monthly rule simply skips months where the day does not exist, so a
 * `null` here is a legitimate answer rather than an error.
 */
export function addCivilMonths(civil: Civil, months: number): Civil | null {
  const zeroBased = civil.year * 12 + (civil.month - 1) + months;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  if (civil.day > daysInMonth(year, month)) return null;
  return { ...civil, year, month };
}

/** How many days the given month has. `month` is 1-12. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the *next* month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Whether two civil readings are the same moment on the wall. */
export function civilEquals(a: Civil, b: Civil): boolean {
  return civilToUtcMs(a) === civilToUtcMs(b);
}

/* ------------------------------------------------------------------ */
/* Zone conversion                                                     */
/* ------------------------------------------------------------------ */

/**
 * `Intl.DateTimeFormat` instances are expensive to build and this is called
 * once per occurrence, so they are made once per zone and kept.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    // An unknown zone id. Google writes real IANA ids, but a calendar synced
    // in from Outlook can carry a Windows zone name ("Mountain Standard
    // Time") that Intl rejects. Callers fall back to treating the time as
    // already-local rather than throwing a page away over it.
    return null;
  }

  formatterCache.set(timeZone, formatter);
  return formatter;
}

/**
 * The offset, in milliseconds, that `timeZone` was at the given instant.
 *
 * Positive east of Greenwich. `America/Boise` in August returns -6h.
 */
export function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const formatter = zoneFormatter(timeZone);
  if (!formatter) return 0;

  const parts = formatter.formatToParts(new Date(instantMs));
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };

  // `hour: "2-digit"` with `hour12: false` renders midnight as "24" in some
  // ICU versions rather than "00", which would push the date forward a day.
  const hour = field("hour") % 24;

  const asIfUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    hour,
    field("minute"),
    field("second"),
  );

  return asIfUtc - instantMs;
}

/**
 * The instant at which `civil` is the wall-clock reading in `timeZone`.
 *
 * This is a fixed-point problem: to know the offset you need the instant, and
 * to know the instant you need the offset. Two rounds converge everywhere,
 * because the second round's guess is already within an hour of the answer and
 * offsets are constant over any such hour except across a transition itself.
 *
 * The two ambiguous cases are the daylight-saving transitions:
 *
 * - **Spring forward.** 2:30am does not exist. The result lands on 3:30am,
 *   which is what every calendar application does and what a person means.
 * - **Fall back.** 1:30am happens twice. This resolves to the first, the
 *   pre-transition one, matching RFC 5545's guidance.
 *
 * Neither case can be "correct" in general, and a family calendar has nothing
 * scheduled at 2am, so this is the right amount of effort to spend on it.
 */
export function civilInZoneToInstant(civil: Civil, timeZone: string): number {
  const asIfUtc = civilToUtcMs(civil);

  let instant = asIfUtc - zoneOffsetMs(asIfUtc, timeZone);
  instant = asIfUtc - zoneOffsetMs(instant, timeZone);

  return instant;
}

/**
 * The instant for a civil reading in the *runtime's own* zone.
 *
 * Used for iCalendar's "floating" times, which carry no zone at all and are
 * defined to mean whatever the clock says wherever you are.
 */
export function civilInLocalZoneToInstant(civil: Civil): number {
  return new Date(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    civil.second,
    0,
  ).getTime();
}
