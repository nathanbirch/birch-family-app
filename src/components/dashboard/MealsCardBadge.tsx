"use client";

import { useCurrentDate } from "@/hooks/useCurrentDate";

/**
 * "Tonight: Tacos" on the dashboard's Meals card, or "3 planned" when nothing
 * is pinned to today.
 *
 * A client component for the reason `SeatingCardBadge` is one: which meal is
 * tonight's depends on the *device's* weekday, and has to roll over at local
 * midnight without a reload. The plan's days are Monday-first (0 = Monday),
 * like every week in this app; `getDay()` is Sunday-first, hence the shift.
 */
export function MealsCardBadge({
  planned,
  initialDateIso,
}: {
  planned: readonly { day: number | null; name: string }[];
  initialDateIso: string;
}) {
  const date = useCurrentDate(initialDateIso);
  const weekday = (date.getDay() + 6) % 7;
  const tonight = planned.find((meal) => meal.day === weekday);

  return (
    <span
      className="themed-transition max-w-[12rem] truncate rounded-full px-2.5 py-1 text-xs font-bold"
      style={{
        backgroundColor: "var(--color-surface-muted)",
        color: "var(--color-text-muted)",
      }}
    >
      {tonight ? `Tonight: ${tonight.name}` : `${planned.length} planned`}
    </span>
  );
}
