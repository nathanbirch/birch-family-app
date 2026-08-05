/**
 * Which week a star belongs to, and which day the rotation should be asked
 * about.
 *
 * Small enough to inline in three places and important enough not to: the page
 * renders a chart from one of these answers and the Server Action re-derives
 * the same answer to check what it is being asked to tick. If those two ever
 * disagreed, a chore handed over at the start of the month could be rendered
 * for one child and rejected for them a tap later.
 */

import {
  differenceInCalendarDays,
  parseLocalDate,
  startOfWeekMonday,
  toIsoDate,
} from "@/lib/dates";

/** The `YYYY-MM-DD` Monday that identifies the week containing `date`. */
export function getWeekStartIso(date: Date): string {
  return toIsoDate(startOfWeekMonday(date));
}

/**
 * Parse a stored week key. Rejects anything that is not a Monday, so a
 * hand-crafted request cannot create a second, offset set of documents for the
 * same seven days.
 */
export function parseWeekStart(value: string): Date | null {
  const date = parseLocalDate(value);
  if (!date) return null;
  return toIsoDate(startOfWeekMonday(date)) === toIsoDate(date) ? date : null;
}

/**
 * The date to ask the chore rotation about, for a given week.
 *
 * Chores change hands on the 1st and the chart's week runs Monday to Friday,
 * so a week can straddle two rotations. The rule is: if the week is the
 * current one, use today — the chart shows who has the chore *now*. For any
 * other week, use its Monday, so looking back at a past week is stable and
 * does not shift as the months go by.
 *
 * Whole *calendar days* decide that, not instants. Comparing the two dates
 * directly looked equivalent and was not: every date this app builds is
 * anchored at local noon, so a Sunday evening is later than "Sunday" and fell
 * outside its own week. It only ever mattered on the handful of Sundays that
 * end a month, and it would have shown the previous month's owner for an
 * evening — which is exactly the class of bug that never reproduces when you
 * go looking for it.
 */
export function referenceDateFor(weekStart: Date, now: Date): Date {
  const monday = startOfWeekMonday(weekStart);
  const offset = differenceInCalendarDays(monday, now);
  return offset >= 0 && offset <= 6 ? now : monday;
}
