"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  CALENDAR_FALLBACK_HOUR,
  CALENDAR_HOUR_HEIGHT,
  CALENDAR_WEEK_MIN_WIDTH_REM,
} from "@/config/calendar";
import { eventsOnDay, type CalendarEvent } from "@/lib/calendar/events";
import { formatEventTiming, formatTime } from "@/lib/calendar/format";
import { firstInterestingHour, layoutDayEvents } from "@/lib/calendar/layout";
import { isSameLocalDay, toIsoDate } from "@/lib/dates";

/**
 * The hour grid — one column per day, events placed by time.
 *
 * Shared by Day (one column) and Week (seven), because they differ only in how
 * many columns they draw. Everything positional comes from
 * `lib/calendar/layout.ts`, which knows nothing about pixels; this component
 * turns those fractions into a height and decides what a column looks like.
 *
 * ---------------------------------------------------------------------------
 * WHY ALL-DAY EVENTS SIT ABOVE THE AXIS
 * ---------------------------------------------------------------------------
 * An all-day event has no start time, so it has nowhere to go on a time axis.
 * Stretching one from midnight to midnight would bury the whole column behind
 * it. Google pins them in a header row instead, and that is what happens here:
 * the header does not scroll, so "Hannah's Night" stays visible however far
 * down the day you are looking.
 */
export function TimeGrid({
  events,
  days,
  today,
  onSelectDay,
}: {
  events: readonly CalendarEvent[];
  /** One column each, in order. */
  days: readonly Date[];
  today: Date;
  /** Tapping a column heading opens that day. */
  onSelectDay: (day: Date) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const isWeek = days.length > 1;

  /*
   * The current time, for the "now" line. It starts null and is only filled in
   * after mount: the server has no idea what time it is on the device, and
   * rendering a line from the server's clock would both be wrong and trip a
   * hydration mismatch. It then ticks once a minute, which is as precisely as
   * a line one pixel per 75 seconds can be read anyway.
   */
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  // `days` is a fresh array on every render, so it is useless as a dependency.
  // The dates it holds are what actually matter, so they become the key.
  const daysKey = days.map(toIsoDate).join(",");

  const openingHour = useMemo(
    () => firstInterestingHour(events, days, CALENDAR_FALLBACK_HOUR),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, daysKey],
  );

  /*
   * Open scrolled to the first event rather than to midnight. Without this the
   * grid always opens on six empty hours and every visit starts with a scroll.
   */
  useEffect(() => {
    if (scroller.current) {
      scroller.current.scrollTop = openingHour * CALENDAR_HOUR_HEIGHT;
    }
  }, [openingHour]);

  const bodyHeight = 24 * CALENDAR_HOUR_HEIGHT;

  return (
    <section
      aria-label={isWeek ? "This week, by time" : "This day, by time"}
      className="animate-soft-rise app-card overflow-hidden"
    >
      {/* The horizontal scroller: seven columns cannot honestly fit a phone. */}
      <div className="overflow-x-auto">
        <div
          style={{
            minWidth: isWeek ? `${CALENDAR_WEEK_MIN_WIDTH_REM}rem` : undefined,
          }}
        >
          <GridHeader
            events={events}
            days={days}
            today={today}
            onSelectDay={onSelectDay}
          />

          <div
            ref={scroller}
            className="overflow-y-auto"
            // Tall enough to be worth scrolling, short enough that the bottom
            // tab bar and the page's own heading stay reachable.
            style={{ maxHeight: "60vh" }}
          >
            <div className="relative flex" style={{ height: bodyHeight }}>
              <HourAxis />

              {days.map((day) => (
                <DayColumn
                  key={toIsoDate(day)}
                  day={day}
                  events={events}
                  nowMs={nowMs}
                  isToday={isSameLocalDay(day, today)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Header: weekday, date, and the all-day row                          */
/* ------------------------------------------------------------------ */

function GridHeader({
  events,
  days,
  today,
  onSelectDay,
}: {
  events: readonly CalendarEvent[];
  days: readonly Date[];
  today: Date;
  onSelectDay: (day: Date) => void;
}) {
  const allDayByDay = days.map((day) =>
    eventsOnDay(events, day).filter((event) => event.allDay),
  );

  // One shared height, so the columns' hour lines start level with each other
  // even when only one day has an all-day event on it.
  const rows = Math.max(...allDayByDay.map((list) => list.length), 0);

  return (
    <div
      className="themed-transition flex border-b"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="flex w-12 shrink-0 items-end justify-center pb-1 text-[0.6rem] font-semibold"
        style={{ color: "var(--color-text-muted)" }}
      >
        {/* Google labels the gutter with the calendar's offset; this is the
            device's, which is the one the times on screen are actually in. */}
        <span>{localZoneLabel()}</span>
      </div>

      {days.map((day, index) => (
        <div
          key={toIsoDate(day)}
          className="min-w-0 flex-1 border-l px-1 pb-1 pt-2"
          style={{ borderColor: "var(--color-border)" }}
        >
          <DayHeading
            day={day}
            isToday={isSameLocalDay(day, today)}
            onSelect={onSelectDay}
          />

          <div className="mt-1 flex flex-col gap-0.5" style={{ minHeight: rows * 20 }}>
            {allDayByDay[index].map((event) => (
              <span
                key={event.id}
                title={event.title}
                className="truncate rounded px-1 text-[0.65rem] font-semibold leading-[1.15rem]"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--color-accent) 26%, transparent)",
                }}
              >
                {event.title}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayHeading({
  day,
  isToday,
  onSelect,
}: {
  day: Date;
  isToday: boolean;
  onSelect: (day: Date) => void;
}) {
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day);
  const full = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(day);

  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      aria-label={`Open ${full}`}
      className="flex w-full flex-col items-center rounded-lg py-0.5 transition-transform active:scale-95"
    >
      <span
        className="text-[0.6rem] font-bold uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        {weekday}
      </span>
      <span
        className="themed-transition mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold"
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
  );
}

/** e.g. "GMT-6" — the device's own offset, matching the times on the axis. */
function localZoneLabel(): string {
  // `getTimezoneOffset` is minutes *behind* UTC, so the sign is inverted.
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `GMT${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

/* ------------------------------------------------------------------ */
/* The axis and the columns                                            */
/* ------------------------------------------------------------------ */

function HourAxis() {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);

  return (
    <div className="relative w-12 shrink-0" aria-hidden="true">
      {hours.map((hour) => (
        <span
          key={hour}
          className="absolute right-1 text-[0.6rem] font-semibold"
          style={{
            // Nudged up half a line so the label sits *on* its gridline rather
            // than hanging below it.
            top: hour * CALENDAR_HOUR_HEIGHT - 6,
            color: "var(--color-text-muted)",
          }}
        >
          {/* Midnight has no label: there is no gridline above it to label. */}
          {hour === 0 ? "" : formatHour(hour)}
        </span>
      ))}
    </div>
  );
}

function formatHour(hour: number): string {
  const sample = new Date(2026, 0, 1, hour);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(sample);
}

function DayColumn({
  day,
  events,
  nowMs,
  isToday,
}: {
  day: Date;
  events: readonly CalendarEvent[];
  nowMs: number | null;
  isToday: boolean;
}) {
  const positioned = layoutDayEvents(events, day);

  return (
    <div
      className="relative min-w-0 flex-1 border-l"
      style={{
        borderColor: "var(--color-border)",
        // The hour lines, as one repeating gradient rather than 24 elements.
        backgroundImage:
          "repeating-linear-gradient(to bottom, var(--color-border) 0 1px, transparent 1px var(--hour-height))",
        ["--hour-height" as string]: `${CALENDAR_HOUR_HEIGHT}px`,
      }}
    >
      {positioned.map((block) => (
        <TimeBlock key={block.event.id} block={block} day={day} />
      ))}

      {isToday && nowMs !== null ? <NowLine day={day} nowMs={nowMs} /> : null}
    </div>
  );
}

function TimeBlock({
  block,
  day,
}: {
  block: ReturnType<typeof layoutDayEvents>[number];
  day: Date;
}) {
  const { event, top, height, column, columnCount } = block;

  // Columns share the width evenly. The 2% inset stops adjacent blocks
  // touching, which is what makes two of them read as two rather than one.
  const width = 100 / columnCount;

  return (
    <div
      className="absolute overflow-hidden rounded-md px-1 py-0.5"
      style={{
        top: `${top * 100}%`,
        height: `${height * 100}%`,
        left: `calc(${column * width}% + 1px)`,
        width: `calc(${width}% - 2px)`,
        backgroundColor: "color-mix(in srgb, var(--color-primary) 20%, var(--color-surface))",
        borderLeft: "3px solid var(--color-primary)",
        // A block clipped by midnight loses the rounded corner on that edge,
        // so it reads as continuing rather than as finishing there.
        borderTopLeftRadius: block.continuesFrom ? 0 : undefined,
        borderTopRightRadius: block.continuesFrom ? 0 : undefined,
        borderBottomLeftRadius: block.continuesInto ? 0 : undefined,
        borderBottomRightRadius: block.continuesInto ? 0 : undefined,
      }}
      title={`${event.title} · ${formatEventTiming(event, day)}`}
    >
      <p className="truncate text-[0.65rem] font-bold leading-tight">
        {event.title}
      </p>
      {/*
        The time is dropped on very short blocks — below roughly 45 minutes
        there is only room for one line, and the title is the more useful one.
      */}
      {height * 24 * 60 >= 45 ? (
        <p
          className="truncate text-[0.6rem] leading-tight"
          style={{ color: "var(--color-text-muted)" }}
        >
          {block.continuesFrom ? "" : formatTime(event.start)}
        </p>
      ) : null}
    </div>
  );
}

/** The red line across today, where Google puts it. */
function NowLine({ day, nowMs }: { day: Date; nowMs: number }) {
  const dayStart = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
  ).getTime();

  const fraction = (nowMs - dayStart) / (24 * 60 * 60 * 1000);
  if (fraction < 0 || fraction > 1) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
      style={{ top: `${fraction * 100}%` }}
    >
      {/*
        Deliberately a fixed red rather than a theme token. It is the one mark
        on the grid that must not be mistaken for an event, and every theme
        colours events from its own palette.
      */}
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "#dc2626" }} />
      <span className="h-px flex-1" style={{ backgroundColor: "#dc2626" }} />
    </div>
  );
}
