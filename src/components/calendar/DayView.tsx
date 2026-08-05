"use client";

import type { CalendarEvent } from "@/lib/calendar/events";
import { eventsOnDay } from "@/lib/calendar/events";
import { formatDayHeading, formatRelativeDay } from "@/lib/calendar/format";

import { EventRow } from "./EventRow";

/**
 * One day, in full.
 *
 * The view you land on after tapping a day in the week or month grid, and the
 * only one with room for locations and long titles unabbreviated.
 */
export function DayView({
  events,
  day,
  today,
}: {
  events: readonly CalendarEvent[];
  day: Date;
  today: Date;
}) {
  const onThisDay = eventsOnDay(events, day);

  return (
    <section aria-label={formatDayHeading(day)} className="animate-soft-rise">
      <header className="mb-3 px-1">
        <h2 className="text-xl font-extrabold tracking-tight">
          {formatRelativeDay(day, today)}
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {formatDayHeading(day)}
        </p>
      </header>

      {onThisDay.length === 0 ? (
        <EmptyDay />
      ) : (
        <ul className="app-card flex flex-col gap-3 p-4">
          {onThisDay.map((event) => (
            <EventRow key={event.id} event={event} day={day} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyDay() {
  return (
    <div
      className="app-card p-6 text-center text-sm"
      style={{ color: "var(--color-text-muted)" }}
    >
      Nothing on this day.
    </div>
  );
}
