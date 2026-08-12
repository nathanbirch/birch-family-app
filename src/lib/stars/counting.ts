/**
 * What a week of ticked stars adds up to.
 *
 * Pure, and deliberately free of `server-only` so the chart in the browser and
 * the weekly report on the server count in exactly the same way. Nothing here
 * knows about MongoDB — see `marks.ts` for the storage.
 */

import { DEAL_STAR_VALUE } from "@/config/deals";
import { STAR_DAY_COUNT, type ChartId, type StarTask } from "@/config/stars";
import type { ChildId } from "@/config/family";
import type { DealSlot } from "./deals";

/** Task id -> one boolean per weekday, Monday first. Always `STAR_DAY_COUNT` long. */
export type StarMarks = Record<string, boolean[]>;

/** Every child's marks for one week. A child with nothing ticked has `{}`. */
export type WeekMarks = Record<ChildId, StarMarks>;

/** A fresh, unticked row. */
export function emptyRow(): boolean[] {
  return Array.from({ length: STAR_DAY_COUNT }, () => false);
}

/**
 * One task's row, whether or not it has ever been ticked.
 *
 * Always returns a full-length row, so callers can index it without checking —
 * an untouched task and a task with a blank row are the same thing to
 * everything downstream.
 */
export function rowFor(marks: StarMarks, taskId: string): boolean[] {
  const row = marks[taskId];
  if (!row) return emptyRow();
  return Array.from({ length: STAR_DAY_COUNT }, (_, day) => row[day] === true);
}

export function countRow(row: readonly boolean[]): number {
  return row.reduce((total, star) => total + (star ? 1 : 0), 0);
}

/** A whole row of five — the weekly reward on the bottom of every chart. */
export function isRowComplete(row: readonly boolean[]): boolean {
  return countRow(row) === STAR_DAY_COUNT;
}

/**
 * A whole *column*: every one of these tasks ticked on one day.
 *
 * The rows are what the paper chart rewards; the columns are what a child
 * actually does — "everything I owe for Wednesday". That is the thing worth
 * throwing confetti at, so it needs saying in one place that the chart, the
 * celebration and (later) the report can all agree on.
 *
 * An empty set is never complete, for the same reason an empty chart is never
 * perfect: there was nothing to finish.
 */
export function isColumnComplete(
  marks: StarMarks,
  tasks: readonly StarTask[],
  dayIndex: number,
): boolean {
  if (tasks.length === 0) return false;
  return tasks.every((task) => rowFor(marks, task.id)[dayIndex] === true);
}

/**
 * `marks` with one star changed. Pure — it never touches the original.
 *
 * Used both by the optimistic reducer on the board and by the celebration
 * check, so "what the chart will look like a moment from now" is computed one
 * way rather than two.
 */
export function withMark(
  marks: StarMarks,
  taskId: string,
  dayIndex: number,
  value: boolean,
): StarMarks {
  const row = [...rowFor(marks, taskId)];
  row[dayIndex] = value;
  return { ...marks, [taskId]: row };
}

export type StarTally = {
  earned: number;
  possible: number;
  /** Rows filled all the way across. */
  completeRows: number;
  /** How many rows were on offer. */
  rows: number;
};

/** How a set of tasks went. The unit the report is built from. */
export function tally(
  marks: StarMarks,
  tasks: readonly StarTask[],
): StarTally {
  let earned = 0;
  let completeRows = 0;

  for (const task of tasks) {
    const row = rowFor(marks, task.id);
    earned += countRow(row);
    if (isRowComplete(row)) completeRows += 1;
  }

  return {
    earned,
    possible: tasks.length * STAR_DAY_COUNT,
    completeRows,
    rows: tasks.length,
  };
}

/**
 * `true` when every star on offer for these tasks was earned.
 *
 * Empty sets are *not* perfect. A child with no tasks on a chart has not aced
 * it, and the report should not congratulate them for it.
 */
export function isPerfect(marks: StarMarks, tasks: readonly StarTask[]): boolean {
  if (tasks.length === 0) return false;
  const { earned, possible } = tally(marks, tasks);
  return earned === possible;
}

/* ------------------------------------------------------------------ */
/* Star Deals                                                          */
/* ------------------------------------------------------------------ */

/**
 * How a week's deals went for one child.
 *
 * A deal is stored in exactly the same `marks` object as everything else — one
 * row of five booleans, filed under the deal's id — so nothing above had to
 * learn a new shape. What is different is the arithmetic, and it is different
 * in two ways that both live here and nowhere else:
 *
 *   **A deal is worth three stars, not one.** `DEAL_STAR_VALUE`. This is the
 *   only place in the app where one tick is worth more than one star.
 *   **A deal is one day wide, not five.** It is offered on the day it is
 *   offered and never again, so a deal's row has exactly one meaningful column
 *   — `slot.dayIndex` — and the other four are read as nothing. A child who
 *   somehow had a `true` in Friday's column of Monday's deal has not earned a
 *   star for it.
 *
 * `slots` is one child's week, from `getWeekDealsForChild()`.
 */
export type DealTally = {
  /** Deals taken, counted in ordinary stars — so `taken * DEAL_STAR_VALUE`. */
  earned: number;
  /** Every deal on offer, in stars. */
  possible: number;
  /** How many deals were actually done. */
  taken: number;
  /** How many were on offer. Five in a full week. */
  offered: number;
};

export function tallyDeals(
  marks: StarMarks,
  slots: readonly DealSlot[],
): DealTally {
  let taken = 0;
  for (const slot of slots) {
    if (rowFor(marks, slot.deal.id)[slot.dayIndex] === true) taken += 1;
  }

  return {
    earned: taken * DEAL_STAR_VALUE,
    possible: slots.length * DEAL_STAR_VALUE,
    taken,
    offered: slots.length,
  };
}

/** Whether one particular day's deal was taken. */
export function isDealTaken(
  marks: StarMarks,
  slot: DealSlot | null | undefined,
): boolean {
  if (!slot) return false;
  return rowFor(marks, slot.deal.id)[slot.dayIndex] === true;
}

/**
 * Everything owed for one day, deal included — what the whole-screen confetti
 * is thrown at.
 *
 * The deal is part of the day rather than a bonus on top of it, so "James
 * finished everything for Wednesday" means the chores, the learning, the
 * hygiene *and* the deal. It is the biggest single star of the day and leaving
 * it out would make the sentence untrue.
 *
 * A day with no deal — one the matching could not fill — falls back to the
 * charts alone rather than becoming impossible to finish.
 */
export function isDayComplete(
  marks: StarMarks,
  tasks: readonly StarTask[],
  slot: DealSlot | null | undefined,
  dayIndex: number,
): boolean {
  if (!isColumnComplete(marks, tasks, dayIndex)) return false;
  return slot ? isDealTaken(marks, slot) : true;
}

/** The charts this child was perfect on, in the order the charts are listed. */
export function perfectCharts(
  marks: StarMarks,
  tasks: readonly StarTask[],
  charts: readonly ChartId[],
): ChartId[] {
  return charts.filter((chart) =>
    isPerfect(
      marks,
      tasks.filter((task) => task.chart === chart),
    ),
  );
}
