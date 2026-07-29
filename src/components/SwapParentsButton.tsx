"use client";

import { getPerson } from "@/config/family";
import { PARENT_ASSIGNMENTS } from "@/config/seating";

const PARENT_1 = getPerson(PARENT_ASSIGNMENTS.table.parent1);
const PARENT_2 = getPerson(PARENT_ASSIGNMENTS.table.parent2);

/**
 * Trades the two parents' seats, in both scenes at once.
 *
 * The arrows rotate a half turn to show the current state, so it never relies
 * on colour alone, and `aria-pressed` says the same thing to a screen reader.
 */
export function SwapParentsButton({
  swapped,
  onToggle,
}: {
  swapped: boolean;
  onToggle: () => void;
}) {
  const label = swapped
    ? `${PARENT_2.name} and ${PARENT_1.name} are swapped. Put them back in their usual seats.`
    : `Swap ${PARENT_1.name} and ${PARENT_2.name}'s seats.`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={swapped}
      title={label}
      className="themed-transition flex h-11 min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold sm:px-4"
      style={{
        backgroundColor: swapped ? "var(--color-primary)" : "var(--color-surface)",
        color: swapped ? "var(--color-on-primary)" : "var(--color-text)",
        border: swapped
          ? "1px solid var(--color-primary)"
          : "1px solid var(--color-border)",
        boxShadow: "0 1px 2px var(--color-shadow)",
      }}
    >
      <SwapIcon swapped={swapped} />
      <span className="hidden sm:inline">Swap</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}

function SwapIcon({ swapped }: { swapped: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
      style={{
        transform: swapped ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 420ms cubic-bezier(0.34, 1.28, 0.64, 1)",
      }}
    >
      <path
        d="M4 9h13l-3.2-3.2M20 15H7l3.2 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
