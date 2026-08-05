/**
 * What a week of ticked stars adds up to.
 *
 * Pure, and deliberately free of `server-only` so the chart in the browser and
 * the weekly report on the server count in exactly the same way. Nothing here
 * knows about MongoDB — see `marks.ts` for the storage.
 */

import { STAR_DAY_COUNT, type ChartId, type StarTask } from "@/config/stars";
import type { ChildId } from "@/config/family";

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
