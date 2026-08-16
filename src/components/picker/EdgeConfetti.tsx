"use client";

import { useState } from "react";

/**
 * Confetti thrown in from all four sides of the screen.
 *
 * The sibling of `components/stars/Confetti.tsx`, and built the same way and
 * for the same reasons: absolutely-positioned divs driven by one CSS keyframe,
 * no canvas, no library, no bytes added to what the service worker has to
 * cache. Read the note at the top of that file for the full argument.
 *
 * What is different is the direction. The star charts drop paper from above,
 * which is what confetti does at a party. This one is fired *inward* from
 * every edge at once, which is what a party popper does — and the difference
 * matters here, because the winning colour is simultaneously flooding outward
 * from the middle. Paper falling downward through an expanding disc reads as
 * two unrelated things happening; paper converging on it reads as one.
 *
 * The pieces are generated once when the burst mounts and held in state, so an
 * unrelated re-render — and the countdown causes plenty — cannot reshuffle a
 * burst that is already in the air.
 */

export type BurstPiece = {
  /** Where it starts, as a percentage of the screen. */
  left: number;
  top: number;
  /** Total horizontal travel, in pixels. */
  x: number;
  /** Where it is at the top of its arc, and where it finishes. */
  y1: number;
  y2: number;
  spin: number;
  delay: number;
  duration: number;
  colour: string;
  width: number;
  height: number;
  round: boolean;
};

/**
 * How much paper each edge throws.
 *
 * Sixty a side, so 240 in all — a little under the star charts' biggest burst,
 * because this one lands on a screen that has just turned a single flat
 * colour and has nothing else on it to compete with. The star charts' 280 are
 * fighting a page full of cards.
 */
const PER_EDGE = 60;

/** The four edges pieces are launched from. */
const EDGES = ["top", "bottom", "left", "right"] as const;

export function EdgeConfetti({ colours }: { colours: readonly string[] }) {
  const [pieces] = useState(() => makePieces(colours));

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
    >
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="burst-piece absolute block"
          style={
            {
              left: `${piece.left}%`,
              top: `${piece.top}%`,
              width: `${piece.width}px`,
              height: `${piece.height}px`,
              backgroundColor: piece.colour,
              borderRadius: piece.round ? "9999px" : "2px",
              animationDelay: `${piece.delay}ms`,
              animationDuration: `${piece.duration}ms`,
              "--burst-x": `${piece.x}px`,
              "--burst-y1": `${piece.y1}px`,
              "--burst-y2": `${piece.y2}px`,
              "--burst-spin": `${piece.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * How long the burst is on screen, in milliseconds.
 *
 * Exported so the picker can drop the whole overlay the moment the last piece
 * has gone, rather than leaving 240 invisible elements sitting over a screen
 * that is about to be tapped.
 */
export const BURST_DURATION_MS = 2400;

function makePieces(colours: readonly string[]): BurstPiece[] {
  /*
   * The viewport, or a sensible guess. The burst is only ever created in the
   * browser in response to a draw, but the fallback keeps the maths honest if
   * that ever stops being true — a NaN here would freeze every piece at the
   * edge it started from.
   */
  const width = typeof window === "undefined" ? 900 : window.innerWidth;
  const height = typeof window === "undefined" ? 700 : window.innerHeight;

  const pieces: BurstPiece[] = [];

  for (const edge of EDGES) {
    const vertical = edge === "top" || edge === "bottom";

    for (let i = 0; i < PER_EDGE; i += 1) {
      const size = 7 + Math.random() * 8;
      const round = Math.random() < 0.3;

      /*
       * Each piece is fired square to the edge it came from, with a wide
       * sideways spread — *not* aimed at the middle of the screen.
       *
       * Aiming at the middle is the obvious version and it is wrong: two
       * hundred and forty pieces converging on one point spend the whole
       * flight bunching into a knot in the centre and reach the edges never.
       * A cannon along each edge fills the screen, which is what "confetti
       * from all four sides" is asking for.
       */
      const along = Math.random() * 100;
      // How far across the screen it gets — some barely clear the edge, some
      // sail past the far side.
      const reach = 0.45 + Math.random() * 0.8;
      // Sideways wander, so a straight line of cannons does not produce a
      // straight line of paper.
      const spread = (Math.random() - 0.5) * 0.9;

      /*
       * Gravity, in the second half of the flight only. `y1` is where a piece
       * is at the top of its arc and `y2` where it finishes, so paper thrown
       * up from the bottom edge peaks and falls back, and paper thrown in
       * from the side sags on its way across.
       */
      const drop = height * (0.18 + Math.random() * 0.28);

      const left = vertical ? along : edge === "left" ? -4 : 104;
      const top = vertical ? (edge === "top" ? -6 : 106) : along;

      let x: number;
      let apex: number;

      if (edge === "top") {
        x = spread * width * 0.55;
        apex = reach * height;
      } else if (edge === "bottom") {
        x = spread * width * 0.55;
        apex = -reach * height;
      } else if (edge === "left") {
        x = reach * width;
        apex = spread * height * 0.55;
      } else {
        x = -reach * width;
        apex = spread * height * 0.55;
      }

      pieces.push({
        left,
        top,
        x,
        y1: apex,
        y2: apex + drop,
        spin: (Math.random() - 0.5) * 900,
        delay: Math.random() * 240,
        duration: 1500 + Math.random() * 800,
        colour: colours[Math.floor(Math.random() * colours.length)],
        width: round ? size : size * 0.62,
        height: size,
        round,
      });
    }
  }

  return pieces;
}
