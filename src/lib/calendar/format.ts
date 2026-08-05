/**
 * Turning occurrences into the words on screen.
 *
 * Kept out of the components for the same reason the rest of `src/lib` is:
 * this is where the fiddly cases live — an event that started yesterday, one
 * that runs past midnight, one with no duration at all — and each of them is
 * far easier to assert on as a function than to pick out of rendered markup.
 *
 * Everything formats in the *device's* local zone via `Intl`, which is correct
 * because these only ever run in the browser, inside the client island.
 */

import { addDays, isSameLocalDay, toIsoDate } from "@/lib/dates";

import type { CalendarEvent } from "./events";

/** e.g. "3:00 PM", or "15:00" where the locale prefers it. */
export function formatTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

/** e.g. "August 2026" — the month view's heading. */
export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
}

/** e.g. "Mon" — the month grid's column headings and the week view's rows. */
export function formatWeekdayShort(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
}

/** e.g. "Monday, 3 August 2026" — the day view's heading. */
export function formatDayHeading(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * How an occurrence's timing reads on a particular day.
 *
 * The four cases are genuinely different pieces of information:
 *
 * | Situation | Reads |
 * |---|---|
 * | All-day | `All day` |
 * | Starts and ends today | `3:00 PM – 4:30 PM` |
 * | Started before today | `until 4:30 PM` |
 * | Runs past today | `from 9:00 PM` |
 *
 * Without the last two, a Friday-night event that runs to Saturday morning
 * shows up on Saturday looking like it starts on Friday, which is worse than
 * useless on a glanceable card.
 */
export function formatEventTiming(event: CalendarEvent, day: Date): string {
  if (event.allDay) return "All day";

  const startsToday = isSameLocalDay(new Date(event.start), day);
  // An event ending at exactly midnight belongs to the previous day, not to
  // the sliver of the next one it technically touches.
  const endsToday = isSameLocalDay(new Date(event.end - 1), day);

  if (!startsToday && !endsToday) return "All day";
  if (!startsToday) return `until ${formatTime(event.end)}`;
  if (!endsToday) return `from ${formatTime(event.start)}`;

  // A zero-length event is a point in time, not a range.
  if (event.start === event.end) return formatTime(event.start);

  return `${formatTime(event.start)} – ${formatTime(event.end)}`;
}

/** The compact form used in the month grid, where there is room for one time. */
export function formatEventTimeShort(event: CalendarEvent, day: Date): string | null {
  if (event.allDay) return null;
  if (!isSameLocalDay(new Date(event.start), day)) return null;

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    // Drop ":00" on the hour — "3pm" rather than "3:00pm" — because in a grid
    // cell every character costs a character of the event's actual title.
    minute: new Date(event.start).getMinutes() === 0 ? undefined : "2-digit",
  }).format(new Date(event.start));
}

/**
 * "Today", "Tomorrow", "Yesterday", or the weekday and date.
 *
 * Relative labels only for the three days a person actually thinks about
 * relatively; past that, "in 4 days" is harder to act on than "Friday".
 */
export function formatRelativeDay(date: Date, today: Date): string {
  if (isSameLocalDay(date, today)) return "Today";
  if (isSameLocalDay(date, addDays(today, 1))) return "Tomorrow";
  if (isSameLocalDay(date, addDays(today, -1))) return "Yesterday";

  const sameYear = date.getFullYear() === today.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  }).format(date);
}

/**
 * The dashboard card's badge: the next thing, as few words as possible.
 *
 * Returns `null` when there is nothing ahead, so the caller can leave the
 * badge off entirely rather than render "Nothing" on a card.
 */
export function formatNextEventBadge(
  event: CalendarEvent | null,
  today: Date,
): string | null {
  if (!event) return null;

  if (event.allDay) {
    const startIso = event.startDate;
    if (!startIso) return null;
    // An all-day event already in progress is happening now, not later.
    if (startIso <= toIsoDate(today)) return "Today";
    return relativeDayWord(new Date(`${startIso}T12:00:00`), today);
  }

  const start = new Date(event.start);
  const word = relativeDayWord(start, today);

  return word === "Today" ? formatTime(event.start) : `${word} ${formatTime(event.start)}`;
}

function relativeDayWord(date: Date, today: Date): string {
  if (isSameLocalDay(date, today)) return "Today";
  if (isSameLocalDay(date, addDays(today, 1))) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
}
