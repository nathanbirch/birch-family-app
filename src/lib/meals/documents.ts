import type { Binary, ObjectId } from "mongodb";

import type { PersonId } from "@/config/family";
import type { MealTime, MealType, RatingScore } from "@/config/meals";

import type { Nutrition } from "./types";

/**
 * The Meals collections' document shapes.
 *
 * Type-only, and in their own file so `seed-documents.ts` (which the seed
 * script imports) can describe what it builds without importing the
 * `server-only` store.
 */

export type PriceDocument = {
  store: string;
  price: number;
  checkedAt: Date;
  estimated: boolean;
  /** This store's own pack, if it differs — see `PriceView`. */
  packLabel?: string;
  packUnits?: number;
};

export type IngredientDocument = {
  _id: ObjectId;
  name: string;
  unit: string;
  packLabel: string;
  packUnits: number;
  prices: PriceDocument[];
  nutrition: Nutrition | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RecipeLineDocument = {
  ingredientId: ObjectId;
  qty: number;
  note: string;
};

export type RecipeDocument = {
  _id: ObjectId;
  name: string;
  feeds: number;
  activeMinutes: number;
  totalMinutes: number;
  mealTimes: MealTime[];
  type: MealType;
  tags: string[];
  url: string;
  instructions: string;
  lines: RecipeLineDocument[];
  variantOf: ObjectId | null;
  /** Changes every time the photo does, so its URL does too. */
  photoVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PhotoDocument = {
  /** The recipe's `_id`. */
  _id: ObjectId;
  data: Binary;
  contentType: string;
  version: string;
  updatedAt: Date;
};

export type FavoriteDocument = {
  /** The recipe's `_id`. */
  _id: ObjectId;
  createdAt: Date;
};

export type RatingDocument = {
  /** `recipeId:personId` — one rating per person per meal, by construction. */
  _id: string;
  recipeId: ObjectId;
  personId: PersonId;
  score: RatingScore;
  updatedAt: Date;
};

export type CookedDocument = {
  /** `recipeId:YYYY-MM-DD` — logging the same day twice is one row. */
  _id: string;
  recipeId: ObjectId;
  day: string;
  createdAt: Date;
};

export type PlanEntryDocument = {
  id: string;
  recipeId: ObjectId;
  servings: number;
  day: number | null;
};

export type PlanDocument = {
  _id: "family";
  entries: PlanEntryDocument[];
  haveIt: ObjectId[];
  updatedAt: Date;
};

export type MetaDocument = {
  _id: "seed";
  seededAt: Date;
  ingredients: number;
  recipes: number;
  /**
   * Seed batches already written. Missing on a database seeded before batches
   * existed, which means exactly `["starter"]`.
   */
  batches?: string[];
};

export type ApiKeyDocument = {
  /** SHA-256 of the key, hex. The key itself is never stored. */
  _id: string;
  /** What it is for — "scheduled price check". */
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};
