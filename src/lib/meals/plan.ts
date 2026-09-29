/**
 * The week's plan, its budget, and the shopping list it turns into.
 *
 * Pure. The Plan tab computes all of this in the browser from the catalog it
 * already holds, and the "Add to the shopping list" action recomputes it on
 * the server from the same functions, so the lines that land on the family
 * list are exactly the lines that were on screen.
 *
 * ---------------------------------------------------------------------------
 * TWO DIFFERENT TOTALS, AND WHY BOTH ARE SHOWN
 * ---------------------------------------------------------------------------
 * The **budget** is what the planned meals *use*: half a bag of cheese costs
 * half a bag. That is the honest cost of the week's eating.
 *
 * The **shopping total** is what the till will say: cheese comes in whole bags.
 * It is usually higher — the difference is next week's leftovers — and lower
 * than the budget only when the pantry already has things.
 */

import { MAIN_STORES, PLAN_DAYS, SALES_TAX_RATE } from "@/config/meals";

import { bestBuy, costRecipe, packOf, packsFor, type CostedRecipe } from "./costing";
import { describeAmount, formatQuantity, pluralUnit } from "./quantity";
import type { IngredientView, MealPlan, PlanEntry, RecipeView } from "./types";

/* -------------------------------------------------------------------------- */
/* The plan                                                                    */
/* -------------------------------------------------------------------------- */

export type PlannedMeal = {
  entry: PlanEntry;
  /** `null` if the recipe has been deleted since it was planned. */
  recipe: RecipeView | null;
  costed: CostedRecipe | null;
};

export type PlanBudget = {
  meals: PlannedMeal[];
  /**
   * What the planned meals use, with tax — `null` while any of them is missing
   * a price, because a budget that leaves out a meal is not the week's budget.
   */
  total: number | null;
  /** `total` spread across everybody the meals feed. */
  perServing: number | null;
  averagePerMeal: number | null;
  /** Planned meals with at least one unpriced ingredient. */
  partlyPriced: number;
};

/**
 * Days in week order first, then the "sometime this week" meals in the order
 * they were added — the order a fridge-door plan is read in.
 */
export function orderPlan(entries: readonly PlanEntry[]): PlanEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const left = a.entry.day ?? PLAN_DAYS.length;
      const right = b.entry.day ?? PLAN_DAYS.length;
      return left - right || a.index - b.index;
    })
    .map(({ entry }) => entry);
}

export function budgetPlan(
  plan: MealPlan,
  recipesById: ReadonlyMap<string, RecipeView>,
  ingredientsById: ReadonlyMap<string, IngredientView>,
): PlanBudget {
  const meals: PlannedMeal[] = orderPlan(plan.entries).map((entry) => {
    const recipe = recipesById.get(entry.recipeId) ?? null;
    return {
      entry,
      recipe,
      costed: recipe ? costRecipe(recipe, ingredientsById, entry.servings) : null,
    };
  });

  let total = 0;
  let servings = 0;
  let partlyPriced = 0;
  let counted = 0;

  for (const meal of meals) {
    if (!meal.costed) continue;
    counted += 1;
    total += meal.costed.total;
    servings += meal.entry.servings;
    if (!meal.costed.priced) partlyPriced += 1;
  }

  const complete = partlyPriced === 0 && counted > 0;
  return {
    meals,
    total: complete ? total : null,
    perServing: complete && servings > 0 ? total / servings : null,
    averagePerMeal: complete ? total / counted : null,
    partlyPriced,
  };
}

/* -------------------------------------------------------------------------- */
/* The shopping list                                                           */
/* -------------------------------------------------------------------------- */

export type ShoppingNeed = {
  ingredient: IngredientView;
  /** In the ingredient's unit, across every planned meal. */
  need: number;
  /** Whole packs to buy, of `packLabel`. */
  packs: number;
  /** The pack being bought — the winning store's own, which may not be the usual one. */
  packLabel: string;
  /** Where this amount is cheapest to buy today, or `null` if it has no price. */
  store: string | null;
  /** What the till says for it there, before tax. */
  cost: number | null;
  /** Which planned meals want it. */
  recipes: string[];
};

export type StoreGroup = {
  store: string;
  items: ShoppingNeed[];
  /** Before tax. */
  subtotal: number;
};

export type StoreComparison = {
  store: string;
  /** Everything bought at this store where it sells it; the rest at their cheapest. */
  total: number;
  /** How many items this store has no price for. */
  missing: number;
};

export type ShoppingPlanList = {
  /** Still to buy, split by the store each is cheapest at, biggest bill first. */
  byStore: StoreGroup[];
  /** Still to buy, with no price anywhere. */
  unpriced: ShoppingNeed[];
  /** Ticked off as already in the pantry. */
  have: ShoppingNeed[];
  /** Everything still to buy, before tax, at the cheapest split. */
  subtotal: number;
  tax: number;
  total: number;
  /** "What if we just went to one shop?" */
  comparisons: StoreComparison[];
  /** How many planned meals fed into this. */
  mealCount: number;
};

/**
 * Consolidate every planned meal's ingredients into one line each, round up
 * to whole packs, and split by the store where that amount costs least today.
 *
 * "Costs least" is the bill, not the price per unit (see `bestBuy`): Costco's
 * big bag only wins when the week actually needs that much.
 *
 * Rounding happens *after* adding: two meals wanting half a bag of cheese each
 * is one bag, not two.
 */
export function buildShoppingList(
  plan: MealPlan,
  recipesById: ReadonlyMap<string, RecipeView>,
  ingredientsById: ReadonlyMap<string, IngredientView>,
): ShoppingPlanList {
  const needs = new Map<string, ShoppingNeed>();
  let mealCount = 0;

  for (const entry of plan.entries) {
    const recipe = recipesById.get(entry.recipeId);
    if (!recipe || !(recipe.feeds > 0)) continue;
    mealCount += 1;
    const factor = entry.servings / recipe.feeds;

    for (const line of recipe.lines) {
      const ingredient = ingredientsById.get(line.ingredientId);
      if (!ingredient) continue;
      const need = needs.get(ingredient.id) ?? {
        ingredient,
        need: 0,
        packs: 0,
        packLabel: ingredient.packLabel,
        store: null,
        cost: null,
        recipes: [],
      };
      need.need += line.qty * factor;
      if (!need.recipes.includes(recipe.name)) need.recipes.push(recipe.name);
      needs.set(ingredient.id, need);
    }
  }

  const have: ShoppingNeed[] = [];
  const unpriced: ShoppingNeed[] = [];
  const toBuy: ShoppingNeed[] = [];

  for (const need of needs.values()) {
    const best = bestBuy(need.ingredient, need.need);
    need.packs = best?.packs ?? packsFor(need.need, need.ingredient.packUnits);
    need.packLabel = best?.packLabel ?? need.ingredient.packLabel;
    need.store = best?.price.store ?? null;
    need.cost = best?.cost ?? null;

    if (plan.haveIt.includes(need.ingredient.id)) have.push(need);
    else if (!best) unpriced.push(need);
    else toBuy.push(need);
  }

  const byName = (a: ShoppingNeed, b: ShoppingNeed) =>
    a.ingredient.name.localeCompare(b.ingredient.name);

  const groups = new Map<string, StoreGroup>();
  for (const need of toBuy) {
    const store = need.store as string;
    const group = groups.get(store) ?? { store, items: [], subtotal: 0 };
    group.items.push(need);
    group.subtotal += need.cost ?? 0;
    groups.set(store, group);
  }
  const byStore = [...groups.values()]
    .map((group) => ({ ...group, items: group.items.sort(byName) }))
    .sort((a, b) => b.subtotal - a.subtotal || a.store.localeCompare(b.store));

  const subtotal = byStore.reduce((sum, group) => sum + group.subtotal, 0);

  return {
    byStore,
    unpriced: unpriced.sort(byName),
    have: have.sort(byName),
    subtotal,
    tax: subtotal * SALES_TAX_RATE,
    total: subtotal * (1 + SALES_TAX_RATE),
    comparisons: compareStores(toBuy),
    mealCount,
  };
}

export { packsFor };

/**
 * The bill if the family went to only one of the main stores, with tax.
 *
 * Each item is bought in *that store's* pack. An item the store has no price
 * for is still bought — at its best elsewhere — and counted in `missing`, so
 * the comparison is always "this shop plus the gaps" rather than a smaller
 * basket that looks cheaper. A store with a price for none of the list is
 * left out: "everything at Costco (none of it sold there)" is noise.
 */
function compareStores(toBuy: readonly ShoppingNeed[]): StoreComparison[] {
  return MAIN_STORES.flatMap((store) => {
    let total = 0;
    let missing = 0;
    for (const need of toBuy) {
      const here = need.ingredient.prices.find((price) => price.store === store);
      const units = here ? packOf(need.ingredient, here).units : 0;
      if (here && here.price > 0 && units > 0) {
        total += here.price * packsFor(need.need, units);
      } else {
        missing += 1;
        total += need.cost ?? 0;
      }
    }
    return missing === toBuy.length
      ? []
      : [{ store, total: total * (1 + SALES_TAX_RATE), missing }];
  });
}

/* -------------------------------------------------------------------------- */
/* Saying it                                                                   */
/* -------------------------------------------------------------------------- */

/** Something bought one at a time — a lemon, a pepper — rather than in a pack. */
function soldSingly(need: ShoppingNeed): boolean {
  const label = need.packLabel.trim().toLowerCase();
  return label === "" || label === "each";
}

/** "2 × 2 lb bag", just "2 lb bag" for one, and "3 tomatoes" for things sold singly. */
export function describePacks(need: ShoppingNeed): string {
  if (soldSingly(need)) {
    return `${need.packs} ${pluralUnit(need.ingredient.unit, need.packs)}`;
  }
  return need.packs > 1 ? `${need.packs} × ${need.packLabel}` : need.packLabel;
}

/**
 * One line on the family shopping list: "Cheddar cheese — 2 × 2 lb bag",
 * "Roma tomatoes — 3", or just "Cucumber".
 *
 * A dash rather than brackets, because pack labels have brackets of their own
 * ("3 bulb pack (~30 cloves)") and brackets inside brackets read as a typo.
 */
export function shoppingLineName(need: ShoppingNeed): string {
  if (soldSingly(need)) {
    return need.packs > 1 ? `${need.ingredient.name} — ${need.packs}` : need.ingredient.name;
  }
  return `${need.ingredient.name} — ${describePacks(need)}`;
}

/** How much the recipes actually need: "3½ cups". */
export function describeNeed(need: ShoppingNeed): string {
  return describeAmount(need.need, need.ingredient.unit);
}

/**
 * The list as plain text, for pasting into a message.
 *
 * Grouped by store because that is how it is walked, with what each line is
 * for left off: at the shelf, "2 × 2 lb bag" is the whole instruction.
 */
export function shoppingListText(list: ShoppingPlanList): string {
  const sections: string[] = [];

  for (const group of list.byStore) {
    sections.push(
      [
        `${group.store} (about $${group.subtotal.toFixed(2)})`,
        ...group.items.map((need) => `- ${shoppingLineName(need)}`),
      ].join("\n"),
    );
  }

  if (list.unpriced.length > 0) {
    sections.push(
      [
        "No price yet",
        ...list.unpriced.map(
          (need) =>
            `- ${need.ingredient.name} (${formatQuantity(need.need)} ${pluralUnit(need.ingredient.unit, need.need)})`,
        ),
      ].join("\n"),
    );
  }

  if (sections.length === 0) return "Nothing to buy.";
  if (list.byStore.length > 0) {
    sections.push(
      list.unpriced.length > 0
        ? `Priced items, with tax: about $${list.total.toFixed(2)} (the ${list.unpriced.length} without a price are not in it)`
        : `Total with tax: about $${list.total.toFixed(2)}`,
    );
  }
  return sections.join("\n\n");
}

/** The plan itself as text: "Mon — Tacos (beef), for 7". */
export function planText(budget: PlanBudget): string {
  const lines = budget.meals
    .filter((meal) => meal.recipe)
    .map((meal) => {
      const day = meal.entry.day === null ? "This week" : PLAN_DAYS[meal.entry.day];
      return `${day} — ${meal.recipe?.name}, for ${meal.entry.servings}`;
    });
  if (lines.length === 0) return "Nothing planned yet.";
  return [
    ...lines,
    "",
    budget.total === null
      ? "Budget: not every meal has prices yet."
      : `Budget: about $${budget.total.toFixed(2)}`,
  ].join("\n");
}
