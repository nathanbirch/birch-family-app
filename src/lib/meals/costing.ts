/**
 * What a meal costs, and what is in it.
 *
 * Pure. The meal cards, the meal sheet, the plan, the shopping list and the
 * recipe editor's live preview all price a recipe through `costRecipe`, so
 * there is exactly one answer to "how much is taco night" anywhere in the app.
 *
 * ---------------------------------------------------------------------------
 * THE RULES, WHICH THE PAGE ALSO STATES OUT LOUD
 * ---------------------------------------------------------------------------
 *   - An ingredient costs its **cheapest price per unit** — each store's pack
 *     price divided by how many units are in *that store's* pack, since a
 *     Costco bag is not a Walmart bag. Which shop wins can differ from one
 *     ingredient to the next.
 *   - A recipe costs what it *uses*, not the packs it opens: half a bag of
 *     cheese is half a bag's price. (The shopping list is where whole packs
 *     are counted, because that is what the till charges.)
 *   - Sales tax is added to the recipe total.
 *   - Per person is the total divided by how many the recipe feeds; the family
 *     cost is that times `FAMILY_SIZE`.
 */

import {
  AUTO_TAG_RULES,
  FAMILY_SIZE,
  SALES_TAX_RATE,
} from "@/config/meals";

import type {
  IngredientView,
  Nutrition,
  PriceView,
  RecipeView,
} from "./types";

/** The pack a price is for: the store's own, or the ingredient's usual one. */
export function packOf(
  ingredient: IngredientView,
  price: PriceView,
): { label: string; units: number } {
  return price.packUnits && price.packUnits > 0
    ? { label: price.packLabel || ingredient.packLabel, units: price.packUnits }
    : { label: ingredient.packLabel, units: ingredient.packUnits };
}

/** Dollars per one of the ingredient's units at this price, before tax. */
export function perUnitAt(ingredient: IngredientView, price: PriceView): number | null {
  const { units } = packOf(ingredient, price);
  return price.price > 0 && units > 0 ? price.price / units : null;
}

/**
 * The price with the lowest cost **per unit**, or `null` if there is none.
 *
 * Per unit, not per pack: Costco's 5 lb bag is dearer than Walmart's 2 lb
 * one and still the better deal on the cheese itself. This is what a recipe
 * is costed at. What to actually *buy* is a different question, answered by
 * `bestBuy`, because nobody should open a 5 lb bag for one cup.
 */
export function cheapestPrice(ingredient: IngredientView): PriceView | null {
  let best: PriceView | null = null;
  let bestPerUnit = Infinity;
  for (const price of ingredient.prices) {
    const perUnit = perUnitAt(ingredient, price);
    if (perUnit !== null && perUnit < bestPerUnit) {
      best = price;
      bestPerUnit = perUnit;
    }
  }
  return best;
}

/** Dollars per one of the ingredient's units, before tax, at the cheapest store. */
export function unitCost(ingredient: IngredientView): number | null {
  const best = cheapestPrice(ingredient);
  return best ? perUnitAt(ingredient, best) : null;
}

export type BestBuy = {
  price: PriceView;
  /** Whole packs of this store's pack. */
  packs: number;
  packLabel: string;
  packUnits: number;
  /** What the till says, before tax. */
  cost: number;
};

/**
 * Where to buy `need` units for the least money today.
 *
 * Whole packs at every store, and the smallest bill wins. For a cup of cheese
 * that is the 2 lb bag at Walmart; for a party's worth it is the 5 lb bag at
 * Costco. Ties go to the cheaper per unit, since the extra is still food.
 */
export function bestBuy(ingredient: IngredientView, need: number): BestBuy | null {
  let best: BestBuy | null = null;
  for (const price of ingredient.prices) {
    const { label, units } = packOf(ingredient, price);
    if (!(price.price > 0) || !(units > 0)) continue;
    const packs = packsFor(need, units);
    const cost = packs * price.price;
    const better =
      !best ||
      cost < best.cost - 0.005 ||
      (Math.abs(cost - best.cost) <= 0.005 && price.price / units < best.price.price / best.packUnits);
    if (better) best = { price, packs, packLabel: label, packUnits: units, cost };
  }
  return best;
}

/** Whole packs covering `need`, never fewer than one. */
export function packsFor(need: number, packUnits: number): number {
  if (!(packUnits > 0)) return 1;
  // The epsilon forgives floating-point dust: 2 cups from four ½-cup lines is
  // one 2-cup pack, not two because the sum came out at 2.0000000000000004.
  return Math.max(1, Math.ceil(need / packUnits - 1e-9));
}

/**
 * When somebody last confirmed one of an ingredient's prices at a shop, or
 * `null` if nobody ever has.
 *
 * Starter estimates do not count: they were written down, not checked, and a
 * price book that said "checked today" beside a guess would be lying about the
 * one thing it exists to be honest about.
 */
export function lastChecked(ingredient: IngredientView): number | null {
  let newest: number | null = null;
  for (const price of ingredient.prices) {
    if (price.estimated) continue;
    if (newest === null || price.checkedAt > newest) newest = price.checkedAt;
  }
  return newest;
}

export type CostedLine = {
  ingredient: IngredientView | null;
  ingredientId: string;
  /** Scaled to the servings asked for. */
  qty: number;
  note: string;
  /** Before tax. `null` when the ingredient has no price. */
  cost: number | null;
};

export type CostedRecipe = {
  /** Every line, at the scale asked for. */
  lines: CostedLine[];
  /** How many the scaled recipe feeds. */
  servings: number;
  /** Before tax, at the scale asked for. */
  subtotal: number;
  tax: number;
  total: number;
  /** Independent of scale. `null` when the recipe does not say how many it feeds. */
  perPerson: number | null;
  /** `perPerson × FAMILY_SIZE`. */
  family: number | null;
  /** Whether every line has a price. When not, the numbers above are a floor. */
  priced: boolean;
  /** Names of the ingredients with no price. */
  unpriced: string[];
  /** Per person. `null` when there is nothing to divide by. */
  nutrition: Nutrition | null;
  /** Names of the ingredients with no nutrition, so the totals are low. */
  missingNutrition: string[];
  /** Worked out from the numbers — see `autoTags`. */
  autoTags: string[];
};

const ZERO_NUTRITION: Nutrition = { calories: 0, carbs: 0, sugar: 0, protein: 0, fat: 0 };

/**
 * Price and nutrition for one recipe.
 *
 * `servings` scales the *lines and total* — "for 7" on the meal sheet, or a
 * planned meal cooked for twelve. Per person never changes with scale, which
 * is the point of it.
 */
export function costRecipe(
  recipe: RecipeView,
  ingredientsById: ReadonlyMap<string, IngredientView>,
  servings: number = recipe.feeds,
): CostedRecipe {
  const factor = recipe.feeds > 0 ? servings / recipe.feeds : 1;

  let asWritten = 0;
  const unpriced: string[] = [];
  const missingNutrition: string[] = [];
  const totals: Nutrition = { ...ZERO_NUTRITION };

  const lines: CostedLine[] = recipe.lines.map((line) => {
    const ingredient = ingredientsById.get(line.ingredientId) ?? null;
    const perUnit = ingredient ? unitCost(ingredient) : null;
    const name = ingredient?.name ?? "A removed ingredient";

    if (perUnit === null) {
      unpriced.push(name);
    } else {
      asWritten += perUnit * line.qty;
    }

    if (ingredient?.nutrition) {
      for (const key of Object.keys(totals) as (keyof Nutrition)[]) {
        totals[key] += ingredient.nutrition[key] * line.qty;
      }
    } else {
      missingNutrition.push(name);
    }

    return {
      ingredient,
      ingredientId: line.ingredientId,
      qty: line.qty * factor,
      note: line.note,
      cost: perUnit === null ? null : perUnit * line.qty * factor,
    };
  });

  const subtotal = asWritten * factor;
  const tax = subtotal * SALES_TAX_RATE;
  const total = subtotal + tax;

  const perPerson = recipe.feeds > 0 ? (asWritten * (1 + SALES_TAX_RATE)) / recipe.feeds : null;
  const family = perPerson === null ? null : perPerson * FAMILY_SIZE;

  const nutrition =
    recipe.feeds > 0 && recipe.lines.length > 0
      ? (Object.fromEntries(
          Object.entries(totals).map(([key, value]) => [key, value / recipe.feeds]),
        ) as Nutrition)
      : null;

  const priced = unpriced.length === 0 && recipe.lines.length > 0;

  return {
    lines,
    servings,
    subtotal,
    tax,
    total,
    perPerson,
    family,
    priced,
    unpriced,
    nutrition,
    missingNutrition,
    autoTags: autoTags({
      perPerson: priced ? perPerson : null,
      totalMinutes: recipe.totalMinutes,
      nutrition: missingNutrition.length === 0 ? nutrition : null,
    }),
  };
}

/**
 * The labels the numbers earn on their own.
 *
 * Never stored: a price change moves a meal in or out of "under $1" the
 * moment it is saved, with nothing to keep in step. A figure that is not
 * trustworthy — a recipe missing a price, or an ingredient with no
 * nutrition — earns no tag from it rather than a wrong one.
 */
export function autoTags(input: {
  perPerson: number | null;
  totalMinutes: number;
  nutrition: Nutrition | null;
}): string[] {
  const tags: string[] = [];
  const rules = AUTO_TAG_RULES;

  if (input.perPerson !== null && input.perPerson < rules.underDollarPerPerson) {
    tags.push("under $1");
  }

  if (input.totalMinutes > 0) {
    if (input.totalMinutes <= 20) tags.push("under 20 min");
    else if (input.totalMinutes <= 30) tags.push("under 30 min");
    else if (input.totalMinutes <= 60) tags.push("under 1 hour");
    if (input.totalMinutes <= 30) tags.push("quick");
    if (input.totalMinutes >= 180) tags.push("slow");
  }

  const n = input.nutrition;
  if (n) {
    if (n.calories <= rules.lowCalorie) tags.push("low-calorie");
    if (n.calories >= rules.highCalorie) tags.push("high-calorie");
    if (n.protein >= rules.highProtein) tags.push("high-protein");
    if (n.carbs <= rules.lowCarb) tags.push("low-carb");
    if (n.sugar <= rules.lowSugar) tags.push("low-sugar");
    if (n.fat <= rules.lowFat) tags.push("low-fat");
  }

  return tags;
}

/** Every recipe priced at once, keyed by id. */
export function costAll(
  recipes: readonly RecipeView[],
  ingredients: readonly IngredientView[],
): Map<string, CostedRecipe> {
  const byId = indexIngredients(ingredients);
  return new Map(recipes.map((recipe) => [recipe.id, costRecipe(recipe, byId)]));
}

export function indexIngredients(
  ingredients: readonly IngredientView[],
): Map<string, IngredientView> {
  return new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
}

/** How many recipes use each ingredient, keyed by ingredient id. */
export function ingredientUsage(recipes: readonly RecipeView[]): Map<string, string[]> {
  const usage = new Map<string, string[]>();
  for (const recipe of recipes) {
    for (const line of recipe.lines) {
      const names = usage.get(line.ingredientId) ?? [];
      if (!names.includes(recipe.name)) names.push(recipe.name);
      usage.set(line.ingredientId, names);
    }
  }
  return usage;
}

/* -------------------------------------------------------------------------- */
/* Saying it                                                                   */
/* -------------------------------------------------------------------------- */

/** $1.27, or 8¢ under a dollar — the way a price tag says it. */
export function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 1) return `${Math.max(1, Math.round(value * 100))}¢`;
  return `$${value.toFixed(2)}`;
}

/** Always dollars and cents, for totals and receipts. */
export function formatDollars(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

/** 75 → "1 h 15 min", 480 → "8 h", 20 → "20 min". */
export function formatMinutes(minutes: number): string {
  if (!(minutes > 0)) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}
