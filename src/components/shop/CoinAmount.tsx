import { CountUp } from "@/components/report/CountUp";

import { CoinGlyph } from "./CoinGlyph";

/**
 * A coin amount, everywhere one is shown — the balance on `/shop`, a
 * reward's cost, a family goal's progress, an admin's catalogue row.
 *
 * Always the number first and the glyph after ("12 🪙"), matching the
 * pattern the shop already used with the placeholder emoji it replaces.
 * `animate` composes in `CountUp` for the same drum-roll landing the
 * ceremony's totals use — pass it for the moments that deserve one (a
 * balance settling after a purchase, a total arriving) and leave it off for
 * a plain list row, where a number quietly counting up would be noise.
 */
export function CoinAmount({
  amount,
  animate = false,
  durationMs = 700,
  delayMs = 0,
  className = "",
  glyphClassName = "h-4 w-4",
}: {
  amount: number;
  animate?: boolean;
  durationMs?: number;
  delayMs?: number;
  className?: string;
  glyphClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <span>
        {animate ? (
          <CountUp target={amount} durationMs={durationMs} delayMs={delayMs} />
        ) : (
          amount
        )}
      </span>
      <CoinGlyph className={glyphClassName} />
    </span>
  );
}
