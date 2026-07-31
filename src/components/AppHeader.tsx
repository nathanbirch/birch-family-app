import type { ReactNode } from "react";

import { formatLongDate, formatMediumDate, toIsoDate } from "@/lib/dates";
import type { RotationStatus } from "@/lib/rotation";

import { AppMark } from "./AppMark";
import { SwapParentsButton } from "./SwapParentsButton";

/**
 * Page title, today's date, the rotation badge and the parent-swap control.
 * Stacks to two tidy rows on phones.
 *
 * The theme picker used to sit here too. It moved to the Account page when the
 * app grew more than one screen: it is an app-wide preference, and every
 * future page would otherwise have had to find room for it in its own header.
 */
export function AppHeader({
  date,
  status,
  parentsSwapped,
  onSwapParents,
}: {
  date: Date;
  status: RotationStatus;
  parentsSwapped: boolean;
  onSwapParents: () => void;
}) {
  return (
    <header className="animate-soft-fade flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AppMark size={44} />
          <div className="min-w-0">
            {/* Sized down on the narrowest phones so the title still fits. */}
            <h1 className="truncate text-base font-extrabold tracking-tight sm:text-2xl">
              Seating Rotation
            </h1>
            {/* Abbreviated on small screens, where header space is scarce. */}
            <p
              className="truncate text-xs sm:text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              <time dateTime={toIsoDate(date)} className="sm:hidden">
                {formatMediumDate(date)}
              </time>
              <time dateTime={toIsoDate(date)} className="hidden sm:inline">
                {formatLongDate(date)}
              </time>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SwapParentsButton
            swapped={parentsSwapped}
            onToggle={onSwapParents}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill emphasis>
          Week {status.weekNumber} of {status.cycleLength}
        </Pill>
        <Pill>{status.countdownLabel}</Pill>
      </div>
    </header>
  );
}

function Pill({
  children,
  emphasis = false,
}: {
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <span
      className="themed-transition rounded-full px-3 py-1.5 text-sm font-semibold"
      style={
        emphasis
          ? {
              backgroundColor: "var(--color-primary)",
              color: "var(--color-on-primary)",
            }
          : {
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }
      }
    >
      {children}
    </span>
  );
}

