"use client";

import { useState } from "react";

/**
 * Confetti, drawn with nothing but divs.
 *
 * No library and no canvas. A canvas would need a render loop, a resize
 * observer and a reason to exist; forty absolutely-positioned rectangles
 * animated by a single CSS keyframe are handed straight to the compositor,
 * cost nothing on the main thread while a child is still tapping stars, and —
 * the reason that settles it — work offline in an installed PWA without adding
 * a byte to the bundle that has to be cached.
 *
 * Two sizes, both driven from here:
 *
 *   `section` — one chart's column finished. Falls inside that card.
 *   `page`    — every star for one whole day. Falls across the screen.
 *
 * The pieces are generated **once, when the burst mounts**, and held in state.
 * Generating them during render would reshuffle the whole burst on every
 * unrelated re-render — and there are plenty of those while a transition is in
 * flight — which reads as a stutter rather than as falling paper.
 *
 * It is `aria-hidden`: the celebration is also announced in words by the board,
 * and five dozen decorative divs are noise read aloud. Under
 * `prefers-reduced-motion` the pieces are hidden entirely by `globals.css`, so
 * the words are all that is left — which is the right outcome, not a
 * degraded one.
 */

export type ConfettiScope = "section" | "page";

type Piece = {
  /** Percentage across the container. */
  left: number;
  /** Horizontal drift in px by the time it lands. */
  drift: number;
  /**
   * How far it falls, **in pixels**.
   *
   * Not a percentage, which is the trap here: a percentage inside `transform:
   * translate3d()` resolves against the *element's own* box, not its
   * container, so `105%` moved each piece about thirteen pixels and the
   * confetti twitched instead of falling.
   */
  fall: number;
  rotation: number;
  delay: number;
  duration: number;
  color: string;
  width: number;
  height: number;
  round: boolean;
};

export function Confetti({
  scope,
  colors,
}: {
  scope: ConfettiScope;
  /** The child's own colours plus the star gold — see `StarsBoard`. */
  colors: readonly string[];
}) {
  const [pieces] = useState(() => makePieces(scope, colors));

  return (
    <div
      aria-hidden="true"
      data-confetti={scope}
      className={
        scope === "page"
          ? "pointer-events-none fixed inset-0 z-50 overflow-hidden"
          : "pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius-card)]"
      }
    >
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="confetti-piece absolute block"
          style={
            {
              left: `${piece.left}%`,
              top: "-8%",
              width: `${piece.width}px`,
              height: `${piece.height}px`,
              backgroundColor: piece.color,
              borderRadius: piece.round ? "9999px" : "2px",
              animationDelay: `${piece.delay}ms`,
              animationDuration: `${piece.duration}ms`,
              "--confetti-drift": `${piece.drift}px`,
              "--confetti-fall": `${piece.fall}px`,
              "--confetti-spin": `${piece.rotation}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * How long a burst needs to be on screen, in milliseconds.
 *
 * Exported so the board removes the burst exactly when the last piece has
 * landed: sooner and paper vanishes mid-air, later and an invisible overlay
 * sits on the page for no reason.
 */
export const CONFETTI_DURATION_MS = 2600;

function makePieces(scope: ConfettiScope, colors: readonly string[]): Piece[] {
  const page = scope === "page";
  const count = page ? 70 : 34;

  /*
   * How far a piece has to travel to leave the screen, or to cross a card.
   *
   * The page burst measures the viewport — it is only ever created in the
   * browser, in response to a tap, but the fallback keeps it honest if that
   * ever stops being true. A card's height is not known here and does not need
   * to be: the overlay clips anything that overshoots, and every card on this
   * page is shorter than 560px.
   */
  const distance =
    page && typeof window !== "undefined" ? window.innerHeight * 1.15 : 560;

  return Array.from({ length: count }, () => {
    const round = Math.random() < 0.3;
    const size = 6 + Math.random() * 7;
    return {
      left: Math.random() * 100,
      // Signed drift, so the burst spreads both ways rather than sliding off
      // to one side.
      drift: (Math.random() - 0.5) * (page ? 260 : 160),
      fall: distance * (0.85 + Math.random() * 0.35),
      rotation: (Math.random() - 0.5) * 1080,
      delay: Math.random() * 320,
      duration: 1500 + Math.random() * 900,
      color: colors[Math.floor(Math.random() * colors.length)],
      width: round ? size : size * 0.7,
      height: size,
      round,
    };
  });
}
