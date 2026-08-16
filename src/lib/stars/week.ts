/**
 * Which week a star belongs to, and which day of it may be coloured in.
 *
 * Small enough to inline in three places and important enough not to: the page
 * renders a chart from these answers and the Server Action re-derives the same
 * answers to check what it is being asked to tick. If those two ever
 * disagreed, a star could be drawn as tappable and then refused a tap later.
 */

import { starDayCount } from "@/config/stars";
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
 * Which column of a week may be coloured in right now, or -1 for none.
 *
 * ---------------------------------------------------------------------------
 * ONLY TODAY, AND ONLY TODAY
 * ---------------------------------------------------------------------------
 * A star is a record of a day, and a chart you can fill in whenever you like
 * is not a record of anything. Two things were happening on the paper chart
 * and both of them are now impossible here:
 *
 *   **Ahead.** Friday's column coloured in on Monday, because the row looks
 *   better full. Nothing has been done to earn it and nobody can tell later
 *   that it was not.
 *   **Behind.** Sunday-night catching up, four days of teeth reconstructed
 *   from memory. Kinder than the first, and just as untrue.
 *
 * So the only editable column is the one that is actually happening. The
 * others are still *drawn* — the week is the picture, and a child looking at
 * Wednesday should see what Monday and Tuesday came to — they simply cannot be
 * tapped.
 *
 * ---------------------------------------------------------------------------
 * AND NOTHING AT ALL ON SUNDAY
 * ---------------------------------------------------------------------------
 * Sunday is the seventh day of the week and has no column, so it returns -1
 * and the whole chart goes read-only. That is not an oversight in a
 * six-column chart — it is the day the ceremony happens, and a chart still
 * being filled in during the awards night is a chart the awards night cannot
 * be trusted to have counted. See `latestCompletedWeekStart`.
 *
 * Which columns a week *has* comes from `starDayCount`, because it depends on
 * the week: Saturday only became available from `SATURDAY_FROM_WEEK`, and an
 * older week must not suddenly gain a sixth day somebody could go back and
 * tick. It cannot be tapped anyway — the week is not the current one — but the
 * two answers should agree for the same reason everything else here does.
 *
 * This is the *only* definition of that rule. The chart disables the buttons
 * with it and the Server Action re-checks the same function on the server —
 * where the clock is the family's, not the device's, so a phone left on
 * yesterday's date cannot buy an extra column.
 */
export function openDayIndex(weekStart: Date, now: Date): number {
  const monday = startOfWeekMonday(weekStart);
  const offset = differenceInCalendarDays(monday, now);
  return offset >= 0 && offset < starDayCount(toIsoDate(monday)) ? offset : -1;
}

/*
 * There used to be a `referenceDateFor(weekStart, now)` here, which answered
 * "what date should the chore rotation be asked about for this week?" — today
 * for the current week, the week's own Monday for any other. It existed
 * because chores changed hands on the 1st, so a Monday-to-Friday week could
 * straddle two deals and the live chart had to show whoever held the chore
 * *now*.
 *
 * The chores swap on Monday morning now, which means a week is a whole number
 * of rotations and every day in it has the same answer. The function had
 * become a way of asking the same question twice, so callers pass the week's
 * Monday and there is one date a week is ever asked about. Anything that wants
 * *now* — the countdown to the next swap, say — should use now directly rather
 * than a reference date, because those are different questions.
 */
