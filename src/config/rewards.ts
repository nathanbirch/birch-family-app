/**
 * What a star is worth.
 *
 * ---------------------------------------------------------------------------
 * A NICKEL A STAR
 * ---------------------------------------------------------------------------
 * Five cents, and the number is doing more work than it looks like it is. A
 * full week for the eldest is about 110 stars, which comes out around $5.50 —
 * enough to be worth chasing on a Wednesday evening and small enough that a
 * good week does not have to be argued about. It is also a coin the younger
 * two can hold, which is the whole reason it is a nickel rather than three
 * cents or a tenth of a dollar.
 *
 * Stored in **cents**, never in dollars. Money as a floating-point number of
 * dollars is the oldest arithmetic bug there is: 0.05 cannot be represented
 * exactly, so 47 stars would come out at $2.3500000000000005 in front of a
 * child who is counting. Integers all the way, and the formatting happens once,
 * at the very end, in `formatMoney()`.
 *
 * This is not yet a promise the app keeps track of: nothing here records what
 * has been *paid*. The weekly report says what a week was worth, and the
 * handing over of actual coins happens in the kitchen. When the Rewards page
 * arrives it will be the thing that owes somebody money; this file will still
 * be the only place the rate is written down.
 */

/** What one star is worth, in cents. */
export const CENTS_PER_STAR = 5;

/** What a pile of stars is worth, in cents. */
export function centsForStars(stars: number): number {
  return Math.max(0, Math.round(stars)) * CENTS_PER_STAR;
}

/**
 * Cents as money, e.g. `235` -> `"$2.35"`.
 *
 * Deliberately not `Intl.NumberFormat`: this is read by five children in one
 * currency, in one country, and `Intl` would let the device's locale decide
 * whether that is `$2.35`, `2,35 $` or `US$2.35` — three different answers to
 * a question that has one. It is also the same hydration trap the date
 * formatting note in `lib/dates.ts` describes, and this way the server and the
 * browser cannot print different strings.
 */
export function formatMoney(cents: number): string {
  const safe = Math.max(0, Math.round(cents));
  const dollars = Math.floor(safe / 100);
  const remainder = String(safe % 100).padStart(2, "0");
  return `$${dollars}.${remainder}`;
}
