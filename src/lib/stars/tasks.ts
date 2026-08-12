/**
 * Turning three charts and a rotation into one child's list of stars.
 *
 * This is the only place that knows how the three assignment kinds combine, so
 * the page, the marks store and (later) the weekly report all agree about what
 * "Clara's tasks this week" means. Pure — it takes the pools as an argument
 * rather than reaching for the database.
 */

import type { ChorePool } from "@/config/chore-rotation";
import type { ChildId } from "@/config/family";
import {
  CHARTS,
  STAR_TASKS,
  type Chart,
  type ChartId,
  type StarTask,
} from "@/config/stars";

import { getChoresForChild } from "./rotation";

export type ChartSection = {
  chart: Chart;
  tasks: readonly StarTask[];
};

/**
 * Every star this child can earn in the week containing `date`, in chart order.
 *
 * The rotation is asked for the week containing `date`, and the chores swap on
 * Monday morning, so every day of a week gives the same list. Callers pass the
 * week's own Monday and a past week is therefore as stable as the present
 * one.
 */
export function getTasksForChild(
  pools: readonly ChorePool[],
  date: Date,
  childId: ChildId,
): readonly StarTask[] {
  const rotating = new Set(getChoresForChild(pools, date, childId));

  return STAR_TASKS.filter((task) => {
    switch (task.assign.kind) {
      case "everyone":
        return true;
      case "fixed":
        return task.assign.children.includes(childId);
      case "rotating":
        return rotating.has(task.id);
    }
  });
}

/** The same list, split into the three chart sections. Empty sections are dropped. */
export function getChartSectionsForChild(
  pools: readonly ChorePool[],
  date: Date,
  childId: ChildId,
): ChartSection[] {
  const tasks = getTasksForChild(pools, date, childId);

  return CHARTS.map((chart) => ({
    chart,
    tasks: tasks.filter((task) => task.chart === chart.id),
  })).filter((section) => section.tasks.length > 0);
}

/** How many stars are on offer this week: one row is five. */
export function getWeeklyStarTotal(
  pools: readonly ChorePool[],
  date: Date,
  childId: ChildId,
  dayCount: number,
): number {
  return getTasksForChild(pools, date, childId).length * dayCount;
}

/** Whether a task is on this child's chart at all — the check the toggle action needs. */
export function isTaskForChild(
  pools: readonly ChorePool[],
  date: Date,
  childId: ChildId,
  taskId: string,
): boolean {
  return getTasksForChild(pools, date, childId).some(
    (task) => task.id === taskId,
  );
}

/** Tasks on one chart for one child. Used by the report's per-category counts. */
export function getChartTasksForChild(
  pools: readonly ChorePool[],
  date: Date,
  childId: ChildId,
  chart: ChartId,
): readonly StarTask[] {
  return getTasksForChild(pools, date, childId).filter(
    (task) => task.chart === chart,
  );
}
