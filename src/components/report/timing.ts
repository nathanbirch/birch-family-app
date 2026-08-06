/**
 * The ceremony's clock.
 *
 * Every delay on a slide, and the moment it turns over, come from here — the
 * CSS reveals read these as inline `--reveal-delay` values, the count-up reads
 * them, and the auto-advance timer reads them. One source, so the slide cannot
 * turn while a number is still counting, and the progress bar under the rail
 * cannot promise a different moment from the one the timer will pick.
 *
 * The shape of a slide, in order:
 *
 *   0.12s  the child's face and name
 *   0.70s  the first chart line, then one every 0.42s
 *   +0.72s the grand total, which then counts up over 0.9s
 *   +5.00s the hold — the number sits there, big, while everybody looks at it
 *          — and then the slide turns.
 *
 * Five seconds was asked for and five seconds is what it is. It is longer than
 * it looks written down: read "sixty-three stars, three dollars fifteen" aloud
 * and there is still time left over, which is about right for a room with five
 * children in it.
 */

/** The child's name and face. */
export const NAME_DELAY_MS = 120;

/** The first of the three chart lines. */
export const FIRST_CHART_DELAY_MS = 700;

/** And each one after it. */
export const CHART_GAP_MS = 420;

/** How long after the last chart line the grand total lands. */
const TOTAL_GAP_MS = 720;

/** How long the total takes to count up from zero. */
export const COUNT_UP_MS = 900;

/** How long the finished slide is held before it turns over. */
export const HOLD_MS = 5000;

/** When chart line `index` slides in. */
export function chartDelayMs(index: number): number {
  return FIRST_CHART_DELAY_MS + index * CHART_GAP_MS;
}

/** When the grand total lands, given how many charts came before it. */
export function totalDelayMs(chartCount: number): number {
  return chartDelayMs(Math.max(0, chartCount - 1)) + TOTAL_GAP_MS;
}

/** The whole slide: reveals, then the count-up, then the five-second hold. */
export function childSlideMs(chartCount: number): number {
  return totalDelayMs(chartCount) + COUNT_UP_MS + HOLD_MS;
}
