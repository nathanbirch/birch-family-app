"use client";

import { useMemo } from "react";

import { NavIcon } from "@/components/nav/NavIcon";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import { getMottoWeek } from "@/lib/motto";
import { formatDateRange, toIsoDate } from "@/lib/dates";

/**
 * The family motto for this week, at the top of the home screen.
 *
 * A client component for the same reason `MantraOfDay` and `SeatingBoard` are:
 * it depends on the *device's* local date and has to turn over on its own when
 * the day changes, without a reload. `useCurrentDate` is seeded with the date
 * the server rendered with, so the first paint already shows the right motto
 * and hydration matches.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS ONE CARD IGNORES `.app-card`
 * ---------------------------------------------------------------------------
 * Everything else on the dashboard is a white surface with a hairline border.
 * The motto is the one thing on the screen that is not a link to somewhere
 * else, and if it looked like the cards around it, it would be read as a card
 * that failed to open. So it takes the theme's primary colour as a *filled*
 * panel: same radius and shadow as the cards, opposite weight. That is also
 * why the text uses `--color-on-primary`, the token every theme guarantees is
 * readable on its own primary.
 */
export function MottoBanner({ initialDateIso }: { initialDateIso: string }) {
  const date = useCurrentDate(initialDateIso);
  const week = useMemo(() => getMottoWeek(date), [date]);
  const { motto } = week;

  return (
    <section
      aria-labelledby="motto-heading"
      className="themed-transition animate-soft-rise relative overflow-hidden p-5 sm:p-7"
      style={{
        backgroundColor: "var(--color-primary)",
        color: "var(--color-on-primary)",
        borderRadius: "var(--radius-card)",
        boxShadow:
          "0 1px 2px var(--color-shadow), 0 16px 40px -20px var(--color-shadow)",
      }}
    >
      {/*
        A soft wash in the corner so a large flat block of primary has some
        depth to it. Purely decorative, sized in rem rather than percentages so
        it stays a corner glow rather than stretching across a wide screen.
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full"
        style={{
          backgroundColor: "var(--color-on-primary)",
          opacity: 0.09,
        }}
      />

      <div className="relative flex items-center justify-between gap-3">
        <h2
          id="motto-heading"
          className="text-xs font-bold uppercase tracking-wider"
          style={{ opacity: 0.85 }}
        >
          Motto of the week
        </h2>
        <p className="text-xs font-medium" style={{ opacity: 0.85 }}>
          <time dateTime={toIsoDate(week.weekStart)}>
            {formatDateRange(week.weekStart, week.weekEnd)}
          </time>
        </p>
      </div>

      {/*
        `key` on the motto id, so when Monday rolls it over the block mounts
        fresh and plays the arrival animation rather than swapping the words in
        place — the same trick the mantra card and the seating scenes use.
      */}
      <div
        key={motto.id}
        className="animate-soft-fade relative mt-4 flex items-start gap-4"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-on-primary) 18%, transparent)",
            color: "var(--color-on-primary)",
          }}
        >
          <NavIcon name={motto.icon} className="h-6 w-6" />
        </span>

        <div className="min-w-0 flex-1">
          {/* The whole point of the banner: bigger than the page's own h1. */}
          <p className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {motto.text}
          </p>
          <p
            className="mt-2 text-sm leading-relaxed sm:text-base"
            style={{ opacity: 0.9 }}
          >
            {motto.meaning}
          </p>
        </div>
      </div>

      <p
        className="relative mt-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-on-primary) 16%, transparent)",
        }}
      >
        {week.countdownLabel}
      </p>
    </section>
  );
}
