/**
 * Rotation maths. Pure functions only — nothing here touches React.
 *
 * The current seating is derived entirely from three inputs:
 *   1. the configured rotation start date,
 *   2. the current local date,
 *   3. the configured five-week schedule.
 */

import { ROTATION_START_DATE } from "@/config/app";
import type { ChildId } from "@/config/family";
import {
  CHILD_ROTATION_SCHEDULE,
  ROTATION_LENGTH_WEEKS,
} from "@/config/rotation";
import {
  getParentAssignments,
  type ChildPosition,
  type ParentPair,
  CHILD_POSITIONS,
} from "@/config/seating";
import {
  addDays,
  differenceInCalendarDays,
  parseLocalDate,
  startOfWeekMonday,
} from "./dates";

/**
 * The configured start date, parsed once at local noon.
 *
 * If the configured value is malformed we fall back to the Monday of the
 * current week so the app still renders something sensible instead of a blank
 * screen — and we shout about it in development.
 */
export function getRotationStartDate(
  raw: string = ROTATION_START_DATE,
  now: Date = new Date(),
): Date {
  const parsed = parseLocalDate(raw);
  if (parsed) return startOfWeekMonday(parsed);

  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      `ROTATION_START_DATE ("${raw}") is not a valid YYYY-MM-DD date. ` +
        `Fix it in src/config/app.ts.`,
    );
  }
  return startOfWeekMonday(now);
}

/**
 * Complete weeks elapsed since the start Monday. Never negative: dates before
 * the rotation begins report week 0 so the app can show Week 1 as upcoming.
 */
export function getElapsedWeeks(date: Date, startDate: Date): number {
  const currentMonday = startOfWeekMonday(date);
  const startMonday = startOfWeekMonday(startDate);
  const days = differenceInCalendarDays(startMonday, currentMonday);
  if (days <= 0) return 0;
  return Math.floor(days / 7);
}

/** Zero-based index into `CHILD_ROTATION_SCHEDULE`. Always in range. */
export function getRotationIndex(
  date: Date,
  startDate: Date = getRotationStartDate(),
  scheduleLength: number = ROTATION_LENGTH_WEEKS,
): number {
  const elapsed = getElapsedWeeks(date, startDate);
  return ((elapsed % scheduleLength) + scheduleLength) % scheduleLength;
}

/** The child ordering for the week containing `date`. */
export function getWeekPermutation(
  date: Date,
  startDate: Date = getRotationStartDate(),
  schedule: ReadonlyArray<readonly ChildId[]> = CHILD_ROTATION_SCHEDULE,
): readonly ChildId[] {
  return schedule[getRotationIndex(date, startDate, schedule.length)];
}

export type ChildAssignment = {
  position: ChildPosition;
  childId: ChildId;
};

export type WeeklyAssignments = {
  /** 1-based week number within the five-week cycle. */
  weekNumber: number;
  cycleLength: number;
  /** Child position number -> child id, shared by both scenes. */
  children: ChildAssignment[];
  /** Parent seats for the dinner table. Never affected by the rotation. */
  tableParents: ParentPair;
  /** Parent seats for the Expedition. Never affected by the rotation. */
  vehicleParents: ParentPair;
};

/** Options that change the seating without changing the rotation itself. */
export type SeatingOptions = {
  /** Put each parent in the other's configured seat. */
  swapParents?: boolean;
};

/** Everything the two scenes need for the week containing `date`. */
export function getWeeklyAssignments(
  date: Date,
  startDate: Date = getRotationStartDate(),
  schedule: ReadonlyArray<readonly ChildId[]> = CHILD_ROTATION_SCHEDULE,
  options: SeatingOptions = {},
): WeeklyAssignments {
  const index = getRotationIndex(date, startDate, schedule.length);
  const week = schedule[index];
  const parents = getParentAssignments(options.swapParents);

  return {
    weekNumber: index + 1,
    cycleLength: schedule.length,
    children: CHILD_POSITIONS.map((position) => ({
      position,
      childId: week[position - 1],
    })),
    tableParents: parents.table,
    vehicleParents: parents.vehicle,
  };
}

/** Convenience lookup: which child is in a given position this week. */
export function getChildAtPosition(
  assignments: WeeklyAssignments,
  position: ChildPosition,
): ChildId {
  const match = assignments.children.find(
    (entry) => entry.position === position,
  );
  if (!match) {
    throw new Error(`No child assigned to position ${position}.`);
  }
  return match.childId;
}

/** Monday 00:00 through Sunday, for the week containing `date`. */
export function getRotationDateRange(date: Date): { start: Date; end: Date } {
  const start = startOfWeekMonday(date);
  return { start, end: addDays(start, 6) };
}

/** The next Monday on which seats change. */
export function getNextRotationDate(date: Date): Date {
  return addDays(startOfWeekMonday(date), 7);
}

/** Whole days from `date` until the next rotation. 1-7; never 0. */
export function getDaysUntilNextRotation(date: Date): number {
  return differenceInCalendarDays(date, getNextRotationDate(date));
}

/** `true` when `date` is itself a rotation day (a Monday). */
export function isRotationDay(date: Date): boolean {
  return differenceInCalendarDays(startOfWeekMonday(date), date) === 0;
}

export type RotationStatus = {
  /** `false` before the configured start date. */
  hasStarted: boolean;
  weekNumber: number;
  cycleLength: number;
  weekStart: Date;
  weekEnd: Date;
  nextRotation: Date;
  daysUntilNextRotation: number;
  /** Friendly countdown copy, e.g. "New seats in 3 days". */
  countdownLabel: string;
  assignments: WeeklyAssignments;
};

/** Everything the status panel and header need, in one call. */
export function getRotationStatus(
  date: Date,
  startDate: Date = getRotationStartDate(),
  options: SeatingOptions = {},
): RotationStatus {
  const assignments = getWeeklyAssignments(
    date,
    startDate,
    CHILD_ROTATION_SCHEDULE,
    options,
  );
  const startMonday = startOfWeekMonday(startDate);
  const hasStarted = differenceInCalendarDays(startMonday, date) >= 0;

  if (!hasStarted) {
    // Before the rotation begins, everything points at week 1's real dates
    // rather than at the current calendar week, which has no assignment yet.
    const daysUntilStart = differenceInCalendarDays(date, startMonday);
    return {
      hasStarted: false,
      weekNumber: assignments.weekNumber,
      cycleLength: assignments.cycleLength,
      weekStart: startMonday,
      weekEnd: addDays(startMonday, 6),
      nextRotation: startMonday,
      daysUntilNextRotation: daysUntilStart,
      countdownLabel: countdownFor(daysUntilStart),
      assignments,
    };
  }

  const { start, end } = getRotationDateRange(date);
  const daysUntil = getDaysUntilNextRotation(date);

  return {
    hasStarted: true,
    weekNumber: assignments.weekNumber,
    cycleLength: assignments.cycleLength,
    weekStart: start,
    weekEnd: end,
    nextRotation: getNextRotationDate(date),
    daysUntilNextRotation: daysUntil,
    countdownLabel: getCountdownLabel(date, daysUntil),
    assignments,
  };
}

/** Friendly, child-readable countdown copy. */
export function getCountdownLabel(date: Date, daysUntil: number): string {
  if (isRotationDay(date)) return "Seats rotate today";
  return countdownFor(daysUntil);
}

function countdownFor(daysUntil: number): string {
  if (daysUntil <= 0) return "Seats rotate today";
  if (daysUntil === 1) return "New seats tomorrow";
  return `New seats in ${daysUntil} days`;
}
