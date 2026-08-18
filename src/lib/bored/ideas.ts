/**
 * A bored idea, as a value.
 *
 * Pure functions and the one shape the page renders. Nothing here imports React,
 * MongoDB or `next`, so the same trimming, ordering and validation runs on the
 * server when the grid is rendered, in the browser when somebody adds an idea,
 * and in a unit test with neither.
 *
 * ---------------------------------------------------------------------------
 * ONE SHAPE FOR BOTH KINDS OF IDEA
 * ---------------------------------------------------------------------------
 * There are two sorts of idea on this page and they are drawn differently: the
 * thirty-nine built-ins have a hand-drawn SVG keyed by their id, and a
 * family-added one has an emoji. The temptation is two types and a union, and it
 * is the wrong call — every consumer would then branch, and the grid, the sort
 * and the tests would all have to know which sort of thing they were holding.
 *
 * So there is one `BoredItem`, and `emoji` is `null` for a built-in. The tile
 * asks for a drawing first and falls back to the emoji, which means a built-in
 * whose drawing is ever deleted degrades to an emoji rather than to a blank
 * square — and a *custom* idea can never accidentally shadow a drawing, because
 * `newIdeaId()` prefixes every id it issues.
 */

import {
  BORED_CATEGORIES,
  IDEA_LABEL_MAX_LENGTH,
  IDEA_PRICE_MAX,
  IDEA_PRICE_MIN,
  type BoredCategoryId,
  type BoredIdea,
} from "@/config/bored";

/** One idea on the page, however it got there. */
export type BoredItem = {
  /**
   * Stable, and the key into `BORED_ART`. A built-in's is the id declared in
   * `config/bored.ts`; a family-added one's comes from `newIdeaId()`.
   */
  id: string;
  label: string;
  /** Money ideas only. `null` everywhere else. */
  price: number | null;
  /** `null` for a built-in, which has a drawing instead. */
  emoji: string | null;
  /** Added from inside the app — which is what makes it removable from inside it. */
  custom: boolean;
};

/* -------------------------------------------------------------------------- */
/* Ids                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Everything the family adds is `own-` something.
 *
 * The prefix is load-bearing rather than decorative. Ids are the key into the
 * drawings, so an id that collided with a built-in's would silently swap a
 * child's emoji for a picture of a trampoline — and `own-` is a namespace no
 * built-in id can be in, because a test asserts none of them starts with it.
 *
 * The suffix is random rather than a slug of the label: two people adding
 * "Bake" on the same evening must be two ideas, or the second one would fail
 * against a unique index and look like a bug.
 */
const CUSTOM_PREFIX = "own-";

const ID_PATTERN = /^own-[0-9a-z]{10}$/;

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function newIdeaId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length];
  return CUSTOM_PREFIX + suffix;
}

/** Is this an id this app issued for a family-added idea? */
export function isCustomIdeaId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Tidy up what was typed.
 *
 * Trimmed and with runs of whitespace collapsed, then cut to the ceiling —
 * trimmed rather than refused, because somebody typing a long idea into a
 * twenty-character box should get an idea, not an error. The box stops them
 * first anyway; this is what makes that true of the *stored* value too.
 */
export function normaliseLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, IDEA_LABEL_MAX_LENGTH);
}

/** Is there anything left after tidying it up? */
export function isUsableLabel(raw: string): boolean {
  return normaliseLabel(raw).length > 0;
}

/**
 * A price the Money grid can live with, or `null`.
 *
 * `null` is the right answer for the two categories that have no prices at all,
 * and it is also what a nonsense number becomes — the action refuses those
 * rather than storing them, so this never silently drops a price somebody meant.
 */
export function normalisePrice(
  categoryId: BoredCategoryId,
  raw: unknown,
): number | null {
  if (categoryId !== "money") return null;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < IDEA_PRICE_MIN || raw > IDEA_PRICE_MAX) return null;
  return raw;
}

/**
 * The idea already on this grid that `label` would duplicate, if any.
 *
 * Case- and space-insensitive, so "puzzle" finds "Puzzle". It searches the
 * built-ins as well as the family's own, because "already here" is a statement
 * about the page rather than about who put it there.
 *
 * It lives in this module rather than in the store so that **the browser can ask
 * the same question the Server Action asks**, before drawing anything. That is not
 * a nicety: adding something already on the page is the most likely way an add
 * fails, and a tile that appears and then vanishes a moment later is a worse
 * answer than one that never appears. The action still checks — two phones cannot
 * see each other's screens — but the common case never needs the round trip.
 */
export function findLabelClash(
  items: readonly BoredItem[],
  label: string,
): BoredItem | null {
  const wanted = comparableLabel(label);
  if (!wanted) return null;
  return items.find((item) => comparableLabel(item.label) === wanted) ?? null;
}

function comparableLabel(label: string): string {
  return normaliseLabel(label).toLocaleLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The order a category's grid is drawn in.
 *
 * Two rules, because the three categories are read in two different ways:
 *
 *   **Money is sorted by price, cheapest first.** That was always true and used
 *   to be a property of the order the array happened to be written in. Now that
 *   a child can add a job, it has to be enforced rather than maintained by hand
 *   — a Đ2 job appended to the end would break the one thing that makes this
 *   grid legible without headings or a filter. See docs/bored.md.
 *
 *   **Inside and Outside keep the curated order, with the family's own at the
 *   end.** The built-in order runs roughly quietest to busiest, which is worth
 *   keeping; and new ideas grouped at the bottom is both where somebody who has
 *   just added one will look and an honest signal about which ones are ours.
 *
 * Stable in both cases: two jobs at the same price, or two ideas added in the
 * same second, keep the order they were read in.
 */
export function sortCategoryItems(
  categoryId: BoredCategoryId,
  items: readonly BoredItem[],
): BoredItem[] {
  const sorted = [...items];

  if (categoryId === "money") {
    sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    return sorted;
  }

  sorted.sort((a, b) => Number(a.custom) - Number(b.custom));
  return sorted;
}

/* -------------------------------------------------------------------------- */
/* The compiled defaults                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A built-in idea from `config/bored.ts` as the thing the page renders.
 *
 * One function, used by the seed *and* by the fallback the store uses when the
 * database cannot be reached — so "what a built-in looks like" has one
 * definition rather than two that can drift apart.
 */
export function toBoredItem(idea: BoredIdea): BoredItem {
  return {
    id: idea.id,
    label: idea.label,
    price: idea.price ?? null,
    emoji: null,
    custom: false,
  };
}

/**
 * The compiled defaults, in the page's shape, keyed by category.
 *
 * Used by three callers that must not disagree: the store's fallback when the
 * cluster is unreachable, the seed script that writes the built-ins into the
 * database, and the tests. It lives **here** rather than in the store beside its
 * main consumer for a mechanical reason — the store imports `"server-only"`,
 * which throws when it is pulled into a plain `tsx` process, and the seed script
 * is one.
 */
export function compiledItems(): Record<BoredCategoryId, BoredItem[]> {
  const result = emptyByCategory();
  for (const category of BORED_CATEGORIES) {
    result[category.id] = category.ideas.map(toBoredItem);
  }
  return result;
}

/** An empty bucket per category, so no caller has to enumerate the three ids. */
export function emptyByCategory(): Record<BoredCategoryId, BoredItem[]> {
  return Object.fromEntries(
    BORED_CATEGORIES.map((category) => [category.id, [] as BoredItem[]]),
  ) as Record<BoredCategoryId, BoredItem[]>;
}
