"use client";

import { useMemo } from "react";

import { useCurrentDate } from "@/hooks/useCurrentDate";
import type { CalendarEvent } from "@/lib/calendar/events";
import { nextEvent } from "@/lib/calendar/events";
import { formatNextEventBadge } from "@/lib/calendar/format";

/**
 * "Tue 3:00 PM" on the dashboard's calendar card.
 *
 * The sibling of `SeatingCardBadge`, and a client component for the same
 * reason: which event is *next* depends on the device's clock, and the answer
 * has to change at local midnight without a reload.
 *
 * Renders nothing when there is nothing ahead. A card that says "no events" is
 * noise; a card with no badge simply looks like the other cards.
 */
export function CalendarCardBadge({
  events,
  initialDateIso,
}: {
  events: readonly CalendarEvent[];
  initialDateIso: string;
}) {
  const today = useCurrentDate(initialDateIso);

  const label = useMemo(() => {
    const upcoming = nextEvent(events, today);
    return formatNextEventBadge(upcoming, today);
  }, [events, today]);

  if (!label) return null;

  return (
    <span
      className="themed-transition rounded-full px-2.5 py-1 text-xs font-bold"
      style={{
        backgroundColor: "var(--color-surface-muted)",
        color: "var(--color-text-muted)",
      }}
    >
      {label}
    </span>
  );
}
