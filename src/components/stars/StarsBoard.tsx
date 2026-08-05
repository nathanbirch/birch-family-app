"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ChorePool } from "@/config/chore-rotation";
import { CHILD_IDS, getPerson, type ChildId } from "@/config/family";
import { STAR_DAY_COUNT } from "@/config/stars";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import {
  addDays,
  differenceInCalendarDays,
  formatDateRange,
  parseLocalDate,
  startOfWeekMonday,
} from "@/lib/dates";
import { setStar } from "@/lib/stars/actions";
import { rowFor, tally, type WeekMarks } from "@/lib/stars/counting";
import { getChoreCountdownLabel } from "@/lib/stars/rotation";
import { getChartSectionsForChild, getTasksForChild } from "@/lib/stars/tasks";
import { getWeekStartIso, referenceDateFor } from "@/lib/stars/week";

import { ChildTabs } from "./ChildTabs";
import { StarChartCard } from "./StarChartCard";

/**
 * The star charts, one child at a time.
 *
 * A client component for the same reason `SeatingBoard` is: which chores a
 * child has depends on the *device's* local date, and it has to be right at
 * midnight on the first of the month without a reload. The pools and the
 * week's marks are handed down by the page — nothing here queries anything.
 *
 * ---------------------------------------------------------------------------
 * WHY ONE CHILD AT A TIME
 * ---------------------------------------------------------------------------
 * The paper chart shows five columns at once because it is A3 and taped to a
 * fridge. On a phone, five columns of five stars is 25 targets across a
 * 390-pixel screen — about 14px each, well under the ~44px a thumb hits
 * reliably. So the phone shows one child's chart at full size and puts the
 * other four one tap away, which is also the order a child does this in: they
 * come to fill in *their* stars.
 */
export function StarsBoard({
  initialDateIso,
  weekStart,
  pools,
  marks,
}: {
  initialDateIso: string;
  /** The Monday the `marks` belong to, `YYYY-MM-DD`. */
  weekStart: string;
  pools: readonly ChorePool[];
  marks: WeekMarks;
}) {
  const router = useRouter();
  const date = useCurrentDate(initialDateIso);
  const [selected, setSelected] = useState<ChildId>(CHILD_IDS[0]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /*
   * Optimistic ticking. The star fills the instant it is tapped and the write
   * goes out behind it; when the action's `revalidatePath` lands, `marks`
   * arrives fresh from the database and this collapses back onto the truth.
   * A child colouring in a row should never watch a spinner between stars.
   */
  const [optimistic, applyOptimistic] = useOptimistic(
    marks,
    (state: WeekMarks, patch: StarPatch): WeekMarks => {
      const child = state[patch.childId] ?? {};
      const row = [...rowFor(child, patch.taskId)];
      row[patch.dayIndex] = patch.value;
      return {
        ...state,
        [patch.childId]: { ...child, [patch.taskId]: row },
      };
    },
  );

  const monday = useMemo(
    () => parseLocalDate(weekStart) ?? startOfWeekMonday(date),
    [weekStart, date],
  );

  /*
   * The device has crossed into a new week (or started the app up on a Monday
   * morning that the server-rendered page predates). The marks in hand are
   * last week's, so ask the server for this week's rather than showing stale
   * stars against a fresh chart.
   */
  useEffect(() => {
    if (getWeekStartIso(date) !== weekStart) router.refresh();
  }, [date, weekStart, router]);

  /** Which column is today, or -1 at the weekend and in any other week. */
  const todayIndex = useMemo(() => {
    const offset = differenceInCalendarDays(monday, date);
    return offset >= 0 && offset < STAR_DAY_COUNT ? offset : -1;
  }, [monday, date]);

  // Chores change hands on the 1st, so a week that straddles a month shows
  // whoever has the chore *now*. See `lib/stars/week.ts`.
  const reference = useMemo(() => referenceDateFor(monday, date), [monday, date]);

  const sections = useMemo(
    () => getChartSectionsForChild(pools, reference, selected),
    [pools, reference, selected],
  );

  const totals = useMemo(() => {
    const counts = {} as Record<ChildId, number>;
    for (const childId of CHILD_IDS) {
      counts[childId] = tally(
        optimistic[childId] ?? {},
        getTasksForChild(pools, reference, childId),
      ).earned;
    }
    return counts;
  }, [optimistic, pools, reference]);

  const childMarks = optimistic[selected] ?? {};
  const weekTotal = useMemo(
    () => tally(childMarks, getTasksForChild(pools, reference, selected)),
    [childMarks, pools, reference, selected],
  );

  function toggle(taskId: string, dayIndex: number, value: boolean) {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ childId: selected, taskId, dayIndex, value });
      const result = await setStar({
        childId: selected,
        weekStart,
        taskId,
        dayIndex,
        value,
      });
      if (!result.ok) setError(result.message);
    });
  }

  const person = getPerson(selected);

  return (
    <div className="flex flex-col gap-4">
      <header className="animate-soft-fade flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Stars
          </h1>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>
            {formatDateRange(monday, addDays(monday, 4))}
          </p>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {getChoreCountdownLabel(reference)} · colour a star each day you finish.
        </p>
      </header>

      <ChildTabs selected={selected} totals={totals} onSelect={setSelected} />

      <p
        className="text-center text-sm font-bold"
        style={{ color: "var(--color-star-ink)" }}
        aria-live="polite"
      >
        {person.name} has {weekTotal.earned} of {weekTotal.possible} stars this
        week
        {weekTotal.completeRows > 0
          ? ` · ${weekTotal.completeRows} whole ${weekTotal.completeRows === 1 ? "row" : "rows"}`
          : ""}
      </p>

      {error ? (
        <p
          role="status"
          className="rounded-2xl px-4 py-2 text-center text-sm font-semibold"
          style={{
            backgroundColor: "color-mix(in srgb, #dc2626 14%, transparent)",
            color: "#b91c1c",
          }}
        >
          {error}
        </p>
      ) : null}

      {/*
        Keyed on the child so switching charts re-runs the entrance animation
        — it reads as *their* chart arriving rather than the labels silently
        changing under your thumb.
      */}
      <div key={selected} className="animate-soft-rise flex flex-col gap-3">
        {sections.map((section) => (
          <StarChartCard
            key={section.chart.id}
            section={section}
            marks={childMarks}
            todayIndex={todayIndex}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}

type StarPatch = {
  childId: ChildId;
  taskId: string;
  dayIndex: number;
  value: boolean;
};
