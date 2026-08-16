/**
 * The Finger Picker's rules, with no screen attached.
 *
 * Pure functions only: the draw, the clock, and the geometry of the flood.
 * Keeping them out of the component is what makes the one thing that really
 * matters here testable — that the draw is fair, and that a finger which
 * lifted before the buzzer cannot win.
 */

import { PICKER_COLOURS, PICKER_SECONDS } from "@/config/picker";

/** What the pad is doing. */
export type PickerPhase =
  /** Nothing on the screen. The number sits at its starting value. */
  | "waiting"
  /** At least one finger is down and the clock is running. */
  | "counting"
  /** One has been drawn, and its colour is flooding the screen. */
  | "winner";

/**
 * The colour for a finger joining a round that already has these.
 *
 * The lowest colour nobody is holding, so the palette is walked in order — and
 * so a finger that lifts frees its colour for the next one down. Wrapping
 * round when all ten are taken is the honest failure: an eleventh finger gets
 * a repeat rather than an invisible circle, and eleven fingers on one iPad is
 * a party, not a use case.
 */
export function nextColourIndex(taken: readonly number[]): number {
  for (let index = 0; index < PICKER_COLOURS.length; index += 1) {
    if (!taken.includes(index)) return index;
  }
  return taken.length % PICKER_COLOURS.length;
}

/**
 * The number to show, given how much of the countdown is left.
 *
 * Rounded *up*, which is what makes the screen read the way a countdown should:
 * the moment the clock starts it says 5, and it says 1 for the whole of the
 * final second rather than flicking to 0 half a second early. Zero is never
 * displayed — the draw happens instead.
 */
export function countdownNumber(
  remainingMs: number,
  seconds: number = PICKER_SECONDS,
): number {
  if (remainingMs <= 0) return 0;
  return Math.min(seconds, Math.ceil(remainingMs / 1000));
}

/**
 * Which of `count` fingers wins, given a number from `Math.random()`.
 *
 * The randomness is passed in rather than taken, which is the entire reason
 * this is a function instead of one line at the call site: a draw that cannot
 * be tested is a draw nobody should trust, and this one is checked for an even
 * spread and for never returning an index that is not on the screen.
 *
 * Returns `-1` when there is nobody to choose from — every finger lifted
 * before the buzzer. The caller treats that as "no round happened".
 */
export function chooseIndex(count: number, random: number): number {
  if (count <= 0) return -1;
  const index = Math.floor(random * count);
  // `Math.random()` is documented as < 1, but a caller could hand us 1 exactly
  // and a picker that can return an off-the-end index is a crash waiting for a
  // birthday party.
  return Math.min(count - 1, Math.max(0, index));
}

/**
 * How much a circle must grow to cover the screen from where it stands.
 *
 * The circle is centred on the winning finger, so the distance it has to reach
 * is to the *furthest corner* — measuring to the nearest, or to the middle of
 * an edge, leaves a wedge of background showing in one corner for the rest of
 * the round.
 */
export function floodScale(
  centre: { x: number; y: number },
  viewport: { width: number; height: number },
  diameter: number,
): number {
  const corners = [
    { x: 0, y: 0 },
    { x: viewport.width, y: 0 },
    { x: 0, y: viewport.height },
    { x: viewport.width, y: viewport.height },
  ];

  let furthest = 0;
  for (const corner of corners) {
    furthest = Math.max(furthest, Math.hypot(corner.x - centre.x, corner.y - centre.y));
  }

  // A hair over, so a rounded pixel at the edge cannot leave a seam.
  return (furthest * 2.02) / Math.max(diameter, 1);
}
