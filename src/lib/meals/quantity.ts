/**
 * Recipe quantities: reading what somebody typed, and writing numbers the way
 * a recipe card would.
 *
 * Pure — no React, no database — so the editor, the meal sheet, the shopping
 * list and the tests all share one definition of what "1 ½" means.
 *
 * ---------------------------------------------------------------------------
 * ONE STORED UNIT PER INGREDIENT, SEVERAL SPOKEN ONES
 * ---------------------------------------------------------------------------
 * Every ingredient is measured in exactly one unit in the database — sugar in
 * cups, butter in tablespoons — because that is what makes the price maths a
 * single multiplication. But nobody writes "0.1875 cup of sugar"; they write
 * "3 tbsp". So the two families of units that convert cleanly (volume and
 * weight) are converted *for display and for typing only*, and the stored
 * number never leaves the ingredient's own unit.
 */

const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

/**
 * "1 1/2", "1½", "3/4", ".5", "2" → a number. `null` for anything else,
 * including zero and negatives: a recipe line of nothing is a mistake, not an
 * amount.
 */
export function parseQuantity(raw: string): number | null {
  let text = raw.trim().replace(/,/g, ".");
  if (text.length === 0) return null;

  let total = 0;
  for (const [glyph, value] of Object.entries(UNICODE_FRACTIONS)) {
    if (text.includes(glyph)) {
      total += value;
      text = text.replace(glyph, " ").trim();
    }
  }

  if (text.length > 0) {
    // "1 1/2" or "1-1/2": a whole number, then a fraction.
    const mixed = /^(\d+)[\s-]+(\d+)\s*\/\s*(\d+)$/.exec(text);
    const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
    const decimal = /^(\d+\.?\d*|\.\d+)$/.exec(text);

    if (mixed) {
      const denominator = Number(mixed[3]);
      if (denominator === 0) return null;
      total += Number(mixed[1]) + Number(mixed[2]) / denominator;
    } else if (fraction) {
      const denominator = Number(fraction[2]);
      if (denominator === 0) return null;
      total += Number(fraction[1]) / denominator;
    } else if (decimal) {
      total += Number(decimal[1]);
    } else {
      return null;
    }
  }

  if (!Number.isFinite(total) || total <= 0) return null;
  return total;
}

/** The fractions a recipe card uses, and the glyph for each. */
const NICE_FRACTIONS: readonly [number, string][] = [
  [0, ""],
  [0.125, "⅛"],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [0.875, "⅞"],
  [1, ""],
];

/**
 * 1.5 → "1½", 0.333 → "⅓", 2.4 → "2.4".
 *
 * Snaps to the nearest eighth or third when it is within a hair of one, and
 * otherwise gives up to two decimals rather than inventing a fraction the
 * number is not.
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";

  const whole = Math.floor(value);
  const rest = value - whole;

  for (const [fraction, glyph] of NICE_FRACTIONS) {
    if (Math.abs(rest - fraction) < 0.02) {
      const base = fraction === 1 ? whole + 1 : whole;
      if (glyph === "") return String(base);
      return base === 0 ? glyph : `${base}${glyph}`;
    }
  }

  return String(Math.round(value * 100) / 100);
}

/* -------------------------------------------------------------------------- */
/* Units that convert                                                          */
/* -------------------------------------------------------------------------- */

/** Each unit in the family, as a multiple of its smallest member. */
const VOLUME: Record<string, number> = { tsp: 1, tbsp: 3, cup: 48 };
const WEIGHT: Record<string, number> = { oz: 1, lb: 16 };

function familyOf(unit: string): Record<string, number> | null {
  if (unit in VOLUME) return VOLUME;
  if (unit in WEIGHT) return WEIGHT;
  return null;
}

/**
 * The units a quantity of this ingredient can be typed in. Just its own for
 * anything counted ("egg", "can", "cup dry"), the whole family for the rest.
 */
export function unitChoices(unit: string): string[] {
  const family = familyOf(unit);
  return family ? Object.keys(family) : [unit];
}

/** `qty` of `from` expressed in `to`. Unconvertible pairs come back unchanged. */
export function convertQuantity(qty: number, from: string, to: string): number {
  if (from === to) return qty;
  const family = familyOf(from);
  if (!family || !(to in family)) return qty;
  return (qty * family[from]) / family[to];
}

/**
 * The unit a person would say this amount in.
 *
 * 0.1875 cup → 3 tbsp, 0.5 lb → 8 oz, 20 oz → 1¼ lb. Counted units are left
 * alone. The largest unit that keeps the number at least a quarter (for
 * volume) or a whole one (for weight) wins — "¼ cup" reads better than
 * "4 tbsp", but "½ lb" is said "8 oz" at the deli counter.
 */
export function friendlyAmount(
  qty: number,
  unit: string,
): { qty: number; unit: string } {
  if (unit in VOLUME) {
    const tsp = qty * VOLUME[unit];
    if (tsp >= VOLUME.cup / 4) return { qty: tsp / VOLUME.cup, unit: "cup" };
    if (tsp >= VOLUME.tbsp) return { qty: tsp / VOLUME.tbsp, unit: "tbsp" };
    return { qty: tsp, unit: "tsp" };
  }
  if (unit in WEIGHT) {
    const oz = qty * WEIGHT[unit];
    if (oz >= WEIGHT.lb) return { qty: oz / WEIGHT.lb, unit: "lb" };
    return { qty: oz, unit: "oz" };
  }
  return { qty, unit };
}

/* -------------------------------------------------------------------------- */
/* Saying it                                                                   */
/* -------------------------------------------------------------------------- */

/** Abbreviations and words that are the same one or many. */
const INVARIANT = new Set(["tsp", "tbsp", "oz", "lb", "g", "kg", "ml", "l", "each", "dozen"]);

const IRREGULAR: Record<string, string> = {
  tomato: "tomatoes",
  potato: "potatoes",
  loaf: "loaves",
  leaf: "leaves",
  knife: "knives",
};

function pluralWord(word: string): string {
  if (INVARIANT.has(word)) return word;
  if (word in IRREGULAR) return IRREGULAR[word];
  if (/(s|sh|ch|x|z)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/**
 * "cup" → "cups" when there is more than one of it.
 *
 * Only one word of a two-word unit changes, and which one depends on the
 * phrase: "cup dry" is "cups dry", but "hot dog" is "hot dogs". A trailing
 * adjective is the rarer shape, so it is the one listed.
 */
export function pluralUnit(unit: string, qty: number): string {
  if (qty <= 1 + 1e-9) return unit;
  const words = unit.split(" ");
  if (words.length === 2 && (words[1] === "dry" || words[1] === "cooked")) {
    return `${pluralWord(words[0])} ${words[1]}`;
  }
  words[words.length - 1] = pluralWord(words[words.length - 1]);
  return words.join(" ");
}

/** 0.1875, "cup" → "3 tbsp"; 2, "egg" → "2 eggs". */
export function describeAmount(qty: number, unit: string): string {
  const friendly = friendlyAmount(qty, unit);
  return `${formatQuantity(friendly.qty)} ${pluralUnit(friendly.unit, friendly.qty)}`;
}
