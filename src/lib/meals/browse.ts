/**
 * Finding a meal: grouping versions, searching, filtering and sorting.
 *
 * Pure, and run in the browser on every keystroke — the whole catalog is on
 * the page already, so a filter costs a few hundred comparisons and no round
 * trip.
 */

import {
  CALORIE_FILTERS,
  PRICE_FILTERS,
  TIME_FILTERS,
  type MealSortId,
  type MealTime,
} from "@/config/meals";

import type { CostedRecipe } from "./costing";
import type { FamilyMealState, IngredientView, Ratings, RecipeView } from "./types";

/* -------------------------------------------------------------------------- */
/* Versions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One card on the list: a recipe and any other versions of it.
 *
 * "Pancakes (from mix)" and "Pancakes (from scratch)" are one decision at the
 * table — pancakes or not — so they are one card with "2 versions" on it, and
 * the sheet lets you flip between them.
 */
export type MealGroup = {
  primary: RecipeView;
  /** Every version, the primary first. */
  versions: RecipeView[];
};

/**
 * Collapse `variantOf` links into groups.
 *
 * Forgiving on purpose: a version whose parent was deleted becomes its own
 * card, and a chain (A ← B ← C) collapses to A rather than nesting, so no
 * recipe can ever fall off the list because of how its links were made.
 */
export function groupVersions(recipes: readonly RecipeView[]): MealGroup[] {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  const rootOf = (recipe: RecipeView): RecipeView => {
    const seen = new Set<string>();
    let current = recipe;
    while (current.variantOf && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.variantOf);
      if (!parent) break;
      current = parent;
    }
    return current;
  };

  const groups = new Map<string, MealGroup>();
  for (const recipe of recipes) {
    const root = rootOf(recipe);
    const group = groups.get(root.id) ?? { primary: root, versions: [root] };
    if (recipe.id !== root.id) group.versions.push(recipe);
    groups.set(root.id, group);
  }
  return [...groups.values()];
}

/* -------------------------------------------------------------------------- */
/* Family state, read                                                          */
/* -------------------------------------------------------------------------- */

/** The most recent local date a recipe was made on, or `null`. */
export function lastCookedOn(state: FamilyMealState, recipeId: string): string | null {
  return state.cooked[recipeId]?.[0] ?? null;
}

/** The most recent date any version of a group was made. */
export function groupLastCooked(state: FamilyMealState, group: MealGroup): string | null {
  let latest: string | null = null;
  for (const version of group.versions) {
    const day = lastCookedOn(state, version.id);
    if (day && (!latest || day > latest)) latest = day;
  }
  return latest;
}

export function isGroupFavorite(state: FamilyMealState, group: MealGroup): boolean {
  return group.versions.some((version) => state.favorites.includes(version.id));
}

export type RatingSummary = {
  love: number;
  ok: number;
  no: number;
  /** Mean of the faces, 1–3, or `null` if nobody has said. */
  average: number | null;
};

export function summariseRatings(ratings: Ratings | undefined): RatingSummary {
  const scores = Object.values(ratings ?? {}).filter(
    (score): score is 1 | 2 | 3 => typeof score === "number",
  );
  return {
    love: scores.filter((score) => score === 3).length,
    ok: scores.filter((score) => score === 2).length,
    no: scores.filter((score) => score === 1).length,
    average:
      scores.length === 0 ? null : scores.reduce((sum, score) => sum + score, 0) / scores.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

/** Lower-case, accents stripped, punctuation to spaces. */
export function searchable(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9$]+/g, " ")
    .trim();
}

/**
 * Whether every word typed appears in the recipe's name or an ingredient's.
 *
 * Word by word rather than as one phrase, so "basic nachos" finds
 * "Nachos (Basic)" and "cheese beef" finds anything with both in it.
 */
export function matchesSearch(
  recipe: RecipeView,
  query: string,
  ingredientsById: ReadonlyMap<string, IngredientView>,
): boolean {
  const words = searchable(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;

  const haystack = [
    recipe.name,
    recipe.type,
    ...recipe.tags,
    ...recipe.lines.map((line) => ingredientsById.get(line.ingredientId)?.name ?? ""),
  ]
    .map(searchable)
    .join(" ");

  return words.every((word) => haystack.includes(word));
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

export type MealFilters = {
  query: string;
  mealTime: MealTime | "all";
  favoritesOnly: boolean;
  price: (typeof PRICE_FILTERS)[number]["id"];
  calories: (typeof CALORIE_FILTERS)[number]["id"];
  time: (typeof TIME_FILTERS)[number]["id"];
  /** A `MealType`, or `"any"`. */
  type: string;
  /** A tag — hand-given or computed — or `"any"`. */
  tag: string;
};

export const DEFAULT_FILTERS: MealFilters = {
  query: "",
  mealTime: "all",
  favoritesOnly: false,
  price: "any",
  calories: "any",
  time: "any",
  type: "any",
  tag: "any",
};

/** How many of the dropdown filters are set — the badge on "Filters". */
export function activeFilterCount(filters: MealFilters): number {
  return [
    filters.favoritesOnly,
    filters.price !== "any",
    filters.calories !== "any",
    filters.time !== "any",
    filters.type !== "any",
    filters.tag !== "any",
  ].filter(Boolean).length;
}

/**
 * Whether a group belongs on the list.
 *
 * The numbers come from the group's *primary* version — the one on the card —
 * so a card is never shown for passing a filter with a price it does not
 * display. The search is the exception: it looks through every version, so
 * searching "scratch" finds the pancakes.
 */
export function groupMatches(
  group: MealGroup,
  filters: MealFilters,
  context: {
    costs: ReadonlyMap<string, CostedRecipe>;
    state: FamilyMealState;
    ingredientsById: ReadonlyMap<string, IngredientView>;
  },
): boolean {
  const recipe = group.primary;
  const cost = context.costs.get(recipe.id);

  if (
    filters.query.trim() !== "" &&
    !group.versions.some((version) =>
      matchesSearch(version, filters.query, context.ingredientsById),
    )
  ) {
    return false;
  }

  if (filters.mealTime !== "all" && !recipe.mealTimes.includes(filters.mealTime)) {
    return false;
  }

  if (filters.favoritesOnly && !isGroupFavorite(context.state, group)) return false;

  const maxPrice = PRICE_FILTERS.find((f) => f.id === filters.price)?.max ?? null;
  if (maxPrice !== null) {
    if (!cost?.priced || cost.perPerson === null || cost.perPerson >= maxPrice) return false;
  }

  const maxCalories = CALORIE_FILTERS.find((f) => f.id === filters.calories)?.max ?? null;
  if (maxCalories !== null) {
    if (!cost?.nutrition || cost.nutrition.calories >= maxCalories) return false;
  }

  const maxMinutes = TIME_FILTERS.find((f) => f.id === filters.time)?.max ?? null;
  if (maxMinutes !== null) {
    if (!(recipe.totalMinutes > 0) || recipe.totalMinutes > maxMinutes) return false;
  }

  if (filters.type !== "any" && recipe.type !== filters.type) return false;

  if (filters.tag !== "any") {
    const tags = [...recipe.tags, ...(cost?.autoTags ?? [])];
    if (!tags.includes(filters.tag)) return false;
  }

  return true;
}

/** Every tag in use — hand-given and computed — for the Tag filter. */
export function allTags(
  recipes: readonly RecipeView[],
  costs: ReadonlyMap<string, CostedRecipe>,
): string[] {
  const tags = new Set<string>();
  for (const recipe of recipes) {
    for (const tag of recipe.tags) tags.add(tag);
    for (const tag of costs.get(recipe.id)?.autoTags ?? []) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/* -------------------------------------------------------------------------- */
/* Sorting                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Sort the cards.
 *
 * Anything without the number being sorted on — an unpriced recipe under
 * "Cheapest", a recipe with no time under "Quickest" — goes to the end in
 * either direction, rather than pretending to cost nothing.
 *
 * "Haven't had in a while" puts never-made meals first (they are the most
 * "in a while" of all), then the longest since, which is the order a family
 * trying to rotate the menu wants to read.
 */
export function sortGroups(
  groups: readonly MealGroup[],
  sort: MealSortId,
  context: {
    costs: ReadonlyMap<string, CostedRecipe>;
    state: FamilyMealState;
  },
): MealGroup[] {
  const byName = (a: MealGroup, b: MealGroup) =>
    a.primary.name.localeCompare(b.primary.name);

  const perPerson = (group: MealGroup): number | null => {
    const cost = context.costs.get(group.primary.id);
    return cost?.priced ? cost.perPerson : null;
  };

  const numeric =
    (value: (group: MealGroup) => number | null, direction: 1 | -1) =>
    (a: MealGroup, b: MealGroup) => {
      const left = value(a);
      const right = value(b);
      if (left === null && right === null) return byName(a, b);
      if (left === null) return 1;
      if (right === null) return -1;
      return (left - right) * direction || byName(a, b);
    };

  const sorted = [...groups];
  switch (sort) {
    case "cheapest":
      return sorted.sort(numeric(perPerson, 1));
    case "priciest":
      return sorted.sort(numeric(perPerson, -1));
    case "name":
      return sorted.sort(byName);
    case "type":
      return sorted.sort(
        (a, b) => a.primary.type.localeCompare(b.primary.type) || byName(a, b),
      );
    case "calories":
      return sorted.sort(
        numeric((group) => context.costs.get(group.primary.id)?.nutrition?.calories ?? null, 1),
      );
    case "quickest":
      return sorted.sort(
        numeric((group) => (group.primary.totalMinutes > 0 ? group.primary.totalMinutes : null), 1),
      );
    case "not-lately":
      return sorted.sort((a, b) => {
        const left = groupLastCooked(context.state, a);
        const right = groupLastCooked(context.state, b);
        if (left === right) return byName(a, b);
        if (left === null) return -1;
        if (right === null) return 1;
        return left.localeCompare(right);
      });
    case "loved":
      return sorted.sort(
        numeric((group) => summariseRatings(context.state.ratings[group.primary.id]).average, -1),
      );
  }
}

/* -------------------------------------------------------------------------- */
/* The three tiles                                                             */
/* -------------------------------------------------------------------------- */

export type MealSummary = {
  count: number;
  /** Mean per-person cost of the priced cards shown. */
  averagePerPerson: number | null;
  cheapest: { group: MealGroup; perPerson: number } | null;
};

export function summarise(
  groups: readonly MealGroup[],
  costs: ReadonlyMap<string, CostedRecipe>,
): MealSummary {
  let sum = 0;
  let priced = 0;
  let cheapest: MealSummary["cheapest"] = null;

  for (const group of groups) {
    const cost = costs.get(group.primary.id);
    if (!cost?.priced || cost.perPerson === null) continue;
    sum += cost.perPerson;
    priced += 1;
    if (!cheapest || cost.perPerson < cheapest.perPerson) {
      cheapest = { group, perPerson: cost.perPerson };
    }
  }

  return {
    count: groups.length,
    averagePerPerson: priced === 0 ? null : sum / priced,
    cheapest,
  };
}
