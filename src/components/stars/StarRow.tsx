"use client";

import { STAR_DAY_LABELS, STAR_DAY_NAMES, type StarTask } from "@/config/stars";
import { isRowComplete } from "@/lib/stars/counting";

import { StarButton } from "./StarButton";

/**
 * One task and its week of stars.
 *
 * The layout is the paper chart's: the job on the left, the week running away
 * to the right. A filled row lights up, because on the chart that is the thing
 * that earns the weekly reward — it should be visible from across the kitchen,
 * not something you have to count.
 */
export function StarRow({
  task,
  row,
  dayCount,
  todayIndex,
  onToggle,
}: {
  task: StarTask;
  row: readonly boolean[];
  /**
   * How many columns this week has — five before Saturday was offered, six
   * after. See `starDayCount`.
   */
  dayCount: number;
  /** The column that may be tapped today, or -1 on a Sunday or an old week. */
  todayIndex: number;
  onToggle: (dayIndex: number, value: boolean) => void;
}) {
  const complete = isRowComplete(row, dayCount);

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
        {STAR_DAY_LABELS.slice(0, dayCount).map((_, day) => (
          <StarButton
            key={day}
            filled={row[day] === true}
            isToday={day === todayIndex}
            // Every column but today's, and every one of them on a Sunday or
            // in a week that is over — the chart is a record of days, not a
            // grid to fill in. See `openDayIndex()` in `lib/stars/week.ts`.
            locked={day !== todayIndex}
            label={`${task.label} on ${STAR_DAY_NAMES[day]}`}
            onToggle={(value) => onToggle(day, value)}
          />
        ))}
      </span>
    </li>
  );
}
