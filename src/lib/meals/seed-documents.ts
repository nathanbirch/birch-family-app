import { ObjectId } from "mongodb";

import { SEED_INGREDIENTS, SEED_RECIPES } from "@/config/meals-seed";

import { seedIngredientView, seedRecipeView } from "./seed";
import type { IngredientDocument, RecipeDocument } from "./documents";

/**
 * The starter catalog as MongoDB documents.
 *
 * Its own module, rather than part of `store.ts`, because `scripts/seed-database.ts`
 * writes the same documents and cannot import anything marked `server-only`.
 * Built from the same views the offline fallback shows, so the database and
 * the fallback cannot describe a meal differently.
 */

export function seedIngredientDocuments(now: Date): IngredientDocument[] {
  return SEED_INGREDIENTS.map((seed) => {
    const view = seedIngredientView(seed);
    return {
      _id: new ObjectId(view.id),
      name: view.name,
      unit: view.unit,
      packLabel: view.packLabel,
      packUnits: view.packUnits,
      prices: view.prices.map((price) => ({
        store: price.store,
        price: price.price,
        checkedAt: new Date(price.checkedAt),
        estimated: true,
        ...(price.packUnits ? { packLabel: price.packLabel ?? "", packUnits: price.packUnits } : {}),
      })),
      nutrition: view.nutrition,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function seedRecipeDocuments(now: Date): RecipeDocument[] {
  return SEED_RECIPES.map((seed) => {
    const view = seedRecipeView(seed);
    return {
      _id: new ObjectId(view.id),
      name: view.name,
      feeds: view.feeds,
      activeMinutes: view.activeMinutes,
      totalMinutes: view.totalMinutes,
      mealTimes: view.mealTimes,
      type: view.type,
      tags: view.tags,
      url: view.url,
      instructions: view.instructions,
      lines: view.lines.map((line) => ({
        ingredientId: new ObjectId(line.ingredientId),
        qty: line.qty,
        note: line.note,
      })),
      variantOf: view.variantOf ? new ObjectId(view.variantOf) : null,
      photoVersion: null,
      createdAt: now,
      updatedAt: now,
    };
  });
}
