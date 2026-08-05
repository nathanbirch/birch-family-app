/**
 * Placing events on a time grid.
 *
 * The list views only ever need to know *which* day an event is on. The
 * timeline needs to know exactly where on that day it starts, how tall it is,
 * and — the hard part — what to do when several events happen at once.
 *
 * ---------------------------------------------------------------------------
 * THE OVERLAP PROBLEM
 * ---------------------------------------------------------------------------
 * A Monday morning with an airport run at 5:30, a flight at 7:15 and
 * babysitting from 8 has three events fighting for the same strip of column.
 * Drawing them on top of each other hides two of them; giving every event on
 * the day its own narrow column wastes the whole afternoon's width.
 *
 * The standard answer, and the one used here, has two stages:
 *
 * 1. **Cluster.** Walk the day in start order, gathering events into runs that
 *    transitively overlap. A cluster ends the moment an event starts after
 *    everything before it has finished. Each cluster is laid out independently,
 *    so a busy morning does not squeeze a lone evening event.
 *
 * 2. **Pack into columns.** Within a cluster, each event takes the leftmost
 *    column whose previous occupant has already finished. The cluster's width
 *    is then split between however many columns that needed.
 *
 * The output is expressed as fractions of a day rather than pixels, so the
 * component owns how tall an hour is and this file stays pure and testable.
 */

import { eventsOnDay, type CalendarEvent } from "./events";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The shortest slot an event may occupy, for layout purposes.
 *
 * Two jobs. It stops a 15-minute reminder rendering as an unreadable sliver,
 * and it stops a zero-length event (which Google emits for some imported
 * reminders) from being treated as overlapping nothing and stacking on top of
 * its neighbour.
 */
const MIN_SLOT_MS = 20 * 60 * 1000;

export type PositionedEvent = {
  event: CalendarEvent;
  /** Where the block starts, as a fraction of the day (0 = midnight). */
  top: number;
  /** How much of the day the block covers, as a fraction. */
  height: number;
  /** Which column within its cluster, from 0. */
  column: number;
  /** How many columns the cluster needed. */
  columnCount: number;
  /** The event began before this day and is running into it. */
  continuesFrom: boolean;
  /** The event runs past the end of this day. */
  continuesInto: boolean;
};

type Block = {
  event: CalendarEvent;
  /** Clamped to the day. */
  start: number;
  end: number;
  /** `end`, but never less than `MIN_SLOT_MS` after `start`. */
  packEnd: number;
  column: number;
  continuesFrom: boolean;
  continuesInto: boolean;
};

/**
 * Every timed event on `day`, positioned.
 *
 * All-day events are deliberately excluded: they have no position on a time
 * axis, and the grid pins them in a header row above it — which is what Google
 * does, and for the same reason.
 */
export function layoutDayEvents(
  events: readonly CalendarEvent[],
  day: Date,
): PositionedEvent[] {
  const dayStart = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const dayEnd = dayStart + MS_PER_DAY;

  const blocks: Block[] = eventsOnDay(events, day)
    .filter((event) => !event.allDay)
    .map((event) => {
      // A multi-day event is clipped to this day's column; the flags below are
      // what let the component show it as arriving from, or leaving for,
      // somewhere off-screen.
      const start = Math.max(event.start, dayStart);
      const end = Math.min(Math.max(event.end, event.start), dayEnd);

      return {
        event,
        start,
        end,
        packEnd: Math.max(end, start + MIN_SLOT_MS),
        column: 0,
        continuesFrom: event.start < dayStart,
        continuesInto: event.end > dayEnd,
      };
    });

  // Start order, and where two events start together the longer one first, so
  // the event that dominates the cluster takes the leftmost column.
  blocks.sort(
    (a, b) => a.start - b.start || b.packEnd - a.packEnd || a.event.title.localeCompare(b.event.title),
  );

  const positioned: PositionedEvent[] = [];

  let cluster: Block[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    positioned.push(...packCluster(cluster, dayStart));
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const block of blocks) {
    // Nothing in the cluster is still running, so this begins a new one.
    if (block.start >= clusterEnd) flush();

    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.packEnd);
  }
  flush();

  return positioned;
}

/**
 * Assign columns within one run of overlapping events.
 *
 * `columnEnds[i]` is when the last event placed in column `i` finishes. An
 * event takes the first column that has finished by the time it starts, which
 * keeps blocks as far left — and therefore as wide — as they can be.
 */
function packCluster(cluster: Block[], dayStart: number): PositionedEvent[] {
  const columnEnds: number[] = [];

  for (const block of cluster) {
    let column = columnEnds.findIndex((end) => end <= block.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(0);
    }
    columnEnds[column] = block.packEnd;
    block.column = column;
  }

  const columnCount = columnEnds.length;

  return cluster.map((block) => ({
    event: block.event,
    top: (block.start - dayStart) / MS_PER_DAY,
    // Drawn at the minimum height too, or a short event is a hairline with no
    // room for its own title.
    height: Math.max(block.end - block.start, MIN_SLOT_MS) / MS_PER_DAY,
    column: block.column,
    columnCount,
    continuesFrom: block.continuesFrom,
    continuesInto: block.continuesInto,
  }));
}

/**
 * The hour the grid should open on for a set of days.
 *
 * Twenty-four hours is far taller than any screen, and opening at midnight
 * shows six hours of nothing. This scrolls to just before the earliest event
 * on display, falling back to a sensible working hour when there is nothing on
 * — so the grid opens somewhere useful rather than somewhere arbitrary.
 */
export function firstInterestingHour(
  events: readonly CalendarEvent[],
  days: readonly Date[],
  fallbackHour: number,
): number {
  let earliest: number | null = null;

  for (const day of days) {
    for (const positioned of layoutDayEvents(events, day)) {
      // A block running in from yesterday starts at midnight and would drag
      // the grid back to the top for no benefit.
      if (positioned.continuesFrom) continue;

      const hour = Math.floor(positioned.top * 24);
      if (earliest === null || hour < earliest) earliest = hour;
    }
  }

  if (earliest === null) return fallbackHour;

  // An hour of context above the first event, so it does not sit jammed
  // against the top edge looking like it has been cut off.
  return Math.max(0, earliest - 1);
}
