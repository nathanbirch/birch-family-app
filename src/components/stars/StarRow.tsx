"use client";

import { STAR_DAY_LABELS, STAR_DAY_NAMES, type StarTask } from "@/config/stars";
import { isRowComplete } from "@/lib/stars/counting";

import { StarButton } from "./StarButton";

/**
 * One task and its five stars.
 *
 * The layout is the paper chart's: the job on the left, the week running away
 * to the right. A filled row lights up, because on the chart that is the thing
 * that earns the weekly reward — it should be visible from across the kitchen,
 * not something you have to count.
 */
export function StarRow({
  task,
  row,
  todayIndex,
  onToggle,
}: {
  task: StarTask;
  row: readonly boolean[];
  /** 0-4 when today is a weekday of this week, otherwise -1. */
  todayIndex: number;
  onToggle: (dayIndex: number, value: boolean) => void;
}) {
  const complete = isRowComplete(row);

  return (
    <li
      className="themed-transition flex items-center gap-2 rounded-2xl px-2 py-1.5"
      style={{
        backgroundColor: complete
          ? "color-mix(in srgb, var(--color-star) 16%, transparent)"
          : "transparent",
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug sm:text-base">
          {task.label}
        </span>
        {complete ? (
          <span
            className="block text-xs font-bold"
            style={{ color: "var(--color-star-ink)" }}
          >
            Whole row! ⭐
          </span>
        ) : null}
      </span>

      <span className="flex shrink-0">
        {STAR_DAY_LABELS.map((_, day) => (
          <StarButton
            key={day}
            filled={row[day] === true}
            isToday={day === todayIndex}
            label={`${task.label} on ${STAR_DAY_NAMES[day]}`}
            onToggle={(value) => onToggle(day, value)}
          />
        ))}
      </span>
    </li>
  );
}
