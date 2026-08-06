import type { JSX } from "react";

import type { BoredCategoryId } from "@/config/bored";

/**
 * A picture for every idea on the Bored Page.
 *
 * ---------------------------------------------------------------------------
 * THE DRAWINGS ARE THE INTERFACE
 * ---------------------------------------------------------------------------
 * Every other page in this app uses pictures to decorate words. This one uses
 * words to caption pictures, because the child most likely to be bored is the
 * four-year-old who cannot read. If a drawing is not recognisable at 56px
 * without its label, it has failed and needs redrawing — not a longer label.
 *
 * That is the test to apply when adding one: cover the caption, look at it on
 * a phone, and see whether you can still tell what it is.
 *
 * ---------------------------------------------------------------------------
 * WHY THEY IGNORE THE THEME TOKENS
 * ---------------------------------------------------------------------------
 * Same reason as `HealthArt`, and it matters more here because there are
 * forty-three of them: these are landmarks. The red-and-black ladybird *is*
 * "find bugs", and a child who has learned that should find it in the same
 * colours tomorrow whichever of the ten themes is on. The card around each one
 * themes normally, so they never look pasted on.
 *
 * Flat shapes on a 96x96 grid, no gradients, no strokes finer than 2 units.
 * Inline SVG rather than files: no request, no layout shift, and available
 * offline the moment the page has been opened once.
 */

/** The shared palette. Bright, and legible on both a white and a near-black card. */
const C = {
  red: "#ef4b5c",
  rust: "#c2410c",
  orange: "#f4913e",
  yellow: "#f7c948",
  gold: "#e0a32e",
  lime: "#8dc63f",
  green: "#3fae63",
  forest: "#1f7a4d",
  teal: "#2bb3a3",
  sky: "#7cc4ef",
  blue: "#4a7fe0",
  navy: "#2f4a8a",
  indigo: "#5b5bd6",
  purple: "#a05ad6",
  pink: "#ef6fa8",
  brown: "#8a5a34",
  wood: "#c98b3c",
  tan: "#e8c9a0",
  grey: "#9aa3b2",
  slate: "#5d6b7f",
  dark: "#2b2b3a",
  paper: "#f7f4ec",
  white: "#ffffff",
} as const;

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

/** The three-spark twinkle that marks a "now it is clean" job. */
function Sparkle({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={C.yellow}>
      <path d="M0-9 2.2-2.2 9 0 2.2 2.2 0 9-2.2 2.2-9 0-2.2-2.2Z" />
    </g>
  );
}

/** A wheel, used by the bike, the scooter, the mower and the bins. */
function Wheel({ x, y, r, tyre = C.dark }: { x: number; y: number; r: number; tyre?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={tyre} />
      <circle cx={x} cy={y} r={r * 0.42} fill={C.white} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* The three categories                                                */
/* ------------------------------------------------------------------ */

/**
 * A sofa and a lamp — Inside. A house would collide with the Home tab.
 *
 * The first version of this read unmistakably as a *car*: a wide body, a
 * lighter panel across the middle that became a windscreen, and two dark
 * rounded shapes at the ends that became wheels. What fixes it is the pair of
 * back cushions with a seam between them — no car has those — plus arms that
 * are clearly lower than the back, and a throw pillow.
 *
 * The lamp shade is a trapezoid rather than a triangle for the same reason: a
 * triangle on a stick is a road sign.
 */
function InsideArt() {
  return (
    <>
      {/* Lamp, behind the sofa's right arm. */}
      <path d="M66 18h18l7 20H59Z" fill={C.yellow} />
      <rect x={73} y={38} width={4} height={38} rx={2} fill={C.slate} />
      <rect x={64} y={74} width={22} height={6} rx={3} fill={C.slate} />

      {/* Two back cushions, seamed — the part that stops it being a car. */}
      <rect x={6} y={30} width={26} height={26} rx={7} fill={C.indigo} />
      <rect x={34} y={30} width={26} height={26} rx={7} fill={C.indigo} />

      {/* Arms, clearly lower than the back. */}
      <rect x={2} y={46} width={12} height={22} rx={6} fill={C.navy} />
      <rect x={52} y={46} width={12} height={22} rx={6} fill={C.navy} />

      {/* Seat. */}
      <rect x={6} y={52} width={54} height={18} rx={6} fill={C.blue} />
      <rect x={18} y={38} width={16} height={16} rx={4} fill={C.pink} />

      <rect x={9} y={69} width={7} height={9} rx={2.5} fill={C.brown} />
      <rect x={50} y={69} width={7} height={9} rx={2.5} fill={C.brown} />
    </>
  );
}

/** A tree and a sun — Outside. */
function OutsideArt() {
  return (
    <>
      <circle cx={72} cy={24} r={13} fill={C.yellow} />
      <rect x={6} y={74} width={84} height={8} rx={4} fill={C.lime} />
      <rect x={38} y={50} width={9} height={28} rx={3} fill={C.brown} />
      <circle cx={42} cy={40} r={22} fill={C.forest} />
      <circle cx={26} cy={46} r={14} fill={C.green} />
      <circle cx={58} cy={45} r={13} fill={C.green} />
    </>
  );
}

/** A stack of coins with the Dad Bucks bar on the top one — Money. */
function MoneyArt() {
  return (
    <>
      <ellipse cx={48} cy={72} rx={30} ry={9} fill={C.gold} />
      <rect x={18} y={58} width={60} height={14} fill={C.gold} />
      <ellipse cx={48} cy={58} rx={30} ry={9} fill={C.yellow} />
      <rect x={18} y={44} width={60} height={14} fill={C.gold} />
      <ellipse cx={48} cy={44} rx={30} ry={9} fill={C.yellow} />
      <rect x={18} y={30} width={60} height={14} fill={C.gold} />
      <ellipse cx={48} cy={30} rx={30} ry={9} fill={C.yellow} />
      {/* The barred D, drawn rather than typeset so it needs no font. */}
      <path
        d="M40 22h9a8 8 0 0 1 0 16h-9Z"
        fill="none"
        stroke={C.rust}
        strokeWidth={4}
      />
      <path d="M35 30h12" stroke={C.rust} strokeWidth={4} strokeLinecap="round" />
    </>
  );
}

export const BORED_CATEGORY_ART: Record<BoredCategoryId, () => JSX.Element> = {
  inside: InsideArt,
  outside: OutsideArt,
  money: MoneyArt,
};

export type BoredPalette = {
  /** The card wash and the circle behind each drawing. */
  soft: string;
  /** Text and price-pill colour — dark enough to read on the wash. */
  ink: string;
};

/**
 * A colour per category, so a child knows which of the three sections they are
 * in without reading the heading.
 *
 * These are the same three washes the health lists use for mind, home and
 * spirit. Reusing them is deliberate: the app should look like one app, and
 * three brand-new tints would have been three more colours to keep legible
 * across ten themes for no gain.
 */
export const BORED_PALETTE: Record<BoredCategoryId, BoredPalette> = {
  inside: { soft: "#e6ecff", ink: "#3949b0" },
  outside: { soft: "#dff3e6", ink: "#1f7a4d" },
  money: { soft: "#fff2d6", ink: "#a8631a" },
};

/* ------------------------------------------------------------------ */
/* Inside                                                              */
/* ------------------------------------------------------------------ */

const INSIDE_ART: Record<string, () => JSX.Element> = {
  reading: () => (
    <>
      <path d="M48 30c-8-7-20-8-32-5v42c12-3 24-2 32 5Z" fill={C.paper} />
      <path d="M48 30c8-7 20-8 32-5v42c-12-3-24-2-32 5Z" fill={C.white} />
      <path d="M48 30v42" stroke={C.red} strokeWidth={5} />
      <path
        d="M24 38h16M24 47h16M56 38h16M56 47h16"
        stroke={C.grey}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </>
  ),

  drawing: () => (
    <>
      <rect x={16} y={16} width={52} height={62} rx={5} fill={C.white} />
      <path
        d="M26 60c6-16 12-16 18-4s12 8 18-10"
        fill="none"
        stroke={C.blue}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <circle cx={34} cy={32} r={7} fill={C.red} />
      <rect
        x={68}
        y={20}
        width={12}
        height={44}
        rx={3}
        fill={C.yellow}
        transform="rotate(16 74 42)"
      />
      <path d="M79 66 84 79 71 76Z" fill={C.tan} />
      <path d="M77 76 84 79 82 73Z" fill={C.dark} />
    </>
  ),

  writing: () => (
    <>
      <rect x={18} y={14} width={48} height={66} rx={5} fill={C.white} />
      <rect x={18} y={14} width={9} height={66} rx={4} fill={C.red} />
      <path
        d="M34 30h24M34 41h24M34 52h24M34 63h14"
        stroke={C.grey}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      <path d="M84 18 60 52l-2 12 11-5 23-33Z" fill={C.teal} />
      <path d="M58 64l11-5-6-6Z" fill={C.dark} />
    </>
  ),

  puzzle: () => (
    <>
      <path
        d="M14 16h26v8a7 7 0 1 1 14 0v-8h26v26h-8a7 7 0 1 0 0 14h8v26H54v-8a7 7 0 1 0-14 0v8H14Z"
        fill={C.purple}
      />
      <path
        d="M40 42h-8a7 7 0 1 1 0-14h8Z"
        fill={C.yellow}
      />
      <circle cx={62} cy={62} r={9} fill={C.yellow} />
    </>
  ),

  lego: () => (
    <>
      <rect x={10} y={40} width={76} height={34} rx={5} fill={C.red} />
      <rect x={17} y={28} width={16} height={14} rx={4} fill={C.red} />
      <rect x={40} y={28} width={16} height={14} rx={4} fill={C.red} />
      <rect x={63} y={28} width={16} height={14} rx={4} fill={C.red} />
      <rect x={17} y={28} width={16} height={7} rx={3.5} fill="#ff7a86" />
      <rect x={40} y={28} width={16} height={7} rx={3.5} fill="#ff7a86" />
      <rect x={63} y={28} width={16} height={7} rx={3.5} fill="#ff7a86" />
      <rect x={10} y={64} width={76} height={10} rx={5} fill="#c62c3c" />
    </>
  ),

  blocks: () => (
    <>
      <rect x={10} y={54} width={30} height={30} rx={4} fill={C.blue} />
      <rect x={44} y={54} width={30} height={30} rx={4} fill={C.green} />
      <rect x={27} y={22} width={30} height={30} rx={4} fill={C.yellow} />
      <path d="M62 52 76 22 90 52Z" fill={C.red} />
      <circle cx={42} cy={37} r={7} fill={C.white} />
    </>
  ),

  playdough: () => (
    <>
      <path
        d="M14 46c0-9 9-14 20-14s20 5 20 14v22c0 5-9 8-20 8s-20-3-20-8Z"
        fill={C.teal}
      />
      <ellipse cx={34} cy={46} rx={20} ry={7} fill="#57d6c6" />
      <path
        d="M58 74c0-8 8-12 14-8s10-2 14-6"
        fill="none"
        stroke={C.pink}
        strokeWidth={9}
        strokeLinecap="round"
      />
      <circle cx={70} cy={34} r={11} fill={C.yellow} />
    </>
  ),

  /*
   * White cards on the pale lavender wash were very nearly invisible — the
   * tile looked empty. They are outlined now, and the back one is tinted, so
   * the fan reads as cards rather than as a blank square.
   */
  cards: () => (
    <>
      <rect
        x={8}
        y={28}
        width={36}
        height={50}
        rx={5}
        fill={C.navy}
        stroke={C.dark}
        strokeWidth={2.5}
        transform="rotate(-18 26 53)"
      />
      <rect
        x={22}
        y={26}
        width={36}
        height={50}
        rx={5}
        fill={C.white}
        stroke={C.dark}
        strokeWidth={2.5}
        transform="rotate(-7 40 51)"
      />
      <rect
        x={44}
        y={22}
        width={38}
        height={54}
        rx={5}
        fill={C.white}
        stroke={C.dark}
        strokeWidth={2.5}
      />
      <path d="M63 36c5-7 14-2 0 12-14-14-5-19 0-12Z" fill={C.red} />
      <path d="M38 46c4-6 11-2 0 9-11-11-4-15 0-9Z" fill={C.dark} transform="rotate(-7 40 51)" />
    </>
  ),

  boardgame: () => (
    <>
      <rect x={10} y={26} width={58} height={58} rx={5} fill={C.white} />
      <path
        d="M10 26h14v14H10Zm28 0h15v14H38Zm-14 14h14v14H24Zm29 0h15v14H53ZM10 54h14v14H10Zm28 0h15v14H38Zm-14 14h14v16H24Zm29 0h15v16H53Z"
        fill={C.navy}
      />
      <rect
        x={58}
        y={12}
        width={30}
        height={30}
        rx={7}
        fill={C.white}
        transform="rotate(14 73 27)"
      />
      <g fill={C.red}>
        <circle cx={66} cy={22} r={3.4} />
        <circle cx={80} cy={25} r={3.4} />
        <circle cx={71} cy={35} r={3.4} />
      </g>
    </>
  ),

  piano: () => (
    <>
      <rect x={8} y={30} width={80} height={40} rx={5} fill={C.white} />
      <rect x={8} y={30} width={80} height={8} rx={4} fill={C.dark} />
      <path
        d="M22 38v32M36 38v32M50 38v32M64 38v32M78 38v32"
        stroke={C.grey}
        strokeWidth={2.4}
      />
      <g fill={C.dark}>
        <rect x={17} y={38} width={9} height={20} rx={2} />
        <rect x={31} y={38} width={9} height={20} rx={2} />
        <rect x={59} y={38} width={9} height={20} rx={2} />
        <rect x={73} y={38} width={9} height={20} rx={2} />
      </g>
      <rect x={8} y={66} width={80} height={6} rx={3} fill={C.brown} />
    </>
  ),

  baking: () => (
    <>
      <path d="M14 44h68a34 34 0 0 1-68 0Z" fill={C.sky} />
      <rect x={10} y={38} width={76} height={8} rx={4} fill={C.white} />
      <rect x={30} y={72} width={36} height={7} rx={3.5} fill={C.grey} />
      <path
        d="M62 40 74 12"
        stroke={C.wood}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <circle cx={34} cy={22} r={9} fill={C.pink} />
      <circle cx={52} cy={16} r={6} fill={C.yellow} />
    </>
  ),

  /*
   * A blanket den, not a swing. The first version draped a sheet *between* two
   * posts, which is a hammock — the same shape as the hammock tile two
   * categories over. A den is a sheet over the top with a dark way in, so that
   * is what this draws: the opening is the thing that makes it a fort.
   */
  fort: () => (
    <>
      <path
        d="M48 10c-4 0-7 2-9 6L10 76c-1 3 1 6 4 6h68c3 0 5-3 4-6L57 16c-2-4-5-6-9-6Z"
        fill={C.pink}
      />
      <path d="M48 10c-4 0-7 2-9 6L24 82h24Z" fill="#ffa8c9" />
      <path d="M48 82V44c-10 0-17 17-17 38Z" fill={C.dark} />
      <path d="M48 82V44c10 0 17 17 17 38Z" fill={C.dark} />
      <circle cx={48} cy={6} r={5} fill={C.yellow} />
      <ellipse cx={70} cy={74} rx={12} ry={7} fill={C.yellow} />
    </>
  ),
};

/* ------------------------------------------------------------------ */
/* Outside                                                             */
/* ------------------------------------------------------------------ */

const OUTSIDE_ART: Record<string, () => JSX.Element> = {
  trampoline: () => (
    <>
      <ellipse cx={48} cy={50} rx={40} ry={16} fill={C.navy} />
      <ellipse cx={48} cy={47} rx={33} ry={11} fill={C.dark} />
      <path
        d="M18 56 12 82M78 56 84 82M34 60l-6 22M62 60l6 22"
        stroke={C.slate}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <circle cx={48} cy={22} r={11} fill={C.yellow} />
      <path
        d="M40 30 30 40M56 30l10 10"
        stroke={C.yellow}
        strokeWidth={6}
        strokeLinecap="round"
      />
    </>
  ),

  basketball: () => (
    <>
      <rect x={62} y={12} width={26} height={22} rx={3} fill={C.white} />
      <rect x={68} y={22} width={14} height={10} fill="none" stroke={C.rust} strokeWidth={3} />
      <path d="M64 36h22" stroke={C.rust} strokeWidth={4} strokeLinecap="round" />
      <path d="M67 38l4 10h8l4-10Z" fill={C.white} opacity={0.9} />
      <circle cx={34} cy={58} r={24} fill={C.orange} />
      <path
        d="M34 34v48M10 58h48M17 41c10 10 10 24 0 34M51 41c-10 10-10 24 0 34"
        fill="none"
        stroke={C.rust}
        strokeWidth={2.6}
      />
    </>
  ),

  bike: () => (
    <>
      <Wheel x={24} y={62} r={19} tyre={C.dark} />
      <Wheel x={74} y={62} r={19} tyre={C.dark} />
      <path
        d="M24 62 44 34h16L74 62M44 34 38 62h36"
        fill="none"
        stroke={C.teal}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M38 30h14" stroke={C.dark} strokeWidth={5} strokeLinecap="round" />
      <path d="M58 28h12" stroke={C.dark} strokeWidth={5} strokeLinecap="round" />
    </>
  ),

  scooter: () => (
    <>
      <Wheel x={22} y={70} r={13} tyre={C.dark} />
      <Wheel x={76} y={70} r={13} tyre={C.dark} />
      <path d="M18 62h50" stroke={C.purple} strokeWidth={8} strokeLinecap="round" />
      <path
        d="M68 64V22"
        stroke={C.slate}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path d="M56 20h24" stroke={C.dark} strokeWidth={7} strokeLinecap="round" />
      <path d="M68 62 76 66" stroke={C.slate} strokeWidth={6} strokeLinecap="round" />
    </>
  ),

  hammock: () => (
    <>
      <rect x={10} y={24} width={7} height={58} rx={3} fill={C.brown} />
      <rect x={79} y={24} width={7} height={58} rx={3} fill={C.brown} />
      <path
        d="M13 34c14 34 56 34 70 0"
        fill="none"
        stroke={C.teal}
        strokeWidth={12}
        strokeLinecap="round"
      />
      <path
        d="M22 44c12 22 40 22 52 0"
        fill="none"
        stroke="#57d6c6"
        strokeWidth={5}
      />
      <circle cx={70} cy={22} r={9} fill={C.yellow} />
    </>
  ),

  /*
   * A shoe. The first version was a dashed winding path, and at 56px a dashed
   * stroke is not a path — it is a scatter of unrelated dots, which is exactly
   * how it rendered. A trainer is one solid object and says "walk" on its own.
   */
  walk: () => (
    <>
      <path
        d="M12 66V44c0-3 3-5 6-4l8 3 12-14c2-3 6-3 8 0l5 8c3 5 9 9 17 11 8 2 14 5 14 11v3Z"
        fill={C.teal}
      />
      <path
        d="M26 43 20 50M34 36l-6 8M42 30l-4 7"
        stroke={C.white}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      <rect x={8} y={62} width={78} height={13} rx={6} fill={C.white} />
      <rect x={8} y={70} width={78} height={7} rx={3.5} fill={C.slate} />
      <circle cx={72} cy={50} r={5} fill={C.white} />
    </>
  ),

  climb: () => (
    <>
      <rect x={42} y={40} width={12} height={44} rx={4} fill={C.brown} />
      <path d="M48 56 24 44" stroke={C.brown} strokeWidth={8} strokeLinecap="round" />
      <circle cx={48} cy={32} r={26} fill={C.forest} />
      <circle cx={26} cy={36} r={15} fill={C.green} />
      <circle cx={70} cy={36} r={14} fill={C.green} />
      <circle cx={22} cy={52} r={7} fill={C.red} />
      <path d="M22 59v9" stroke={C.dark} strokeWidth={4} strokeLinecap="round" />
    </>
  ),

  chalk: () => (
    <>
      <rect x={10} y={64} width={76} height={20} rx={4} fill={C.grey} />
      <path
        d="M18 76h20M46 76h14M66 76h12"
        stroke={C.white}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <rect
        x={20}
        y={16}
        width={13}
        height={40}
        rx={5}
        fill={C.pink}
        transform="rotate(-16 26 36)"
      />
      <rect
        x={44}
        y={14}
        width={13}
        height={40}
        rx={5}
        fill={C.yellow}
        transform="rotate(6 50 34)"
      />
      <rect
        x={66}
        y={18}
        width={13}
        height={40}
        rx={5}
        fill={C.sky}
        transform="rotate(20 72 38)"
      />
    </>
  ),

  bubbles: () => (
    <>
      <circle cx={62} cy={30} r={18} fill={C.sky} opacity={0.75} />
      <circle cx={56} cy={24} r={4} fill={C.white} />
      <circle cx={30} cy={22} r={10} fill={C.sky} opacity={0.75} />
      <circle cx={78} cy={62} r={12} fill={C.sky} opacity={0.75} />
      <circle cx={34} cy={54} r={7} fill={C.sky} opacity={0.75} />
      <path d="M14 84 30 62" stroke={C.purple} strokeWidth={7} strokeLinecap="round" />
      <ellipse
        cx={33}
        cy={58}
        rx={9}
        ry={6}
        fill="none"
        stroke={C.purple}
        strokeWidth={5}
      />
    </>
  ),

  bugs: () => (
    <>
      <ellipse cx={44} cy={54} rx={26} ry={28} fill={C.red} />
      <path d="M44 26v56" stroke={C.dark} strokeWidth={4} />
      <circle cx={44} cy={26} r={11} fill={C.dark} />
      <g fill={C.dark}>
        <circle cx={31} cy={44} r={5} />
        <circle cx={57} cy={46} r={5} />
        <circle cx={34} cy={64} r={4.4} />
        <circle cx={55} cy={66} r={4.4} />
      </g>
      <path
        d="M38 18 32 8M50 18 56 8"
        stroke={C.dark}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      <circle cx={76} cy={30} r={15} fill="none" stroke={C.slate} strokeWidth={5} />
      <path d="M87 41 94 48" stroke={C.slate} strokeWidth={6} strokeLinecap="round" />
    </>
  ),

  kubb: () => (
    <>
      <rect x={6} y={74} width={84} height={8} rx={4} fill={C.lime} />
      <g fill={C.wood}>
        <rect x={12} y={46} width={14} height={28} rx={2} />
        <rect x={32} y={46} width={14} height={28} rx={2} />
        <rect x={52} y={46} width={14} height={28} rx={2} />
      </g>
      <rect x={72} y={30} width={11} height={44} rx={4} fill={C.brown} />
      <rect
        x={26}
        y={16}
        width={9}
        height={34}
        rx={4}
        fill={C.tan}
        transform="rotate(52 30 33)"
      />
    </>
  ),

  croquet: () => (
    <>
      <rect x={6} y={74} width={84} height={8} rx={4} fill={C.lime} />
      <path
        d="M22 76V50a14 14 0 0 1 28 0v26"
        fill="none"
        stroke={C.slate}
        strokeWidth={6}
      />
      <circle cx={68} cy={66} r={13} fill={C.red} />
      <path d="M68 53v26" stroke={C.white} strokeWidth={4} />
      <rect
        x={66}
        y={10}
        width={9}
        height={34}
        rx={3}
        fill={C.brown}
        transform="rotate(24 70 27)"
      />
      <rect
        x={74}
        y={8}
        width={20}
        height={11}
        rx={3}
        fill={C.wood}
        transform="rotate(24 84 13)"
      />
    </>
  ),
};

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

const MONEY_ART: Record<string, () => JSX.Element> = {
  bins: () => (
    <>
      <path d="M20 30h56l-5 46a6 6 0 0 1-6 5H31a6 6 0 0 1-6-5Z" fill={C.green} />
      <rect x={14} y={20} width={68} height={11} rx={5} fill={C.forest} />
      <rect x={38} y={12} width={20} height={8} rx={4} fill={C.forest} />
      <path
        d="M40 42v30M56 42v30"
        stroke={C.forest}
        strokeWidth={4}
        strokeLinecap="round"
      />
    </>
  ),

  weeds: () => (
    <>
      <rect x={6} y={66} width={84} height={18} rx={4} fill={C.brown} />
      <path
        d="M44 66c0-16-10-22-20-24 6 14 12 20 20 24Z"
        fill={C.green}
      />
      <path
        d="M48 66c0-18 10-26 22-28-6 16-14 24-22 28Z"
        fill={C.lime}
      />
      <path d="M46 68V40" stroke={C.forest} strokeWidth={5} strokeLinecap="round" />
      <circle cx={46} cy={30} r={11} fill={C.yellow} />
      <circle cx={46} cy={30} r={5} fill={C.gold} />
    </>
  ),

  socks: () => (
    <>
      <path
        d="M22 12h20v34c0 10 16 12 16 24s-10 16-18 16-16-6-16-16Z"
        fill={C.pink}
      />
      <path d="M22 12h20v12H22Z" fill="#ffa8c9" />
      <path
        d="M56 20h18v30c0 9 14 11 14 22s-9 14-16 14-14-5-14-14Z"
        fill={C.sky}
        transform="rotate(10 70 50)"
      />
    </>
  ),

  sweep: () => (
    <>
      <path
        d="M60 14 44 62"
        stroke={C.wood}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <path d="M30 58h32l8 24H22Z" fill={C.tan} />
      <path
        d="M30 68h48M26 76h52"
        stroke={C.brown}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={20} cy={26} r={4} fill={C.grey} />
      <circle cx={30} cy={38} r={3} fill={C.grey} />
    </>
  ),

  "laundry-wash": () => (
    <>
      <rect x={12} y={12} width={72} height={72} rx={9} fill={C.white} />
      <rect x={12} y={12} width={72} height={16} rx={8} fill={C.sky} />
      <circle cx={70} cy={20} r={4} fill={C.blue} />
      <circle cx={48} cy={54} r={24} fill={C.sky} />
      <circle cx={48} cy={54} r={17} fill={C.blue} />
      <path
        d="M33 54c6-6 12 6 18 0s9-4 12 0"
        fill="none"
        stroke={C.white}
        strokeWidth={4}
        strokeLinecap="round"
      />
    </>
  ),

  dishwasher: () => (
    <>
      <ellipse cx={40} cy={72} rx={32} ry={9} fill={C.sky} />
      <ellipse cx={40} cy={66} rx={32} ry={9} fill={C.white} />
      <ellipse cx={40} cy={54} rx={25} ry={7} fill={C.sky} />
      <ellipse cx={40} cy={49} rx={25} ry={7} fill={C.white} />
      <path
        d="M62 44h16v18a8 8 0 0 1-16 0Z"
        fill={C.white}
      />
      <path d="M78 48h6a5 5 0 0 1 0 10h-6Z" fill="none" stroke={C.white} strokeWidth={4} />
      <Sparkle x={78} y={22} s={0.9} />
      <Sparkle x={22} y={26} s={0.6} />
    </>
  ),

  bathroom: () => (
    <>
      <rect x={18} y={34} width={30} height={44} rx={6} fill={C.sky} />
      <rect x={26} y={22} width={14} height={14} rx={3} fill={C.blue} />
      <path d="M40 26h16v8H40Z" fill={C.blue} />
      <path d="M56 22h10v12H56Z" fill={C.slate} />
      <rect x={24} y={44} width={18} height={12} rx={3} fill={C.white} />
      <Sparkle x={72} y={40} s={1} />
      <Sparkle x={82} y={64} s={0.7} />
      <Sparkle x={64} y={68} s={0.55} />
    </>
  ),

  vacuum: () => (
    <>
      <path
        d="M56 22c14 0 22 10 22 24v18H44V46c0-14 4-24 12-24Z"
        fill={C.purple}
      />
      <rect x={30} y={64} width={56} height={14} rx={6} fill={C.indigo} />
      <Wheel x={40} y={78} r={7} tyre={C.dark} />
      <Wheel x={76} y={78} r={7} tyre={C.dark} />
      <path
        d="M44 52C28 52 18 60 14 78"
        fill="none"
        stroke={C.slate}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <circle cx={62} cy={40} r={7} fill={C.white} />
    </>
  ),

  windows: () => (
    <>
      <rect x={12} y={12} width={56} height={60} rx={5} fill={C.sky} />
      <path d="M40 12v60M12 42h56" stroke={C.white} strokeWidth={5} />
      <rect
        x={12}
        y={12}
        width={56}
        height={60}
        rx={5}
        fill="none"
        stroke={C.brown}
        strokeWidth={6}
      />
      <rect
        x={64}
        y={54}
        width={28}
        height={9}
        rx={4}
        fill={C.blue}
        transform="rotate(-38 78 58)"
      />
      <path
        d="M84 40 92 28"
        stroke={C.slate}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Sparkle x={26} y={30} s={0.7} />
    </>
  ),

  room: () => (
    <>
      <rect x={8} y={54} width={80} height={22} rx={5} fill={C.blue} />
      <rect x={8} y={38} width={14} height={38} rx={5} fill={C.navy} />
      <rect x={26} y={44} width={26} height={14} rx={5} fill={C.white} />
      <path d="M52 50h34v8H52Z" fill={C.pink} />
      <rect x={12} y={76} width={8} height={8} rx={2} fill={C.brown} />
      <rect x={76} y={76} width={8} height={8} rx={2} fill={C.brown} />
      <Sparkle x={70} y={26} s={0.9} />
      <Sparkle x={84} y={40} s={0.6} />
    </>
  ),

  "laundry-away": () => (
    <>
      <path d="M18 44h60l-6 38H24Z" fill={C.tan} />
      <path
        d="M22 56h52M20 68h56"
        stroke={C.brown}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      <rect x={26} y={26} width={26} height={16} rx={3} fill={C.pink} />
      <rect x={50} y={20} width={26} height={22} rx={3} fill={C.sky} />
      <rect x={36} y={14} width={22} height={12} rx={3} fill={C.yellow} />
    </>
  ),

  "car-inside": () => (
    <>
      <path
        d="M14 60c0-6 4-8 8-9l8-16c1-3 4-5 7-5h30c3 0 6 2 7 5l8 16c4 1 8 3 8 9v10H14Z"
        fill={C.teal}
      />
      <path d="M34 38h28l5 12H29Z" fill={C.sky} />
      <Wheel x={30} y={70} r={10} tyre={C.dark} />
      <Wheel x={66} y={70} r={10} tyre={C.dark} />
      <Sparkle x={80} y={20} s={0.9} />
      <Sparkle x={18} y={26} s={0.6} />
    </>
  ),

  leaves: () => (
    <>
      <path d="M60 12 44 52" stroke={C.wood} strokeWidth={8} strokeLinecap="round" />
      <path
        d="M28 54h34l4 8H24Z"
        fill={C.slate}
      />
      <path
        d="M26 62 20 82M36 62l-3 20M48 62l3 20M60 62l6 20"
        stroke={C.slate}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <ellipse cx={22} cy={40} rx={10} ry={7} fill={C.orange} transform="rotate(-30 22 40)" />
      <ellipse cx={76} cy={54} rx={10} ry={7} fill={C.red} transform="rotate(24 76 54)" />
      <ellipse cx={82} cy={30} rx={9} ry={6} fill={C.gold} transform="rotate(-14 82 30)" />
    </>
  ),

  "car-wash": () => (
    <>
      <path
        d="M14 62c0-6 4-8 8-9l8-16c1-3 4-5 7-5h30c3 0 6 2 7 5l8 16c4 1 8 3 8 9v10H14Z"
        fill={C.red}
      />
      <path d="M34 40h28l5 12H29Z" fill={C.sky} />
      <Wheel x={30} y={72} r={10} tyre={C.dark} />
      <Wheel x={66} y={72} r={10} tyre={C.dark} />
      <circle cx={24} cy={20} r={9} fill={C.sky} opacity={0.8} />
      <circle cx={48} cy={12} r={7} fill={C.sky} opacity={0.8} />
      <circle cx={72} cy={22} r={11} fill={C.sky} opacity={0.8} />
    </>
  ),

  snow: () => (
    <>
      <path d="M6 68h84a58 58 0 0 1-84 0Z" fill={C.white} />
      <path
        d="M60 14 42 50"
        stroke={C.wood}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <path d="M20 44h30l6 22H14Z" fill={C.slate} />
      <g fill={C.sky}>
        <circle cx={78} cy={22} r={5} />
        <circle cx={64} cy={34} r={4} />
        <circle cx={86} cy={44} r={4} />
      </g>
    </>
  ),

  lawn: () => (
    <>
      <rect x={6} y={74} width={84} height={8} rx={4} fill={C.lime} />
      <path
        d="M74 70V38a6 6 0 0 0-6-6H30"
        fill="none"
        stroke={C.slate}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path d="M18 44h20v8H18Z" fill={C.dark} />
      <rect x={14} y={48} width={54} height={24} rx={6} fill={C.red} />
      <Wheel x={26} y={74} r={9} tyre={C.dark} />
      <Wheel x={58} y={74} r={9} tyre={C.dark} />
      <path
        d="M76 68c6 0 8 4 8 8"
        fill="none"
        stroke={C.slate}
        strokeWidth={6}
        strokeLinecap="round"
      />
    </>
  ),
};

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

const BORED_ART: Record<string, () => JSX.Element> = {
  ...INSIDE_ART,
  ...OUTSIDE_ART,
  ...MONEY_ART,
};

/** Every id that has a drawing. `tests/bored.test.ts` checks it matches the config. */
export const BORED_ART_IDS: readonly string[] = Object.keys(BORED_ART);

/**
 * One idea's picture.
 *
 * An id with no drawing renders nothing rather than throwing. A missing
 * picture is a gap on a page; an exception is the whole page gone, and this is
 * the page a child opens when they are already fed up. The test suite is what
 * stops a gap shipping — see `tests/bored.test.ts`.
 */
export function BoredArt({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const Draw = BORED_ART[id];
  if (!Draw) return null;

  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true">
      <Draw />
    </svg>
  );
}

/** One category's picture — the three cards on the front of the page. */
export function BoredCategoryArt({
  id,
  className,
}: {
  id: BoredCategoryId;
  className?: string;
}) {
  const Draw = BORED_CATEGORY_ART[id];

  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true">
      <Draw />
    </svg>
  );
}
