import type { ReactNode } from "react";

import { APP_NAME } from "@/config/app";
import { formatLongDate, formatMediumDate, toIsoDate } from "@/lib/dates";
import type { RotationStatus } from "@/lib/rotation";

import { SwapParentsButton } from "./SwapParentsButton";
import { ThemePicker } from "./ThemePicker";

/**
 * App name, playful mark, today's date, the rotation badge and the theme
 * control. Stacks to two tidy rows on phones.
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
          <AppMark />
          <div className="min-w-0">
            {/* Sized down on the narrowest phones so the name still fits. */}
            <h1 className="truncate text-base font-extrabold tracking-tight sm:text-2xl">
              {APP_NAME}
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
          <ThemePicker />
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

/** A small illustrated mark: a plate with a steering-wheel wink. */
function AppMark() {
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
      style={{
        backgroundColor: "var(--color-primary)",
        boxShadow: "0 6px 16px -8px var(--color-shadow)",
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="h-7 w-7">
        <circle cx="16" cy="16" r="10.5" fill="var(--color-on-primary)" opacity="0.95" />
        <circle
          cx="16"
          cy="16"
          r="6.5"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.8"
        />
        <circle cx="16" cy="16" r="2" fill="var(--color-primary)" />
        <path
          d="M9.8 15.2h3.4M18.8 15.2h3.4M16 18.4v4.1"
          stroke="var(--color-primary)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
