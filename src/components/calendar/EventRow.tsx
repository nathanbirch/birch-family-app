"use client";

import type { CalendarEvent } from "@/lib/calendar/events";
import { formatEventTiming } from "@/lib/calendar/format";

/**
 * One event, as a row in the day and week views.
 *
 * The coloured rule down the left is the only ornament: it separates events
 * from each other at a glance without needing a border box per event, which at
 * phone width would eat most of the horizontal space the titles need.
 *
 * All-day events get the accent colour and timed ones the primary colour, so
 * the two kinds are distinguishable before you have read a word of either.
 */
export function EventRow({
  event,
  day,
  compact = false,
}: {
  event: CalendarEvent;
  /** Which day this row is being drawn under — the timing text depends on it. */
  day: Date;
  /** Tighter type and spacing, for the week view's seven stacked days. */
  compact?: boolean;
}) {
  const timing = formatEventTiming(event, day);

  return (
    <li
      className="flex gap-2.5 border-l-[3px] py-1"
      style={{
        borderColor: event.allDay
          ? "var(--color-accent)"
          : "var(--color-primary)",
        paddingLeft: compact ? "0.5rem" : "0.625rem",
      }}
    >
      <div className="min-w-0 flex-1">
        <p
          className={
            compact
              ? "truncate text-sm font-semibold leading-snug"
              : "text-base font-semibold leading-snug"
          }
        >
          {event.title}
        </p>
        <p
          className={compact ? "text-xs leading-snug" : "text-sm leading-snug"}
          style={{ color: "var(--color-text-muted)" }}
        >
          <span>{timing}</span>
          {event.location ? (
            <>
              {/*
                A middot rather than a second line: on a phone, location is
                usually short ("school", "Grandma's") and a whole line for it
                halves how many events fit on screen.
              */}
              <span aria-hidden="true"> · </span>
              <span className="break-words">{event.location}</span>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}
