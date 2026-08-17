import type { ReactNode } from "react";

import type { SeatingSummaryLine } from "@/lib/seating-summary";

import { SceneFrame } from "./Seat";

/**
 * The polished card wrapper shared by both seating visualisations: title,
 * illustration, positioned avatars, and a screen-reader description of the
 * exact same assignments the picture shows.
 */
export function SceneCard({
  title,
  icon,
  aspect,
  scene,
  children,
  summary,
  summaryTitle,
  footer,
}: {
  title: string;
  icon: ReactNode;
  aspect: string;
  /** The decorative illustration, rendered behind the seats. */
  scene: ReactNode;
  /** Positioned `<Seat>` elements. */
  children: ReactNode;
  summary: SeatingSummaryLine[];
  summaryTitle: string;
  /**
   * Optional caption strip along the bottom of the card, in the same shape the
   * pet cards use. The two seating scenes have nothing to say here — the
   * rotation panel above them already says it, for both at once — but a scene
   * that is the only one on its own clock needs to name that clock.
   */
  footer?: ReactNode;
}) {
  return (
    <section className="app-card themed-transition animate-soft-rise overflow-hidden">
      <header className="flex items-center gap-2.5 px-5 pb-1 pt-5 sm:px-6 sm:pt-6">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "var(--color-surface-muted)",
            color: "var(--color-primary)",
            border: "1px solid var(--color-border)",
          }}
        >
          {icon}
        </span>
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
      </header>

      <div className="px-3 pb-4 pt-2 sm:px-5 sm:pb-5">
        <SceneFrame aspect={aspect}>
          {scene}
          {children}
        </SceneFrame>
      </div>

      {/* The accessible equivalent of the illustration above. */}
      <div className="sr-only">
        <h3>{summaryTitle}</h3>
        <ul>
          {summary.map((line) => (
            <li key={line.id}>{line.text}</li>
          ))}
        </ul>
      </div>

      {footer ? (
        <p
          className="border-t px-5 py-3 text-sm sm:px-6"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface-muted)",
            color: "var(--color-text-muted)",
          }}
        >
          {footer}
        </p>
      ) : null}
    </section>
  );
}
