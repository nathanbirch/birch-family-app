/**
 * Motto-of-the-week maths. Pure functions only — nothing here touches React.
 *
 * Which motto is showing is derived entirely from the local calendar date and
 * the anchor in `config/motto.ts`. Nothing is stored and nothing is fetched,
 * so every phone in the family lands on the same motto on the same Monday with
 * nothing to keep in step — the same approach the seating rotation and the
 * mantra of the day both take.
 *
 * Weeks run Monday to Sunday, matching the seating rotation, so "this week" is
 * the same week everywhere in the app.
 */

import { MOTTOS, MOTTO_START_DATE, type Motto } from "@/config/motto";

import {
  addDays,
  differenceInCalendarDays,
  parseLocalDate,
  startOfWeekMonday,
} from "./dates";

/**
 * The configured anchor, parsed once at local noon and snapped to its Monday.
 *
 * A malformed anchor falls back to the current week rather than blanking the
 * home screen — but it throws in development, where a typo should be loud.
 */
export function getMottoStartDate(
  raw: string = MOTTO_START_DATE,
  now: Date = new Date(),
): Date {
  const parsed = parseLocalDate(raw);
  if (parsed) return startOfWeekMonday(parsed);

  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      `MOTTO_START_DATE ("${raw}") is not a valid YYYY-MM-DD date. ` +
        `Fix it in src/config/motto.ts.`,
    );
  }
  return startOfWeekMonday(now);
}

/**
 * Whole weeks from the anchor Monday to the Monday of `date`'s week.
 *
 * Negative before the anchor, and deliberately so: unlike the seating rotation
 * — which has a real "hasn't started yet" state to show — the motto simply
 * runs the cycle backwards, so a date before the anchor still gets a motto
 * instead of an empty banner.
 *
 * `Math.floor`, not integer division, so the negative side keeps stepping down
 * one week at a time rather than rounding toward zero and repeating a week.
 */
export function getMottoWeekOffset(date: Date, startDate: Date): number {
  const days = differenceInCalendarDays(
    startOfWeekMonday(startDate),
    startOfWeekMonday(date),
  );
  return Math.floor(days / 7);
}

/** Zero-based index into the motto list. Always in range. */
export function getMottoIndex(
  date: Date,
  startDate: Date = getMottoStartDate(),
  mottos: readonly Motto[] = MOTTOS,
): number {
  const offset = getMottoWeekOffset(date, startDate);
  return ((offset % mottos.length) + mottos.length) % mottos.length;
}

/** The motto for the week containing `date`. */
export function getMottoOfWeek(
  date: Date,
  startDate: Date = getMottoStartDate(),
  mottos: readonly Motto[] = MOTTOS,
): Motto {
  return mottos[getMottoIndex(date, startDate, mottos)];
}

export type MottoWeek = {
  motto: Motto;
  /** Monday of this motto's week, at local noon. */
  weekStart: Date;
  /** Sunday of this motto's week, at local noon. */
  weekEnd: Date;
  /** The Monday the motto next changes. */
  nextChange: Date;
  /** Whole days until `nextChange`. 1-7; never 0. */
  daysUntilChange: number;
  /** Friendly countdown copy, e.g. "New motto in 3 days". */
  countdownLabel: string;
  /** The motto that takes over on `nextChange`. */
  nextMotto: Motto;
};

/** Everything the banner needs, in one call. */
export function getMottoWeek(
  date: Date,
  startDate: Date = getMottoStartDate(),
  mottos: readonly Motto[] = MOTTOS,
): MottoWeek {
  const weekStart = startOfWeekMonday(date);
  const nextChange = addDays(weekStart, 7);
  const daysUntilChange = differenceInCalendarDays(date, nextChange);

  return {
    motto: getMottoOfWeek(date, startDate, mottos),
    weekStart,
    weekEnd: addDays(weekStart, 6),
    nextChange,
    daysUntilChange,
    countdownLabel: getMottoCountdownLabel(date, daysUntilChange),
    nextMotto: getMottoOfWeek(nextChange, startDate, mottos),
  };
}

/** Friendly, child-readable countdown copy. */
export function getMottoCountdownLabel(date: Date, daysUntil: number): string {
  // Monday itself: the motto changed this morning, so say that rather than
  // counting down the seven days to the next one.
  if (differenceInCalendarDays(startOfWeekMonday(date), date) === 0) {
    return "New motto today";
  }
  if (daysUntil <= 1) return "New motto tomorrow";
  return `New motto in ${daysUntil} days`;
}
