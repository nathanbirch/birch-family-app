"use client";

import { useMemo } from "react";

import { useCurrentDate } from "@/hooks/useCurrentDate";
import { getRotationStatus } from "@/lib/rotation";

/**
 * "Week 3 of 5" on the dashboard's seating card.
 *
 * A client component for the same reason `SeatingBoard` is one: the current
 * week depends on the *device's* local date and has to roll over at local
 * midnight without a reload. `initialDateIso` comes from the server so the
 * first paint already shows the right week rather than flashing a placeholder.
 */
export function SeatingCardBadge({
  initialDateIso,
}: {
  initialDateIso: string;
}) {
  const date = useCurrentDate(initialDateIso);
  const status = useMemo(() => getRotationStatus(date), [date]);

  return (
    <span
      className="themed-transition rounded-full px-2.5 py-1 text-xs font-bold"
      style={{
        backgroundColor: "var(--color-surface-muted)",
        color: "var(--color-text-muted)",
      }}
    >
      Week {status.weekNumber} of {status.cycleLength}
    </span>
  );
}
