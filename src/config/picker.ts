/**
 * The Finger Picker's numbers and colours.
 *
 * Every timing on this page is here rather than scattered through the
 * component, because they are the whole design: five seconds is long enough
 * for a fifth child to get a finger down and short enough that nobody lets go,
 * and the five-second hold afterwards is long enough to see who won and short
 * enough that the next round starts before the argument restarts.
 */

/** What the number starts at, and how many seconds it counts. */
export const PICKER_SECONDS = 5;

/** How long the winning colour holds the screen before the pad resets itself. */
export const PICKER_HOLD_MS = 5000;

/**
 * How long the winning colour takes to flood the screen.
 *
 * A full second, deliberately slower than it wants to be. The flood is not a
 * transition between two screens — it is the *announcement*, and it starts at
 * the winning finger. Watching it leave that spot is how everybody round the
 * table sees whose colour it was; at 900ms it was over before the five of them
 * had finished looking down at their own hands.
 */
export const PICKER_FLOOD_MS = 1000;

/** One full grow-and-shrink of a waiting circle. */
export const PICKER_PULSE_MS = 1400;

/**
 * How wide a finger circle is, in pixels.
 *
 * Bigger than a fingertip on purpose. The circle is not a cursor showing where
 * the finger is — everyone can already see where their own finger is — it is a
 * token showing that *you are in the draw*, and it has to read from across a
 * table with five hands over the screen. 132px is about the width of two
 * fingers, so a hand's worth of circles still separate.
 */
export const PICKER_CIRCLE_PX = 132;

export type PickerColour = {
  id: string;
  /** Spoken aloud by the live region when this colour wins. */
  label: string;
  hex: string;
  /**
   * Text laid over the flood when this colour wins.
   *
   * Chosen per colour rather than computed, because the palette is fixed and a
   * contrast calculation would only ever produce these same two answers — with
   * a rounding error somewhere in the middle waiting to make one round of the
   * game unreadable.
   */
  on: string;
};

/**
 * The circles.
 *
 * Ten, which is two hands, and they are assigned in this order — see
 * `nextColourIndex`. The order is not the order of a colour wheel: it is
 * arranged so that consecutive fingers get colours as far apart as possible,
 * because the first two circles on the screen are the ones most likely to be
 * side by side and the pair that must never be mistaken for each other.
 *
 * All ten are chosen to sit at full strength on the near-black background. A
 * dark colour would be a fair loser of the draw and an invisible winner.
 */
export const PICKER_COLOURS: readonly PickerColour[] = [
  { id: "rose", label: "Red", hex: "#ff4d6d", on: "#2a0009" },
  { id: "mint", label: "Green", hex: "#22e0a1", on: "#002418" },
  { id: "sky", label: "Blue", hex: "#38bdf8", on: "#001e2e" },
  { id: "amber", label: "Yellow", hex: "#ffc233", on: "#2b1c00" },
  { id: "violet", label: "Purple", hex: "#a78bfa", on: "#1a0f36" },
  { id: "lime", label: "Lime", hex: "#a3e635", on: "#1a2600" },
  { id: "magenta", label: "Pink", hex: "#f472b6", on: "#33051f" },
  { id: "cyan", label: "Turquoise", hex: "#22d3ee", on: "#00252c" },
  { id: "orange", label: "Orange", hex: "#fb7134", on: "#2d1000" },
  { id: "indigo", label: "Indigo", hex: "#6366f1", on: "#0d0f38" },
] as const;

/**
 * The dark the page is painted in.
 *
 * Fixed, and the only screen in the app that ignores the family's theme. Two
 * reasons: ten saturated circles need a neutral ground or they fight the
 * theme's own colour for attention, and the winning colour has to flood the
 * whole screen — a flood that lands on a pale theme looks like a bug, and on a
 * coloured one looks like the wrong colour won.
 */
export const PICKER_BACKGROUND = "#08080c";

/** The dimmed number and instructions on the waiting screen. */
export const PICKER_DIM = "#4b4b57";
