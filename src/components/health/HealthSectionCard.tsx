import Link from "next/link";

import type { HealthSection } from "@/config/health";

import { HEALTH_PALETTE, HealthArt } from "./HealthArt";

/**
 * One list, as a card you tap to open it.
 *
 * Built for the youngest reader in the house: the picture is the biggest thing
 * on it, the whole card is the tap target rather than a small "read more"
 * link, and the count on the pill tells a child how long the list is before
 * they commit to opening it.
 *
 * The tinted wash is `color-mix`ed over the themed surface rather than painted
 * flat, so the card still belongs to whichever of the ten themes is on — it
 * reads as *this* card being apple-red, not as a light-mode card stranded on a
 * dark page.
 */
export function HealthSectionCard({ section }: { section: HealthSection }) {
  const palette = HEALTH_PALETTE[section.id];

  return (
    <Link
      href={`/health/${section.id}`}
      className="app-card themed-transition flex items-center gap-4 p-4 transition-transform active:scale-[0.98] sm:gap-5 sm:p-5"
      style={{
        backgroundColor: `color-mix(in srgb, ${palette.soft} 42%, var(--color-surface))`,
      }}
    >
      <HealthArt
        id={section.id}
        className="h-16 w-16 shrink-0 sm:h-20 sm:w-20"
      />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-extrabold tracking-tight sm:text-xl">
            {section.title}
          </span>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-bold"
            style={{
              backgroundColor: palette.soft,
              color: palette.ink,
            }}
          >
            {section.items.length} things
          </span>
        </span>
        <span
          className="mt-0.5 block text-sm leading-snug"
          style={{ color: "var(--color-text-muted)" }}
        >
          {section.blurb}
        </span>
      </span>

      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--color-text-muted)" }}
        aria-hidden="true"
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  );
}
