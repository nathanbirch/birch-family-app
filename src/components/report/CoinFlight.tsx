"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { CoinGlyph } from "../shop/CoinGlyph";

/** A point in the viewport, from `getBoundingClientRect()`. */
export type FlightPoint = { x: number; y: number };

/**
 * However many stars a child earned, this many coins are actually drawn.
 *
 * Above about twenty, individual coins stop being distinguishable inside a
 * two-second flight anyway — they read as a stream rather than a count — so
 * capping the DOM nodes costs nothing a child would notice. The cash pill
 * counting down in `ChildSlide` still reflects the true amount regardless of
 * how many coins are drawn; this is a visual, not the record of what happened.
 */
export const MAX_VISIBLE_COINS = 20;

/** How long the whole flock takes to land, in milliseconds. */
export const COIN_FLIGHT_MS = 2000;

/** How long one coin's own arc takes. Shorter than the flock so it can trail. */
const PER_COIN_MS = 700;

/**
 * A child's stars, converted, flying from their slide to the Shop tab.
 *
 * ---------------------------------------------------------------------------
 * WHY A PORTAL, AND WHY THIS FAR ABOVE EVERYTHING
 * ---------------------------------------------------------------------------
 * The starting point is inside a ceremony slide that is mid-transform (scaled
 * down and dimmed when it is not the active one — see `AwardCeremony`), and a
 * child of that slide would inherit its transform and animate from the wrong
 * place. Rendered into `document.body` instead, at a z-index above the bottom
 * nav bar (z-40), so the coins are seen sailing *over* it on their way into the
 * Shop tab rather than appearing to travel underneath it.
 *
 * ---------------------------------------------------------------------------
 * WHY EACH COIN IS ITS OWN ELEMENT WITH ITS OWN DELAY, NOT ONE ANIMATED GROUP
 * ---------------------------------------------------------------------------
 * "One by one" is the whole request. A single sprite moving once would read as
 * a coin, singular; a dozen elements launched at staggered delays reads as a
 * *pile* leaving one at a time, which is what a week's worth of stars turning
 * into coins is supposed to feel like. Confetti already establishes that this
 * many DOM nodes, animated purely on `transform`/`opacity`, cost nothing worth
 * measuring — see `components/stars/Confetti.tsx`.
 *
 * The parent (`ChildSlide`) owns the timer that unmounts this after
 * `COIN_FLIGHT_MS` — this component only draws the flock for as long as it is
 * mounted, matching the money pill it counts down in lockstep with.
 */
export function CoinFlight({
  from,
  to,
  count,
}: {
  from: FlightPoint;
  to: FlightPoint;
  /** How many coins to draw. Already capped by the caller — see `MAX_VISIBLE_COINS`. */
  count: number;
}) {
  const [coins] = useState(() => makeCoins(count));
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]">
      {coins.map((coin) => (
        <span
          key={coin.key}
          className="coin-flight-piece absolute"
          style={
            {
              left: from.x,
              top: from.y,
              width: coin.size,
              height: coin.size,
              marginLeft: -coin.size / 2,
              marginTop: -coin.size / 2,
              animationDelay: `${coin.delay}ms`,
              animationDuration: `${PER_COIN_MS}ms`,
              "--coin-dx": `${dx}px`,
              "--coin-dy": `${dy}px`,
              "--coin-arc": `${coin.arc}px`,
              "--coin-spin": `${coin.spin}deg`,
            } as React.CSSProperties
          }
        >
          <CoinGlyph className="h-full w-full" />
        </span>
      ))}
    </div>,
    document.body,
  );
}

type Coin = {
  key: number;
  delay: number;
  size: number;
  arc: number;
  spin: number;
};

function makeCoins(count: number): Coin[] {
  const spread = Math.max(0, COIN_FLIGHT_MS - PER_COIN_MS);
  return Array.from({ length: count }, (_, index) => ({
    key: index,
    // Evenly spaced across the flock's total travel time, not randomised —
    // an even trickle reads as "leaving one at a time"; a random scatter of
    // the same coins reads as noise.
    delay: count > 1 ? (spread * index) / (count - 1) : 0,
    size: 18 + Math.random() * 8,
    // A higher arc for a coin thrown early, so the flock doesn't move as one
    // flat sheet — some coins lob, some skim.
    arc: 40 + Math.random() * 60,
    spin: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360),
  }));
}
