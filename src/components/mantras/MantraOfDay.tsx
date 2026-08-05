"use client";

import { useMemo } from "react";

import { useCurrentDate } from "@/hooks/useCurrentDate";
import { getMantraOfDay } from "@/config/mantras";
import { formatLongDate } from "@/lib/dates";

import { MantraCard } from "./MantraCard";

/**
 * Today's mantra, on top of the page.
 *
 * A client component for exactly the reason `SeatingBoard` is one: it depends
 * on the *device's* local date and has to turn over at local midnight without
 * a reload. `useCurrentDate` is seeded with the date the server rendered with,
 * so the first paint already shows the right mantra and hydration matches.
 *
 * Which mantra it is comes from the calendar date alone (see `getMantraOfDay`),
 * so every phone in the family lands on the same one — no syncing, no storage,
 * nothing to get out of step. Same idea as the seating rotation, one day at a
 * time instead of one week.
 */
export function MantraOfDay({ initialDateIso }: { initialDateIso: string }) {
  const date = useCurrentDate(initialDateIso);
  const mantra = useMemo(() => getMantraOfDay(date), [date]);

  return (
    <section aria-labelledby="today-heading" className="animate-soft-rise">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
        <h2
          id="today-heading"
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Today
        </h2>
        <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
          {formatLongDate(date)}
        </p>
      </div>

      {/*
        `key` on the mantra id, so when midnight rolls the card over it mounts
        fresh and plays the arrival animation rather than swapping text in
        place — the same trick the seating scenes use on a week change.
      */}
      <div key={mantra.id} className="animate-soft-fade">
        <MantraCard mantra={mantra} headingLevel={3} />
      </div>
    </section>
  );
}
