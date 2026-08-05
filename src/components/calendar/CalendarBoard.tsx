"use client";

import { useCallback, useMemo, useState } from "react";

import {
  CALENDAR_DEFAULT_VIEW,
  CALENDAR_VIEWS,
  type CalendarView,
} from "@/config/calendar";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import type { CalendarEvent } from "@/lib/calendar/events";
import { formatMonthYear, formatRelativeDay } from "@/lib/calendar/format";
import {
  addDays,
  formatDateRange,
  isSameLocalDay,
  parseLocalDate,
  startOfWeekMonday,
  toIsoDate,
} from "@/lib/dates";

import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

/**
 * The calendar island.
 *
 * A client component for the same reason `SeatingBoard` is one, plus a second:
 *
 * 1. **The device's local date.** The server renders in UTC on Vercel; the
 *    phones are in Mountain Time. Which day an 8pm event falls on differs
 *    between the two, so every date decision here is made on the device, from
 *    `useCurrentDate`, and rolls over at local midnight without a reload.
 * 2. **Day/Week/Month is a choice**, and switching between them must not cost
 *    a round trip. The server sends one window of occurrences and all three
 *    views read from it.
 *
 * `initialDateIso` comes from the server so the first paint already shows the
 * right week rather than flashing a placeholder — the same trick the seating
 * board uses.
 */
export function CalendarBoard({
  events,
  initialDateIso,
  windowStart,
  windowEnd,
  truncated,
}: {
  events: readonly CalendarEvent[];
  initialDateIso: string;
  /** First day the server expanded, `YYYY-MM-DD`. */
  windowStart: string;
  /** Last day the server expanded, `YYYY-MM-DD`. */
  windowEnd: string;
  truncated: boolean;
}) {
  const today = useCurrentDate(initialDateIso);

  const [view, setView] = useState<CalendarView>(CALENDAR_DEFAULT_VIEW);

  /**
   * The focused day. `null` means "wherever today is", which is what keeps the
   * view correct when the app has been left open overnight: the cursor is not
   * a stale copy of yesterday's date, it is derived from `today`.
   */
  const [cursorIso, setCursorIso] = useState<string | null>(null);
  const cursor = useMemo(
    () => (cursorIso ? (parseLocalDate(cursorIso) ?? today) : today),
    [cursorIso, today],
  );

  const bounds = useMemo(
    () => ({
      start: parseLocalDate(windowStart),
      end: parseLocalDate(windowEnd),
    }),
    [windowStart, windowEnd],
  );

  /** Where the arrows would land, or `null` when that is outside the window. */
  const step = useCallback(
    (direction: -1 | 1): Date | null => {
      const next =
        view === "month"
          ? new Date(
              cursor.getFullYear(),
              cursor.getMonth() + direction,
              cursor.getDate(),
              12,
            )
          : addDays(cursor, direction * (view === "week" ? 7 : 1));

      if (bounds.start && next < bounds.start) return null;
      if (bounds.end && next > bounds.end) return null;
      return next;
    },
    [bounds.end, bounds.start, cursor, view],
  );

  const previous = step(-1);
  const next = step(1);
  const isOnToday = isSameLocalDay(cursor, today);

  const selectDay = useCallback((day: Date) => {
    setCursorIso(toIsoDate(day));
    setView("day");
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <ViewSwitcher view={view} onChange={setView} />

      <div className="flex items-center justify-between gap-2">
        <StepButton
          direction="previous"
          target={previous}
          onClick={() => previous && setCursorIso(toIsoDate(previous))}
        />

        <div className="min-w-0 flex-1 text-center">
          <h2 className="truncate text-base font-extrabold tracking-tight sm:text-lg">
            {periodLabel(view, cursor, today)}
          </h2>
          {!isOnToday ? (
            <button
              type="button"
              onClick={() => setCursorIso(null)}
              className="text-xs font-bold underline underline-offset-2"
              style={{ color: "var(--color-primary)" }}
            >
              Back to today
            </button>
          ) : null}
        </div>

        <StepButton
          direction="next"
          target={next}
          onClick={() => next && setCursorIso(toIsoDate(next))}
        />
      </div>

      {view === "day" ? (
        <DayView events={events} day={cursor} today={today} />
      ) : null}
      {view === "week" ? (
        <WeekView
          events={events}
          day={cursor}
          today={today}
          onSelectDay={selectDay}
        />
      ) : null}
      {view === "month" ? (
        <MonthView
          events={events}
          day={cursor}
          today={today}
          onSelectDay={selectDay}
        />
      ) : null}

      <p
        className="px-1 text-center text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        {truncated
          ? "Showing as much of the calendar as fits. Some repeating events may be missing."
          : `Showing ${formatDateRange(
              parseLocalDate(windowStart) ?? today,
              parseLocalDate(windowEnd) ?? today,
            )}`}
      </p>
    </div>
  );
}

/** The heading above the grid, in whatever unit the current view works in. */
function periodLabel(view: CalendarView, cursor: Date, today: Date): string {
  // The day view repeats the full date under its own heading, so the short
  // relative form is enough here and leaves room for the arrows.
  if (view === "day") return formatRelativeDay(cursor, today);

  if (view === "week") {
    const monday = startOfWeekMonday(cursor);
    return formatDateRange(monday, addDays(monday, 6));
  }

  return formatMonthYear(cursor);
}

function ViewSwitcher({
  view,
  onChange,
}: {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      className="themed-transition flex gap-1 rounded-2xl p-1"
      style={{ backgroundColor: "var(--color-surface-muted)" }}
    >
      {CALENDAR_VIEWS.map((option) => {
        const active = option.id === view;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className="themed-transition min-h-[2.5rem] flex-1 rounded-xl text-sm font-bold transition-transform active:scale-95"
            style={
              active
                ? {
                    backgroundColor: "var(--color-primary)",
                    color: "var(--color-on-primary)",
                  }
                : { color: "var(--color-text-muted)" }
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A step arrow, disabled at the edge of the expanded window.
 *
 * Disabled rather than hidden: the calendar genuinely stops here (the server
 * only expanded so far), and an arrow that vanishes looks like a bug where one
 * that greys out looks like a boundary.
 */
function StepButton({
  direction,
  target,
  onClick,
}: {
  direction: "previous" | "next";
  target: Date | null;
  onClick: () => void;
}) {
  const disabled = target === null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "previous" ? "Previous" : "Next"}
      className="app-card themed-transition flex h-11 w-11 shrink-0 items-center justify-center transition-transform active:scale-90"
      style={{
        color: "var(--color-text-muted)",
        opacity: disabled ? 0.35 : 1,
        borderRadius: "9999px",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={direction === "previous" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} />
      </svg>
    </button>
  );
}
