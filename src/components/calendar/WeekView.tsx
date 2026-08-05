"use client";

import { eventsOnDay, type CalendarEvent } from "@/lib/calendar/events";
import { addDays, isSameLocalDay, startOfWeekMonday, toIsoDate } from "@/lib/dates";

import { EventRow } from "./EventRow";

/**
 * Seven days, stacked.
 *
 * A row per day rather than seven columns: on a phone, columns give each day
 * about forty pixels of width, which is enough for a coloured dot and nothing
 * else. Stacked rows keep real event titles visible, which is the entire point
 * of looking at the week.
 *
 * Weeks run Monday to Sunday, matching `startOfWeekMonday` and the seating
 * rotation — the weekend reads as the end of the week, where it belongs.
 */
export function WeekView({
  events,
  day,
  today,
  onSelectDay,
}: {
  events: readonly CalendarEvent[];
  /** Any day in the week to show. */
  day: Date;
  today: Date;
  /** Tapping a day's date opens it in the day view. */
  onSelectDay: (day: Date) => void;
}) {
  const monday = startOfWeekMonday(day);
  const days = Array.from({ length: 7 }, (_, offset) => addDays(monday, offset));

  return (
    <section aria-label="This week" className="animate-soft-rise app-card p-2 sm:p-3">
      <ul className="flex flex-col">
        {days.map((current) => (
          <WeekDayRow
            key={toIsoDate(current)}
            day={current}
            today={today}
            events={eventsOnDay(events, current)}
            onSelect={onSelectDay}
          />
        ))}
      </ul>
    </section>
  );
}

function WeekDayRow({
  day,
  today,
  events,
  onSelect,
}: {
  day: Date;
  today: Date;
  events: CalendarEvent[];
  onSelect: (day: Date) => void;
}) {
  const isToday = isSameLocalDay(day, today);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day);
  const full = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(day);

  return (
    <li
      className="themed-transition flex items-start gap-3 border-b py-2 last:border-b-0"
      style={{ borderColor: "var(--color-border)" }}
    >
      {/*
        Only the date is a button, not the whole row. A button may only contain
        phrasing content, and the event stack is a list — nesting one inside
        the other produces markup the browser silently restructures, which
        React then fails to hydrate against.

        It is a large enough target on its own (44px), and the day view it
        opens is reachable from the month grid too.
      */}
      <button
        type="button"
        onClick={() => onSelect(day)}
        aria-label={`Open ${full}`}
        className="flex min-h-[2.75rem] w-11 shrink-0 flex-col items-center rounded-xl pt-0.5 transition-transform active:scale-90"
      >
        <span
          className="text-[0.65rem] font-bold uppercase tracking-wide"
          style={{ color: "var(--color-text-muted)" }}
        >
          {weekday}
        </span>
        {/*
          Today is a filled circle — the same treatment the bottom bar gives
          the current tab, so "you are here" reads the same way twice.
        */}
        <span
          className="themed-transition mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold"
          style={
            isToday
              ? {
                  backgroundColor: "var(--color-primary)",
                  color: "var(--color-on-primary)",
                }
              : undefined
          }
        >
          {day.getDate()}
        </span>
      </button>

      <div className="min-w-0 flex-1 pt-1">
        {events.length === 0 ? (
          <p className="py-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            —
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {events.map((event) => (
              <EventRow key={event.id} event={event} day={day} compact />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
