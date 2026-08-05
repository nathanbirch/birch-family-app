/**
 * Expanding `RRULE` into individual occurrences.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * A feed does not contain "the piano lesson on 12 March". It contains one
 * event that says "starting 6 January, every Tuesday at 3pm", and the reader
 * is expected to work out the rest. Almost everything on a real family
 * calendar is a repeating event, so a calendar page that cannot do this shows
 * an almost empty screen.
 *
 * ---------------------------------------------------------------------------
 * HOW IT WORKS
 * ---------------------------------------------------------------------------
 * Expansion walks forward one *period* at a time, where a period is whatever
 * `FREQ` says — a day, a week, a month, a year. For each period it builds the
 * set of candidate dates that period could contribute, filters them through
 * the `BY…` rules, and emits whatever survives in order.
 *
 * All of it happens in civil (wall-clock) time, which is what makes "3pm every
 * Tuesday" stay at 3pm across the daylight-saving change. See `civil.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS SUPPORTED
 * ---------------------------------------------------------------------------
 * `FREQ` (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), `INTERVAL`, `COUNT`,
 * `UNTIL`, `BYDAY` including ordinals (`-1SU`), `BYMONTHDAY` including
 * negatives, `BYMONTH`, `BYSETPOS`, and `WKST`.
 *
 * Not supported, because Google Calendar's own UI cannot create them and they
 * have never appeared in this feed: `FREQ=SECONDLY`/`MINUTELY`/`HOURLY`,
 * `BYYEARDAY`, `BYWEEKNO`, `BYHOUR`, `BYMINUTE`, `BYSECOND`. An unsupported
 * `FREQ` yields no occurrences beyond the first rather than a wrong answer.
 */

import {
  addCivilDays,
  addCivilMonths,
  civilToUtcMs,
  civilWeekday,
  daysInMonth,
  utcMsToCivil,
  type Civil,
} from "./civil";

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** `BYDAY` entry: `MO`, or `-1SU` for "the last Sunday". */
export type ByDay = {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** `null` for a plain weekday; `2` = second, `-1` = last. */
  ordinal: number | null;
};

export type Rrule = {
  freq: Frequency | null;
  interval: number;
  count: number | null;
  /** Inclusive last moment, as civil time in the event's own zone. */
  until: Civil | null;
  /** Whether `UNTIL` was written as a UTC instant rather than a date. */
  untilIsUtc: boolean;
  byDay: ByDay[];
  byMonthDay: number[];
  byMonth: number[];
  bySetPos: number[];
  /** Which weekday a week starts on, for `WEEKLY` with `INTERVAL > 1`. */
  weekStart: number;
};

const WEEKDAY_CODES: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const FREQUENCIES = new Set<string>(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** Read an `RRULE` value such as `FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261231T065959Z`. */
export function parseRrule(value: string): Rrule {
  const rule: Rrule = {
    freq: null,
    interval: 1,
    count: null,
    until: null,
    untilIsUtc: false,
    byDay: [],
    byMonthDay: [],
    byMonth: [],
    bySetPos: [],
    weekStart: 1,
  };

  for (const part of value.split(";")) {
    const equals = part.indexOf("=");
    if (equals === -1) continue;

    const key = part.slice(0, equals).trim().toUpperCase();
    const raw = part.slice(equals + 1).trim();

    switch (key) {
      case "FREQ":
        if (FREQUENCIES.has(raw.toUpperCase())) {
          rule.freq = raw.toUpperCase() as Frequency;
        }
        break;
      case "INTERVAL": {
        const interval = Number.parseInt(raw, 10);
        // A zero or negative interval would never advance the cursor and would
        // spin until the safety cap. Treat it as the default.
        if (Number.isFinite(interval) && interval > 0) rule.interval = interval;
        break;
      }
      case "COUNT": {
        const count = Number.parseInt(raw, 10);
        if (Number.isFinite(count) && count > 0) rule.count = count;
        break;
      }
      case "UNTIL": {
        const until = parseUntil(raw);
        if (until) {
          rule.until = until.civil;
          rule.untilIsUtc = until.isUtc;
        }
        break;
      }
      case "BYDAY":
        rule.byDay = raw
          .split(",")
          .map(parseByDay)
          .filter((entry): entry is ByDay => entry !== null);
        break;
      case "BYMONTHDAY":
        rule.byMonthDay = parseIntList(raw).filter(
          (day) => day !== 0 && day >= -31 && day <= 31,
        );
        break;
      case "BYMONTH":
        rule.byMonth = parseIntList(raw).filter(
          (month) => month >= 1 && month <= 12,
        );
        break;
      case "BYSETPOS":
        rule.bySetPos = parseIntList(raw).filter((pos) => pos !== 0);
        break;
      case "WKST": {
        const weekday = WEEKDAY_CODES[raw.toUpperCase()];
        if (weekday !== undefined) rule.weekStart = weekday;
        break;
      }
      default:
        break;
    }
  }

  return rule;
}

function parseIntList(raw: string): number[] {
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value));
}

const BY_DAY = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/;

function parseByDay(raw: string): ByDay | null {
  const match = BY_DAY.exec(raw.trim().toUpperCase());
  if (!match) return null;
  return {
    weekday: WEEKDAY_CODES[match[2]],
    ordinal: match[1] ? Number.parseInt(match[1], 10) : null,
  };
}

const UNTIL_DATE = /^(\d{4})(\d{2})(\d{2})$/;
const UNTIL_DATE_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

function parseUntil(raw: string): { civil: Civil; isUtc: boolean } | null {
  const dateMatch = UNTIL_DATE.exec(raw);
  if (dateMatch) {
    return {
      civil: {
        year: Number(dateMatch[1]),
        month: Number(dateMatch[2]),
        day: Number(dateMatch[3]),
        // A date-only UNTIL is inclusive of the whole day.
        hour: 23,
        minute: 59,
        second: 59,
      },
      isUtc: false,
    };
  }

  const timeMatch = UNTIL_DATE_TIME.exec(raw);
  if (!timeMatch) return null;

  return {
    civil: {
      year: Number(timeMatch[1]),
      month: Number(timeMatch[2]),
      day: Number(timeMatch[3]),
      hour: Number(timeMatch[4]),
      minute: Number(timeMatch[5]),
      second: Number(timeMatch[6]),
    },
    isUtc: timeMatch[7] === "Z",
  };
}

/* ------------------------------------------------------------------ */
/* Expansion                                                           */
/* ------------------------------------------------------------------ */

export type ExpandOptions = {
  /** The series' `DTSTART`, in civil time. Always the first occurrence. */
  start: Civil;
  rule: Rrule;
  /** Occurrences before this civil time are computed but not returned. */
  windowStart: Civil;
  /** Expansion stops once it passes this civil time. */
  windowEnd: Civil;
  /** Hard ceiling on returned occurrences. */
  limit: number;
  /**
   * How many milliseconds of clock skew to allow when comparing a `UNTIL`
   * written in UTC against civil time in the event's own zone. See
   * `withinUntil` below.
   */
  untilOffsetMs?: number;
};

/**
 * Every occurrence of the series that falls inside the window, in order.
 *
 * The returned times are the occurrences' *start* readings, in the same civil
 * frame as `start`. Turning them into instants is the caller's job, because
 * only the caller knows the event's timezone.
 */
export function expandRrule(options: ExpandOptions): Civil[] {
  const { start, rule, windowStart, windowEnd, limit } = options;

  const startMs = civilToUtcMs(start);
  const windowStartMs = civilToUtcMs(windowStart);
  const windowEndMs = civilToUtcMs(windowEnd);

  const results: Civil[] = [];

  // DTSTART is always the first occurrence, whether or not it satisfies the
  // BY… rules. RFC 5545 §3.8.5.3 is explicit about this, and Google relies on
  // it: "every Tuesday" written on a Wednesday still happens that Wednesday.
  let emitted = 0;
  if (withinUntil(start, rule, options.untilOffsetMs ?? 0)) {
    emitted += 1;
    if (startMs >= windowStartMs && startMs <= windowEndMs) {
      results.push(start);
    }
  }

  // An unsupported or absent FREQ means there is nothing to walk forward.
  if (!rule.freq) return results;

  /*
   * A backstop against a rule that never terminates — nothing more.
   *
   * The walk normally ends on its own: it breaks as soon as a period starts
   * past the window, and `INTERVAL` is forced to at least 1 so the cursor
   * always advances. This only catches the pathological case.
   *
   * It has to be generous, because the walk begins at DTSTART and a long-lived
   * series has to be stepped through to reach the window. At 2000 a daily
   * event started more than five and a half years ago would run out of periods
   * before arriving, and — like the period-0 bug above — would simply not
   * appear, with nothing logged. 20,000 covers a daily series running since
   * the 1970s, and costs nothing on a feed that terminates normally.
   */
  const maxPeriods = 20_000;

  /*
   * Period 0 is DTSTART's *own* week, month or year, and it is not optional.
   *
   * A rule can name several days per period — "every Mon, Tue, Wed, Thu",
   * "the 1st and the 15th" — and the ones falling after DTSTART within its own
   * period are genuine occurrences. Starting the walk at period 1 skips them:
   * a babysitting series beginning Monday with BYDAY=MO,TU,WE,TH emitted
   * Monday and then jumped a week, silently losing that Tuesday, Wednesday and
   * Thursday. Nothing errored — three real events simply were not there.
   *
   * Re-emitting DTSTART is not a risk: it was emitted above, and the
   * `candidateMs <= startMs` guard below drops it along with anything else in
   * the period that precedes it.
   */
  let period = 0;
  while (period <= maxPeriods) {
    if (rule.count !== null && emitted >= rule.count) break;
    if (results.length >= limit) break;

    const periodStart = advancePeriod(start, rule, period);
    period += 1;

    // A monthly rule can skip a period entirely (31st of a 30-day month).
    if (!periodStart) continue;

    // Past the far edge of the window with nothing left that could fall inside
    // it. Compared at the period's start so a month whose first day is beyond
    // the window cannot contribute.
    if (civilToUtcMs(periodStart) > windowEndMs) break;

    const candidates = candidatesForPeriod(periodStart, start, rule);

    for (const candidate of candidates) {
      if (rule.count !== null && emitted >= rule.count) break;

      const candidateMs = civilToUtcMs(candidate);

      // Candidates before DTSTART are not occurrences. This happens routinely:
      // a weekly rule with BYDAY=MO,WE starting on a Wednesday generates that
      // week's Monday, which is two days before the series began.
      if (candidateMs <= startMs) continue;
      if (!withinUntil(candidate, rule, options.untilOffsetMs ?? 0)) {
        // UNTIL is monotonic, so nothing later can qualify either.
        return results;
      }

      emitted += 1;

      if (candidateMs >= windowStartMs && candidateMs <= windowEndMs) {
        results.push(candidate);
        if (results.length >= limit) return results;
      }
    }
  }

  return results;
}

/**
 * Whether an occurrence falls on or before `UNTIL`.
 *
 * `UNTIL` is written as a UTC instant while occurrences are civil times in the
 * event's own zone, so the two are not directly comparable. `untilOffsetMs` is
 * the zone's offset, which the caller knows and this module does not; shifting
 * the occurrence by it puts both sides in the same frame.
 *
 * Getting this slightly wrong costs at most one occurrence at the very end of
 * a finite series, which is why an offset taken at the series' start is close
 * enough even if the series crosses a daylight-saving boundary.
 */
function withinUntil(civil: Civil, rule: Rrule, untilOffsetMs: number): boolean {
  if (!rule.until) return true;

  const occurrenceMs =
    civilToUtcMs(civil) - (rule.untilIsUtc ? untilOffsetMs : 0);

  return occurrenceMs <= civilToUtcMs(rule.until);
}

/** The civil date that period `index` of the rule begins on. */
function advancePeriod(start: Civil, rule: Rrule, index: number): Civil | null {
  const step = index * rule.interval;

  switch (rule.freq) {
    case "DAILY":
      return addCivilDays(start, step);

    case "WEEKLY":
      // Weeks advance from the start of the week DTSTART falls in, so that
      // "every other week" means alternating whole weeks rather than
      // alternating 14-day blocks offset by whatever day it began on.
      return addCivilDays(startOfWeek(start, rule.weekStart), step * 7);

    case "MONTHLY": {
      // Anchored to the 1st: the period is the whole month, and which days in
      // it qualify is decided by the BY… rules, not by DTSTART's day number.
      const anchor: Civil = { ...start, day: 1 };
      return addCivilMonths(anchor, step);
    }

    case "YEARLY": {
      const anchor: Civil = { ...start, month: 1, day: 1 };
      return addCivilMonths(anchor, step * 12);
    }

    default:
      return null;
  }
}

/** The `weekStart`-aligned start of the week containing `civil`. */
function startOfWeek(civil: Civil, weekStart: number): Civil {
  const offset = (civilWeekday(civil) - weekStart + 7) % 7;
  return addCivilDays(civil, -offset);
}

/**
 * Every date the given period could contribute, before `BYSETPOS`.
 *
 * Always returned in ascending order, which is what makes `BYSETPOS` — "the
 * 1st and last matching day of the month" — meaningful.
 */
function candidatesForPeriod(
  periodStart: Civil,
  start: Civil,
  rule: Rrule,
): Civil[] {
  let candidates: Civil[];

  switch (rule.freq) {
    case "DAILY":
      candidates = [periodStart];
      break;

    case "WEEKLY": {
      const weekdays =
        rule.byDay.length > 0
          ? rule.byDay.map((entry) => entry.weekday)
          : [civilWeekday(start)];

      candidates = [];
      for (let offset = 0; offset < 7; offset += 1) {
        const day = addCivilDays(periodStart, offset);
        if (weekdays.includes(civilWeekday(day))) candidates.push(day);
      }
      break;
    }

    case "MONTHLY":
      candidates = monthCandidates(periodStart, start, rule);
      break;

    case "YEARLY": {
      // BYMONTH picks the months; each is then filled in exactly as a monthly
      // rule would fill it. With no BYMONTH, the anniversary month is used.
      const months =
        rule.byMonth.length > 0 ? [...rule.byMonth].sort((a, b) => a - b) : [start.month];

      candidates = [];
      for (const month of months) {
        const monthStart: Civil = { ...periodStart, month, day: 1 };
        candidates.push(...monthCandidates(monthStart, start, rule));
      }
      break;
    }

    default:
      candidates = [];
  }

  // BYMONTH also acts as a filter on non-yearly rules.
  if (rule.byMonth.length > 0 && rule.freq !== "YEARLY") {
    candidates = candidates.filter((day) => rule.byMonth.includes(day.month));
  }

  // On daily and weekly rules, a plain BYDAY narrows rather than generates.
  if (rule.freq === "DAILY" && rule.byDay.length > 0) {
    const weekdays = rule.byDay.map((entry) => entry.weekday);
    candidates = candidates.filter((day) => weekdays.includes(civilWeekday(day)));
  }

  if (rule.byMonthDay.length > 0 && rule.freq !== "MONTHLY" && rule.freq !== "YEARLY") {
    candidates = candidates.filter((day) => matchesMonthDay(day, rule.byMonthDay));
  }

  candidates.sort((a, b) => civilToUtcMs(a) - civilToUtcMs(b));

  return applySetPos(candidates, rule.bySetPos);
}

/**
 * The qualifying days within one month.
 *
 * `BYDAY` with an ordinal ("the 2nd Tuesday") and `BYMONTHDAY` ("the 15th")
 * both select from the month. When both are present they intersect, which is
 * how "Friday the 13th" is expressed.
 */
function monthCandidates(monthStart: Civil, start: Civil, rule: Rrule): Civil[] {
  const { year, month } = monthStart;
  const length = daysInMonth(year, month);

  const allDays: Civil[] = [];
  for (let day = 1; day <= length; day += 1) {
    allDays.push({ ...start, year, month, day });
  }

  const hasByDay = rule.byDay.length > 0;
  const hasByMonthDay = rule.byMonthDay.length > 0;

  // Neither rule present: the day-of-month DTSTART fell on. Absent from short
  // months, which is the documented behaviour rather than a clamp to the 28th.
  if (!hasByDay && !hasByMonthDay) {
    return start.day <= length ? [{ ...start, year, month }] : [];
  }

  let days = allDays;

  if (hasByMonthDay) {
    days = days.filter((day) => matchesMonthDay(day, rule.byMonthDay));
  }

  if (hasByDay) {
    days = days.filter((day) => matchesByDay(day, rule.byDay, length));
  }

  return days;
}

/** `BYMONTHDAY`, where a negative counts back from the end of the month. */
function matchesMonthDay(civil: Civil, byMonthDay: number[]): boolean {
  const length = daysInMonth(civil.year, civil.month);
  return byMonthDay.some((entry) =>
    entry > 0 ? entry === civil.day : length + entry + 1 === civil.day,
  );
}

/** `BYDAY`, honouring an ordinal prefix within the month. */
function matchesByDay(civil: Civil, byDay: ByDay[], monthLength: number): boolean {
  const weekday = civilWeekday(civil);

  return byDay.some((entry) => {
    if (entry.weekday !== weekday) return false;
    if (entry.ordinal === null) return true;

    if (entry.ordinal > 0) {
      // The 1st Tuesday is the one on days 1-7, the 2nd on days 8-14, and so on.
      const nth = Math.floor((civil.day - 1) / 7) + 1;
      return nth === entry.ordinal;
    }

    // -1 is the last such weekday, -2 the one before it.
    const fromEnd = Math.floor((monthLength - civil.day) / 7) + 1;
    return fromEnd === -entry.ordinal;
  });
}

/** `BYSETPOS` picks positions out of the period's candidate list. */
function applySetPos(candidates: Civil[], bySetPos: number[]): Civil[] {
  if (bySetPos.length === 0) return candidates;

  const picked = new Set<number>();
  for (const position of bySetPos) {
    const index = position > 0 ? position - 1 : candidates.length + position;
    if (index >= 0 && index < candidates.length) picked.add(index);
  }

  return [...picked].sort((a, b) => a - b).map((index) => candidates[index]);
}

/** Convenience for tests and callers: a civil time from an epoch reading. */
export { utcMsToCivil, civilToUtcMs };
