/**
 * A shiny gold coin, embossed with a star.
 *
 * Coins in this app are converted stars (see `convertWeekToCoins`), so the
 * coin's face riffs on that rather than borrowing real-world currency
 * iconography (no "$") — it is the same star shape from `StarGlyph`, pressed
 * into the coin like a mint mark, so a child can tell at a glance that a
 * coin *is* a star that grew up.
 *
 * Flat vector shapes only, matching `StarGlyph` and `Avatar`'s illustration
 * style: no gradients or filters, just a base fill, a darker rim stroke for
 * the bevel, a soft translucent highlight for shine, and the embossed star
 * a shade darker than the coin face. `--color-coin` / `--color-coin-dark`
 * are gold on every theme, for the same reason `--color-star` is — see
 * `globals.css`.
 */
export function CoinGlyph({
  className = "h-5 w-5",
  color = "var(--color-coin)",
  colorDark = "var(--color-coin-dark)",
}: {
  className?: string;
  color?: string;
  colorDark?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Face */}
      <circle cx="12" cy="12" r="10.5" fill={color} />
      {/* Rim groove, set slightly inside the edge for a struck-coin look. */}
      <circle
        cx="12"
        cy="12"
        r="8.6"
        fill="none"
        stroke={colorDark}
        strokeWidth="1.1"
        opacity="0.45"
      />
      {/* Embossed star, the same outline `StarGlyph` uses, scaled down. */}
      <path
        d="m12 6.6 1.55 3.15 3.45.5-2.5 2.45.6 3.45L12 14.5l-3.1 1.65.6-3.45-2.5-2.45 3.45-.5Z"
        fill={colorDark}
        opacity="0.4"
      />
      {/* Gloss highlight, upper-left, same soft-bevel trick as `Avatar`. */}
      <ellipse
        cx="8.6"
        cy="7.8"
        rx="3.6"
        ry="2.1"
        fill="#ffffff"
        opacity="0.4"
        transform="rotate(-28 8.6 7.8)"
      />
      {/* Bottom-edge shading, so the coin reads as slightly domed rather than flat. */}
      <path
        d="M4.2 15.6a9 9 0 0 0 15.6 0"
        fill="none"
        stroke={colorDark}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.22"
      />
    </svg>
  );
}
