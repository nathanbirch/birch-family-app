/**
 * The starter catalog in `config/meals-seed.ts`, turned into the shapes the
 * rest of the feature uses.
 *
 * Pure, and imported from three places that must agree exactly: the store
 * that writes the seed into MongoDB, the offline fallback that shows it
 * without MongoDB, and `scripts/seed-database.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHY THE IDS ARE HASHED FROM THE KEYS
 * ---------------------------------------------------------------------------
 * Every seeded document's `_id` is derived from its key rather than generated
 * fresh. Two things depend on that:
 *
 *   - **Seeding is idempotent.** Writing the seed twice — two instances racing
 *     on first load, or the seed script run after the page already seeded —
 *     collides on `_id` and is ignored rather than doubling the catalog.
 *   - **The fallback agrees with the database.** A plan saved while the
 *     database was reachable still points at the right meals when the page is
 *     showing the compiled catalog, because both call pancakes the same id.
 */

import { FAMILY_FAVORITES_BATCH } from "@/config/meals-family";
import {
  SEED_INGREDIENTS,
  SEED_RECIPES,
  type SeedBatch,
  type SeedIngredient,
  type SeedRecipe,
} from "@/config/meals-seed";

import type { IngredientView, MealsCatalog, RecipeView } from "./types";

/** FNV-1a, 32-bit, from a chosen starting basis. */
function fnv1a(text: string, basis: number): number {
  let hash = basis >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * 24 hex characters — an `ObjectId`'s shape — from a kind and a key.
 *
 * Three 32-bit hashes from three different starting points, concatenated.
 * Not cryptographic and not trying to be: it only has to keep a few hundred
 * keys apart, which a test checks, and be the same on every machine forever.
 */
export function seedId(kind: "ingredient" | "recipe", key: string): string {
  const text = `${kind}:${key}`;
  return [0x811c9dc5, 0x9e3779b9, 0x2545f491]
    .map((basis) => fnv1a(text, basis).toString(16).padStart(8, "0"))
    .join("");
}

/**
 * Every batch, oldest first. Append; never reorder, rename or remove one —
 * `mealMeta.batches` remembers them by id.
 */
export const SEED_BATCHES: readonly SeedBatch[] = [
  { id: "starter", ingredients: SEED_INGREDIENTS, recipes: SEED_RECIPES, regroup: {} },
  FAMILY_FAVORITES_BATCH,
];

const ALL_INGREDIENTS = SEED_BATCHES.flatMap((batch) => batch.ingredients);
const ALL_RECIPES = SEED_BATCHES.flatMap((batch) => batch.recipes);

export function seedIngredientView(seed: SeedIngredient): IngredientView {
  return {
    id: seedId("ingredient", seed.key),
    name: seed.name,
    unit: seed.unit,
    packLabel: seed.packLabel,
    packUnits: seed.packUnits,
    // Never seeded: every price comes from somebody checking it. See the note
    // at the top of `config/meals-seed.ts`.
    prices: [],
    nutrition: seed.nutrition
      ? {
          calories: seed.nutrition[0],
          carbs: seed.nutrition[1],
          sugar: seed.nutrition[2],
          protein: seed.nutrition[3],
          fat: seed.nutrition[4],
        }
      : null,
  };
}

export function seedRecipeView(seed: SeedRecipe): RecipeView {
  return {
    id: seedId("recipe", seed.key),
    name: seed.name,
    feeds: seed.feeds,
    activeMinutes: seed.activeMinutes,
    totalMinutes: seed.totalMinutes,
    mealTimes: [...seed.mealTimes],
    type: seed.type,
    tags: [...seed.tags],
    url: seed.url ?? "",
    instructions: seed.steps.join("\n"),
    lines: seed.lines.map(([key, qty, note]) => ({
      ingredientId: seedId("ingredient", key),
      qty,
      note: note ?? "",
    })),
    variantOf: seed.variantOf ? seedId("recipe", seed.variantOf) : null,
    photoUrl: null,
  };
}

/**
 * The whole starter catalog, ready to show.
 *
 * What the page falls back to when MongoDB cannot be reached, so the Meals
 * page is never empty — only read-only for a while.
 */
/**
 * What regrouping a recipe does to its name: nothing, unless it has exactly
 * the same name as the recipe it now sits under, when "Waffles / Waffles" on
 * the version switcher would say nothing at all.
 */
export function regroupedName(name: string, parentName: string): string {
  return name === parentName ? `${name} (starter)` : name;
}

export function compiledCatalog(): MealsCatalog {
  const regroup = new Map<string, string>();
  for (const batch of SEED_BATCHES) {
    for (const [from, to] of Object.entries(batch.regroup)) {
      regroup.set(seedId("recipe", from), seedId("recipe", to));
    }
  }
  const nameById = new Map(ALL_RECIPES.map((recipe) => [seedId("recipe", recipe.key), recipe.name]));
  return {
    ingredients: ALL_INGREDIENTS.map(seedIngredientView).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    recipes: ALL_RECIPES.map(seedRecipeView)
      .map((recipe) =>
        recipe.variantOf === null && regroup.has(recipe.id)
          ? {
              ...recipe,
              name: regroupedName(recipe.name, nameById.get(regroup.get(recipe.id) ?? "") ?? ""),
              variantOf: regroup.get(recipe.id) ?? null,
            }
          : recipe,
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
    source: "compiled",
  };
}

/**
 * Problems with the seed itself, or `null` if there are none.
 *
 * A line pointing at an ingredient key that does not exist would seed a recipe
 * with a hole in it, silently, into every family's database. The seed script
 * and a test both refuse to go on if this returns anything.
 */
export function findSeedProblem(): string | null {
  const batchIds = new Set<string>();
  for (const batch of SEED_BATCHES) {
    if (batchIds.has(batch.id)) return `Batch "${batch.id}" is listed twice.`;
    batchIds.add(batch.id);
  }

  const ingredientKeys = new Set<string>();
  for (const ingredient of ALL_INGREDIENTS) {
    if (ingredientKeys.has(ingredient.key)) return `Ingredient key "${ingredient.key}" is used twice.`;
    ingredientKeys.add(ingredient.key);
    if (!(ingredient.packUnits > 0)) return `"${ingredient.key}" has no pack size.`;
  }

  const recipeKeys = new Set<string>();
  for (const recipe of ALL_RECIPES) {
    if (recipeKeys.has(recipe.key)) return `Recipe key "${recipe.key}" is used twice.`;
    recipeKeys.add(recipe.key);
  }

  for (const batch of SEED_BATCHES) {
    const own = new Set(batch.recipes.map((recipe) => recipe.key));
    for (const [from, to] of Object.entries(batch.regroup)) {
      if (!recipeKeys.has(from)) return `Batch "${batch.id}" regroups "${from}", which is not a recipe.`;
      if (!own.has(to)) return `Batch "${batch.id}" regroups onto "${to}", which is not one of its recipes.`;
    }
  }

  for (const recipe of ALL_RECIPES) {
    if (!(recipe.feeds > 0)) return `"${recipe.key}" does not say how many it feeds.`;
    if (recipe.mealTimes.length === 0) return `"${recipe.key}" does not say when it is eaten.`;
    if (recipe.url && !/^https:\/\//.test(recipe.url)) return `"${recipe.key}" has a link that is not https.`;
    if (recipe.variantOf && !recipeKeys.has(recipe.variantOf)) {
      return `"${recipe.key}" is a version of "${recipe.variantOf}", which does not exist.`;
    }
    for (const [key, qty] of recipe.lines) {
      if (!ingredientKeys.has(key)) return `"${recipe.key}" uses "${key}", which is not an ingredient.`;
      if (!(qty > 0)) return `"${recipe.key}" has no quantity for "${key}".`;
    }
  }

  return null;
}
