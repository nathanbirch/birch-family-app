"use client";

import { CALENDAR_MONTH_CELL_EVENTS } from "@/config/calendar";
import { eventsOnDay, type CalendarEvent } from "@/lib/calendar/events";
import { formatEventTimeShort } from "@/lib/calendar/format";
import { addDays, isSameLocalDay, startOfWeekMonday, toIsoDate } from "@/lib/dates";

/**
 * The month grid.
 *
 * Six rows of seven, always — a month spans five or six weeks depending on
 * which weekday it starts on, and a grid that changes height as you page
 * through the year makes the whole page jump under your thumb. Fixing it at
 * six keeps the layout still.
 *
 * Days from the neighbouring months are drawn faded rather than blank, because
 * an empty corner reads as "no events" rather than "not this month" — and the
 * first of the month genuinely does share a week with the last of the one
 * before it.
 */
export function MonthView({
  events,
  day,
  today,
  onSelectDay,
}: {
  events: readonly CalendarEvent[];
  /** Any day in the month to show. */
  day: Date;
  today: Date;
  onSelectDay: (day: Date) => void;
}) {
  const firstOfMonth = new Date(day.getFullYear(), day.getMonth(), 1, 12);
  const gridStart = startOfWeekMonday(firstOfMonth);
  const cells = Array.from({ length: 42 }, (_, offset) => addDays(gridStart, offset));

  // Built from real dates rather than hardcoded, so it follows the locale.
  const weekdayNames = Array.from({ length: 7 }, (_, offset) =>
    new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(
      addDays(gridStart, offset),
    ),
  );

  return (
    <section aria-label="Month" className="animate-soft-rise app-card p-2 sm:p-3">
      <div className="grid grid-cols-7 gap-1">
        {weekdayNames.map((name, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="pb-1 text-center text-[0.65rem] font-bold uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            {name}
          </div>
        ))}

        {cells.map((cell) => (
          <MonthCell
            key={toIsoDate(cell)}
            day={cell}
            today={today}
            inMonth={cell.getMonth() === day.getMonth()}
            events={eventsOnDay(events, cell)}
            onSelect={onSelectDay}
          />
        ))}
      </div>
    </section>
  );
}

function MonthCell({
  day,
  today,
  inMonth,
  events,
  onSelect,
}: {
  day: Date;
  today: Date;
  inMonth: boolean;
  events: CalendarEvent[];
  onSelect: (day: Date) => void;
}) {
  const isToday = isSameLocalDay(day, today);
  const shown = events.slice(0, CALENDAR_MONTH_CELL_EVENTS);
  const hidden = events.length - shown.length;

  const label = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(day);

  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      aria-label={`${label}, ${events.length} ${events.length === 1 ? "event" : "events"}`}
      className="themed-transition flex min-h-[4.25rem] flex-col items-stretch gap-0.5 rounded-lg p-1 text-left transition-transform active:scale-95"
      style={{
        backgroundColor: isToday ? "var(--color-surface-muted)" : undefined,
        opacity: inMonth ? 1 : 0.4,
      }}
    >
      <span
        className="themed-transition mx-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
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

      {/*
        Chips, not dots. A dot tells you something is happening; a chip tells
        you what, and on a month grid that is the difference between a page you
        have to tap through and one you can read.
      */}
      {shown.map((event) => (
        <span
          key={event.id}
          className="truncate rounded px-1 text-[0.6rem] font-semibold leading-4"
          style={{
            backgroundColor: event.allDay
              ? "color-mix(in srgb, var(--color-accent) 22%, transparent)"
              : "color-mix(in srgb, var(--color-primary) 16%, transparent)",
          }}
        >
          {formatEventTimeShort(event, day) ? (
            <span style={{ color: "var(--color-text-muted)" }}>
              {formatEventTimeShort(event, day)}{" "}
            </span>
          ) : null}
          {event.title}
        </span>
      ))}

      {hidden > 0 ? (
        <span
          className="px-1 text-[0.6rem] font-bold leading-4"
          style={{ color: "var(--color-text-muted)" }}
        >
          +{hidden} more
        </span>
      ) : null}
    </button>
  );
}
