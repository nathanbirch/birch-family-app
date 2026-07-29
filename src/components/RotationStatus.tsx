import type { ReactNode } from "react";

import { ROTATION_START_DATE } from "@/config/app";
import {
  formatDateRange,
  formatLongDate,
  formatMediumDate,
  parseLocalDate,
  toIsoDate,
} from "@/lib/dates";
import type { RotationStatus as RotationStatusData } from "@/lib/rotation";

/**
 * Compact status panel: which week we are in, the dates it covers, when seats
 * change next, and how long that is. Secondary to the seating graphics.
 */
export function RotationStatus({ status }: { status: RotationStatusData }) {
  const startDate = parseLocalDate(ROTATION_START_DATE);

  return (
    <section
      className="app-card themed-transition animate-soft-rise overflow-hidden"
      aria-labelledby="rotation-status-heading"
    >
      <h2 id="rotation-status-heading" className="sr-only">
        Rotation status
      </h2>

      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3.5">
          <WeekDial
            weekNumber={status.weekNumber}
            cycleLength={status.cycleLength}
          />
          <div className="min-w-0">
            <p className="text-base font-bold sm:text-lg">
              Week {status.weekNumber} of {status.cycleLength}
            </p>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              <time dateTime={toIsoDate(status.weekStart)}>
                {formatDateRange(status.weekStart, status.weekEnd)}
              </time>
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:gap-6">
          <Fact label="Next rotation">
            <time dateTime={toIsoDate(status.nextRotation)}>
              {formatMediumDate(status.nextRotation)}
            </time>
          </Fact>
          <Fact label="Days remaining">
            {status.daysUntilNextRotation}{" "}
            {status.daysUntilNextRotation === 1 ? "day" : "days"}
          </Fact>
        </dl>
      </div>

      {!status.hasStarted && startDate ? (
        <p
          className="border-t px-5 py-3 text-sm sm:px-6"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface-muted)",
            color: "var(--color-text-muted)",
          }}
        >
          The rotation begins on{" "}
          <strong style={{ color: "var(--color-text)" }}>
            {formatLongDate(startDate)}
          </strong>
          . Until then, these are the Week 1 seats.
        </p>
      ) : null}
    </section>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </dt>
      <dd className="text-sm font-semibold sm:text-base">{children}</dd>
    </div>
  );
}

/** A small ring showing progress through the five-week cycle. */
function WeekDial({
  weekNumber,
  cycleLength,
}: {
  weekNumber: number;
  cycleLength: number;
}) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const progress = (weekNumber / cycleLength) * circumference;

  return (
    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="var(--color-surface-muted)"
          stroke="var(--color-border)"
          strokeWidth="4"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
        />
      </svg>
      <span
        className="absolute text-base font-bold"
        style={{ color: "var(--color-primary)" }}
        aria-hidden="true"
      >
        {weekNumber}
      </span>
    </span>
  );
}
