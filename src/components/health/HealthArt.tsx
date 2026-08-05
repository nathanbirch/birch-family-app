import type { JSX } from "react";

import type { HealthSectionId } from "@/config/health";

/**
 * A picture for each of the five lists.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE DON'T USE THE THEME TOKENS
 * ---------------------------------------------------------------------------
 * Every other surface in this app is drawn from `--color-*`, so it restyles
 * itself when someone picks a new theme. These five deliberately do not. They
 * are the one thing on the page a five-year-old navigates by — the red apple
 * *is* the body list — and a picture that changes colour with the theme stops
 * being a landmark. They are flat, bright and always the same, and the card
 * around them still themes normally so they never look pasted on.
 *
 * The palette below is also what tints each card: a wash of `soft` behind the
 * drawing and `ink` on the little "N things" pill. Both are chosen to sit on a
 * white or a near-black surface without vibrating, since the themes include
 * both.
 *
 * Drawn on a 96x96 grid with plain shapes and no gradients: they have to stay
 * readable at 56px on a phone card, and they are inline SVG rather than files
 * so they cost no request and are available offline for free.
 */

export type HealthPalette = {
  /** The card wash and the circle behind the drawing. */
  soft: string;
  /** Text and pill colour — dark enough to read on the wash. */
  ink: string;
};

export const HEALTH_PALETTE: Record<HealthSectionId, HealthPalette> = {
  body: { soft: "#ffe4e4", ink: "#c02a3f" },
  mind: { soft: "#e6ecff", ink: "#3949b0" },
  emotions: { soft: "#ffe8f2", ink: "#b83a7e" },
  spirit: { soft: "#fff2d6", ink: "#a8631a" },
  home: { soft: "#dff3e6", ink: "#1f7a4d" },
};

/** Face parts, so all five smile the same way. */
function Face({
  x,
  y,
  scale = 1,
  dark = "#2b2b3a",
}: {
  x: number;
  y: number;
  scale?: number;
  dark?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx={-7} cy={0} r={2.6} fill={dark} />
      <circle cx={7} cy={0} r={2.6} fill={dark} />
      <path
        d="M-7 7.5a7.6 7.6 0 0 0 14 0"
        fill="none"
        stroke={dark}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </g>
  );
}

/** An apple with a leaf, a shine and a smile — the body list. */
function BodyArt() {
  return (
    <>
      <path
        d="M48 30c6-5 15-5 20 1 6 7 5 20-1 30-4 6-9 9-13 9-3 0-4-1.5-6-1.5S45 70 42 70c-4 0-9-3-13-9-6-10-7-23-1-30 5-6 14-6 20-1Z"
        fill="#ef4b5c"
      />
      <path
        d="M48 30c-3-8-1-14 4-18 1 7 0 13-4 18Z"
        fill="#7a4a2b"
      />
      <path
        d="M50 22c6-6 14-6 18-3-3 7-11 10-18 3Z"
        fill="#3fae63"
      />
      <ellipse
        cx={36}
        cy={44}
        rx={5}
        ry={7.5}
        fill="#ffffff"
        opacity={0.45}
        transform="rotate(-22 36 44)"
      />
      <Face x={48} y={48} />
    </>
  );
}

/** An open book with a lightbulb over it — the mind list. */
function MindArt() {
  return (
    <>
      <circle cx={48} cy={26} r={13} fill="#ffd83d" />
      <path
        d="M48 6v-5M31 26h-5M70 26h-5M34.6 12.6 31 9M61.4 12.6 65 9"
        stroke="#ffb703"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <rect x={43} y={37} width={10} height={5} rx={2.5} fill="#c98a12" />
      <path
        d="M10 52c11-5 22-5 33 1v33c-11-6-22-6-33-1Z"
        fill="#5b6ee0"
      />
      <path
        d="M86 52c-11-5-22-5-33 1v33c11-6 22-6 33-1Z"
        fill="#7f8ef0"
      />
      <path
        d="M43 53c2-1.5 6-1.5 10 0v33c-4-1.5-8-1.5-10 0Z"
        fill="#3b4bc0"
      />
      <path
        d="M18 61h17M18 69h17M61 61h17M61 69h17"
        stroke="#ffffff"
        strokeWidth={2.6}
        strokeLinecap="round"
        opacity={0.75}
      />
      <Face x={48} y={24} scale={0.85} />
    </>
  );
}

/** A big smiling heart — the emotions list. */
function EmotionsArt() {
  return (
    <>
      <path
        d="M48 84C26 68 12 56 12 41c0-11 8-19 18-19 7 0 13 4 18 11 5-7 11-11 18-11 10 0 18 8 18 19 0 15-14 27-36 43Z"
        fill="#f4699f"
      />
      <ellipse
        cx={31}
        cy={38}
        rx={6}
        ry={8}
        fill="#ffffff"
        opacity={0.35}
        transform="rotate(-25 31 38)"
      />
      <Face x={48} y={44} scale={1.15} />
      <circle cx={30} cy={54} r={4} fill="#ff9ec4" />
      <circle cx={66} cy={54} r={4} fill="#ff9ec4" />
    </>
  );
}

/** The sun, warm and awake — the spirit list. */
function SpiritArt() {
  return (
    <>
      <g stroke="#ffb703" strokeWidth={4.5} strokeLinecap="round">
        <path d="M48 4v10M48 82v10M4 48h10M82 48h10" />
        <path d="M17 17l7 7M72 72l7 7M79 17l-7 7M24 72l-7 7" />
      </g>
      <circle cx={48} cy={48} r={26} fill="#ffd83d" />
      <circle cx={48} cy={48} r={26} fill="none" stroke="#ffc21c" strokeWidth={3} />
      <circle cx={34} cy={52} r={4.5} fill="#ffab5e" opacity={0.7} />
      <circle cx={62} cy={52} r={4.5} fill="#ffab5e" opacity={0.7} />
      <Face x={48} y={45} scale={1.1} />
    </>
  );
}

/** A little house with a heart in the window — the whole-family list. */
function HomeArt() {
  return (
    <>
      <path d="M48 10 8 44h80L48 10Z" fill="#e2564b" />
      <rect x={17} y={44} width={62} height={42} rx={5} fill="#f7d9a8" />
      <rect x={17} y={44} width={62} height={42} rx={5} fill="none" stroke="#d9b47c" strokeWidth={2.5} />
      <rect x={40} y={60} width={16} height={26} rx={3} fill="#8a5a3b" />
      <circle cx={52} cy={73} r={1.8} fill="#ffd83d" />
      <rect x={23} y={53} width={13} height={13} rx={3} fill="#bfe7ff" />
      <rect x={60} y={53} width={13} height={13} rx={3} fill="#bfe7ff" />
      <path
        d="M48 40c-8-6-13-10-13-15 0-4 3-7 6.5-7 2.6 0 4.9 1.5 6.5 4 1.6-2.5 3.9-4 6.5-4 3.5 0 6.5 3 6.5 7 0 5-5 9-13 15Z"
        fill="#ff8fb1"
      />
    </>
  );
}

const ART: Record<HealthSectionId, () => JSX.Element> = {
  body: BodyArt,
  mind: MindArt,
  emotions: EmotionsArt,
  spirit: SpiritArt,
  home: HomeArt,
};

/**
 * The drawing for one list, in a tinted circle.
 *
 * Purely decorative: the section's title is always right next to it, so the
 * SVG is hidden from screen readers rather than repeating the heading.
 */
export function HealthArt({
  id,
  className,
}: {
  id: HealthSectionId;
  className?: string;
}) {
  const Drawing = ART[id];

  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      <circle cx={48} cy={48} r={48} fill={HEALTH_PALETTE[id].soft} />
      <Drawing />
    </svg>
  );
}
