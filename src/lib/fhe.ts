/**
 * Family Home Evening maths. Pure functions only — nothing here touches React.
 *
 * ---------------------------------------------------------------------------
 * THE RULE, IN ONE LINE
 * ---------------------------------------------------------------------------
 *   person p has role  (offset + p + weeks since the anchor Sunday) mod 7
 *
 * where `offset` is whatever makes the anchor true. That single expression is
 * the entire rotation, and three properties fall out of it rather than being
 * checked for:
 *
 *  - **Everyone moves down one room a week**, together, in the same order —
 *    which is what lets the family read next week off the picture by looking
 *    one room further down.
 *  - **Everyone does every job exactly once** in seven weeks, and nobody
 *    repeats a job in consecutive weeks. Adding 1 (mod 7) is a full cycle.
 *  - **Nobody is ever doubled up or left out**, because `p -> role` is a
 *    bijection for every week.
 *
 * ---------------------------------------------------------------------------
 * SUNDAY, NOT MONDAY
 * ---------------------------------------------------------------------------
 * The seats and the chores change hands on Monday; this changes on Sunday, so
 * it counts its weeks between Sundays (`differenceInCalendarWeeksSunday`) and
 * never borrows the Monday helpers. The changeover is midnight going into
 * Sunday, which is what "Sunday morning" means to an app that has no idea when
 * anybody woke up: the family gets up on Sunday and the new jobs are already
 * showing.
 */

import type { PersonId } from "@/config/family";
import { getPerson } from "@/config/family";
import {
  FHE_ANCHOR,
  FHE_CYCLE_LENGTH,
  FHE_PERSON_ORDER,
  FHE_ROLES,
  type FheRole,
  type FheRoleId,
} from "@/config/fhe";

import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarWeeksSunday,
  parseLocalDate,
  startOfNextWeekSunday,
  startOfWeekSunday,
} from "./dates";
import type { SeatingSummaryLine } from "./seating-summary";

/**
 * The anchor Sunday, parsed once at local noon.
 *
 * Falls back to the Sunday of the current week if the configured value is
 * malformed, so the card still renders something sensible instead of nothing —
 * and shouts about it in development, exactly as `getRotationStartDate` does.
 */
export function getFheAnchorSunday(
  raw: string = FHE_ANCHOR.sunday,
  now: Date = new Date(),
): Date {
  const parsed = parseLocalDate(raw);
  if (parsed) return startOfWeekSunday(parsed);

  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      `FHE_ANCHOR.sunday ("${raw}") is not a valid YYYY-MM-DD date. ` +
        `Fix it in src/config/fhe.ts.`,
    );
  }
  return startOfWeekSunday(now);
}

/**
 * How far the rotation has advanced from the anchor week. Never negative.
 *
 * Weeks before the anchor show the anchor week's jobs rather than an
 * extrapolation backwards — the same forwards-only rule the chore rotation
 * follows, and for the same reason: the rotation did not exist before the
 * anchor Sunday, so running the sum in reverse would be inventing a history
 * the family never lived.
 */
export function getFheWeekOffset(
  date: Date,
  anchor: Date = getFheAnchorSunday(),
): number {
  return Math.max(0, differenceInCalendarWeeksSunday(anchor, date));
}

/** Which job in `FHE_ROLES` the anchor pins, and to whom. */
function anchorOffset(): number {
  const personIndex = FHE_PERSON_ORDER.indexOf(FHE_ANCHOR.personId);
  const roleIndex = FHE_ROLES.findIndex((role) => role.id === FHE_ANCHOR.roleId);

  if (personIndex < 0 || roleIndex < 0) {
    throw new Error(
      `FHE_ANCHOR names someone or something that is not in the rotation: ` +
        `"${FHE_ANCHOR.personId}" / "${FHE_ANCHOR.roleId}". Check config/fhe.ts.`,
    );
  }
  // Kept positive so the caller's `% length` never sees a negative.
  return (
    ((roleIndex - personIndex) % FHE_CYCLE_LENGTH + FHE_CYCLE_LENGTH) %
    FHE_CYCLE_LENGTH
  );
}

export type FheAssignment = {
  role: FheRole;
  personId: PersonId;
};

/** Which job one person has in the week containing `date`. */
export function getFheRoleFor(
  personId: PersonId,
  date: Date,
  anchor: Date = getFheAnchorSunday(),
): FheRole {
  const personIndex = FHE_PERSON_ORDER.indexOf(personId);
  if (personIndex < 0) {
    throw new Error(
      `${personId} is not in FHE_PERSON_ORDER. Check config/fhe.ts.`,
    );
  }

  const index =
    (anchorOffset() + personIndex + getFheWeekOffset(date, anchor)) %
    FHE_CYCLE_LENGTH;
  return FHE_ROLES[index];
}

/**
 * Everybody's job for the week containing `date`, **in role order** — which is
 * the order the rooms run down the picture, and therefore the order people
 * arrive in.
 */
export function getFheAssignments(
  date: Date,
  anchor: Date = getFheAnchorSunday(),
): FheAssignment[] {
  const byRole = new Map<FheRoleId, PersonId>();
  for (const personId of FHE_PERSON_ORDER) {
    byRole.set(getFheRoleFor(personId, date, anchor).id, personId);
  }

  return FHE_ROLES.map((role) => {
    const personId = byRole.get(role.id);
    if (!personId) {
      // Unreachable while the rotation is a bijection, which a test proves.
      throw new Error(`Nobody has the ${role.label} for ${date.toDateString()}.`);
    }
    return { role, personId };
  });
}

export type FheStatus = {
  /** `false` before the anchor Sunday, when the rotation had not begun. */
  hasStarted: boolean;
  /** 1-based week number within the seven-week cycle. */
  weekNumber: number;
  cycleLength: number;
  /** The Sunday this week's jobs began on. */
  weekStart: Date;
  /** The Saturday they run through. */
  weekEnd: Date;
  /** The next Sunday, when everyone moves down a room. */
  nextRotation: Date;
  /** Whole days until the next changeover. 1-7; never 0 — see `countdownLabel`. */
  daysUntilNextRotation: number;
  /** Friendly countdown copy, e.g. "Next rotation is in 3 days". */
  countdownLabel: string;
  assignments: FheAssignment[];
};

/** Everything the card needs for the week containing `date`, in one call. */
export function getFheStatus(
  date: Date,
  anchor: Date = getFheAnchorSunday(),
): FheStatus {
  const offset = getFheWeekOffset(date, anchor);
  const weekStart = startOfWeekSunday(date);
  const nextRotation = startOfNextWeekSunday(date);
  const daysUntil = differenceInCalendarDays(date, nextRotation);

  return {
    hasStarted: differenceInCalendarDays(anchor, date) >= 0,
    weekNumber: (offset % FHE_CYCLE_LENGTH) + 1,
    cycleLength: FHE_CYCLE_LENGTH,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    nextRotation,
    daysUntilNextRotation: daysUntil,
    countdownLabel: isFheRotationDay(date)
      ? "Next rotation is today"
      : countdownFor(daysUntil),
    assignments: getFheAssignments(date, anchor),
  };
}

/** `true` when `date` is itself a changeover day — that is, a Sunday. */
export function isFheRotationDay(date: Date): boolean {
  return differenceInCalendarDays(startOfWeekSunday(date), date) === 0;
}

/*
 * On a Sunday the *next* changeover is a full week away, which is why the
 * "today" case is answered by `isFheRotationDay` above rather than by a zero
 * here: `daysUntilNextRotation` counts 1-7 and never reaches 0, exactly as the
 * seating countdown does.
 */
function countdownFor(daysUntil: number): string {
  if (daysUntil === 1) return "Next rotation is tomorrow";
  return `Next rotation is in ${daysUntil} days`;
}

/**
 * The accessible equivalent of the picture: one line per job, in the order the
 * rooms run down the house. Derived from the same assignments the avatars are
 * drawn from, never written by hand.
 */
export function getFheSummary(
  assignments: readonly FheAssignment[],
): SeatingSummaryLine[] {
  return assignments.map(({ role, personId }) => ({
    id: `fhe-${role.id}`,
    text: `${getPerson(personId).name} has the ${role.label}.`,
  }));
}
