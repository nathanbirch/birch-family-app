/**
 * Dates and ages, the way the Meals page says them.
 *
 * Pure. "Today" is always passed in, never read from the clock here, so the
 * server's first paint and the browser's agree and the tests are exact.
 */

import { differenceInCalendarDays, formatMediumDate, parseLocalDate } from "@/lib/dates";

/** "today", "yesterday", "12 days ago", "3 months ago". */
export function describeAge(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/** How long ago an epoch-millisecond moment was, in calendar days. */
export function daysSince(then: number, today: Date): number {
  return Math.max(0, differenceInCalendarDays(new Date(then), today));
}

/** "Last made Sep 3 · 25 days ago", from a `YYYY-MM-DD` and today. */
export function describeLastMade(day: string | null, today: Date): string {
  if (!day) return "Not logged yet";
  const date = parseLocalDate(day);
  if (!date) return "Not logged yet";
  const age = Math.max(0, differenceInCalendarDays(date, today));
  if (age === 0) return "Made today";
  return `Last made ${formatMediumDate(date)} · ${describeAge(age)}`;
}
