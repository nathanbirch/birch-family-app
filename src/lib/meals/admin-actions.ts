"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  MEAL_TIME_IDS,
  MEAL_TYPES,
  PHOTO_MAX_BYTES,
  type MealTime,
  type MealType,
} from "@/config/meals";
import { requireUser } from "@/lib/auth/dal";
import { requireParentPin } from "@/lib/auth/parent-pin";
import { isItemId } from "@/lib/shopping/list";

import type { MealActionResult, MealAdminResult } from "./action-result";
import type { TypedPrice } from "./prices";
import {
  deleteIngredient as deleteIngredientInStore,
  deleteRecipe as deleteRecipeInStore,
  existingIngredientIds,
  insertIngredient,
  insertRecipe,
  recipesUsingIngredient,
  removeRecipePhoto,
  saveRecipePhoto,
  updateIngredient,
  updateIngredientPrices,
  updateRecipe,
  versionRoot,
} from "./store";

/**
 * The parent-only half of the Meals page: the catalog.
 *
 * ---------------------------------------------------------------------------
 * THE PIN IS CHECKED HERE, NOT ONLY ON THE PAGE
 * ---------------------------------------------------------------------------
 * Same rule as `lib/rewards/admin-actions.ts`, and for the same reason: every
 * export of a `"use server"` file is a public endpoint, so the PIN form in
 * front of `/meals/admin` is a convenience and `requireParentPin()` — the
 * first line of every export below — is the lock. It is the same cookie the
 * shop and the ceremonies set, so a parent who unlocked one has unlocked this.
 */

const Id = z.string().refine(isItemId, "That is not an id.");

/** Dollars, to the cent, and not absurd. */
const Price = z.number().finite().min(0.01).max(1000);

const PriceList = z
  .array(
    z.object({
      store: z.string().trim().min(1).max(40),
      price: Price,
      // A store's own pack, when it sells a different size (see `PriceView`).
      packLabel: z.string().trim().max(60).optional(),
      packUnits: z.number().finite().positive().max(100_000).optional(),
    }),
  )
  .max(12)
  .refine(
    (prices) => new Set(prices.map((p) => p.store.toLowerCase())).size === prices.length,
    "Each store once.",
  );

const Nutrient = z.number().finite().min(0).max(100_000);

const IngredientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(20),
  packLabel: z.string().trim().max(60),
  packUnits: z.number().finite().positive().max(100_000),
  prices: PriceList,
  nutrition: z
    .object({
      calories: Nutrient,
      carbs: Nutrient,
      sugar: Nutrient,
      protein: Nutrient,
      fat: Nutrient,
    })
    .nullable(),
});

const RecipeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  feeds: z.number().finite().positive().max(500),
  activeMinutes: z.number().int().min(0).max(10_000),
  totalMinutes: z.number().int().min(0).max(10_000),
  mealTimes: z
    .array(z.enum(MEAL_TIME_IDS as [MealTime, ...MealTime[]]))
    .min(1, "Pick when it is eaten.")
    .max(MEAL_TIME_IDS.length),
  type: z.enum(MEAL_TYPES as unknown as [MealType, ...MealType[]]),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20),
  /*
   * http(s) only. A plain `z.url()` accepts `javascript:` and `data:` URLs,
   * and this one is rendered as a link on every phone in the house.
   */
  url: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]),
  instructions: z.string().max(10_000),
  lines: z
    .array(
      z.object({
        ingredientId: Id,
        qty: z.number().finite().positive().max(100_000),
        note: z.string().trim().max(80),
      }),
    )
    .max(60),
  variantOf: Id.nullable(),
});

function refresh(): void {
  revalidatePath("/meals", "layout");
}

function firstIssue(error: z.ZodError, fallback: string): string {
  const issue = error.issues[0];
  return issue?.message && !issue.message.startsWith("Invalid") && !issue.message.startsWith("Too")
    ? issue.message
    : fallback;
}

/* -------------------------------------------------------------------------- */
/* Ingredients                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Add an ingredient (no `id`) or change one.
 *
 * `confirmPrices` dates every price today, which is what "these are still
 * right" means; without it, only the prices that actually changed are.
 */
export async function saveIngredient(input: {
  id?: string;
  confirmPrices?: boolean;
  name: string;
  unit: string;
  packLabel: string;
  packUnits: number;
  prices: TypedPrice[];
  nutrition: { calories: number; carbs: number; sugar: number; protein: number; fat: number } | null;
}): Promise<MealAdminResult> {
  await requireParentPin();
  await requireUser();

  const parsed = IngredientSchema.extend({
    id: Id.optional(),
    confirmPrices: z.boolean().optional(),
  }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error, "Check the ingredient's details.") };
  }
  const { id, confirmPrices, ...fields } = parsed.data;

  try {
    if (id) {
      const found = await updateIngredient(id, fields, confirmPrices ?? false);
      if (!found) return { ok: false, message: "That ingredient no longer exists." };
      refresh();
      return { ok: true, id };
    }
    const newId = await insertIngredient(fields);
    refresh();
    return { ok: true, id: newId };
  } catch (error) {
    console.error(`[meals] Could not save the ingredient "${fields.name}":`, error);
    return { ok: false, message: "That could not be saved. Try again." };
  }
}

/** The Prices tab's quick edit: new prices, all checked today. */
export async function saveIngredientPrices(input: {
  id: string;
  prices: TypedPrice[];
}): Promise<MealActionResult> {
  await requireParentPin();
  await requireUser();

  const parsed = z.object({ id: Id, prices: PriceList }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error, "Check the prices.") };
  }

  try {
    const found = await updateIngredientPrices(parsed.data.id, parsed.data.prices);
    if (!found) return { ok: false, message: "That ingredient no longer exists." };
  } catch (error) {
    console.error(`[meals] Could not save prices for ${parsed.data.id}:`, error);
    return { ok: false, message: "Those prices could not be saved. Try again." };
  }
  refresh();
  return { ok: true };
}

/** Refused while any recipe still uses it — say which, so it can be fixed. */
export async function deleteIngredient(input: { id: string }): Promise<MealActionResult> {
  await requireParentPin();
  await requireUser();

  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be removed." };

  try {
    const usedBy = await recipesUsingIngredient(parsed.data.id);
    if (usedBy.length > 0) {
      const names = usedBy.slice(0, 3).join(", ");
      const more = usedBy.length > 3 ? ` and ${usedBy.length - 3} more` : "";
      return {
        ok: false,
        message: `Still used by ${names}${more}. Take it out of those first.`,
      };
    }
    await deleteIngredientInStore(parsed.data.id);
  } catch (error) {
    console.error(`[meals] Could not delete ingredient ${parsed.data.id}:`, error);
    return { ok: false, message: "That could not be removed. Try again." };
  }
  refresh();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Recipes                                                                     */
/* -------------------------------------------------------------------------- */

/** Add a recipe (no `id`) or change one. */
export async function saveRecipe(input: {
  id?: string;
  name: string;
  feeds: number;
  activeMinutes: number;
  totalMinutes: number;
  mealTimes: string[];
  type: string;
  tags: string[];
  url: string;
  instructions: string;
  lines: { ingredientId: string; qty: number; note: string }[];
  variantOf: string | null;
}): Promise<MealAdminResult> {
  await requireParentPin();
  await requireUser();

  const parsed = RecipeSchema.extend({ id: Id.optional() }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error, "Check the recipe's details.") };
  }
  const { id, ...fields } = parsed.data;
  const tags = [...new Set(fields.tags)];

  try {
    const known = await existingIngredientIds(fields.lines.map((line) => line.ingredientId));
    if (fields.lines.some((line) => !known.has(line.ingredientId))) {
      return {
        ok: false,
        message: "One of the ingredients was deleted while you were editing. Pick it again.",
      };
    }

    let variantOf: string | null = null;
    if (fields.variantOf) {
      variantOf = await versionRoot(fields.variantOf);
      if (!variantOf) return { ok: false, message: "The recipe this is a version of is gone." };
      if (variantOf === id) variantOf = null;
    }

    const input = { ...fields, tags, variantOf };
    if (id) {
      const found = await updateRecipe(id, input);
      if (!found) return { ok: false, message: "That recipe no longer exists." };
      refresh();
      return { ok: true, id };
    }
    const newId = await insertRecipe(input);
    refresh();
    return { ok: true, id: newId };
  } catch (error) {
    console.error(`[meals] Could not save the recipe "${fields.name}":`, error);
    return { ok: false, message: "That could not be saved. Try again." };
  }
}

export async function deleteRecipe(input: { id: string }): Promise<MealActionResult> {
  await requireParentPin();
  await requireUser();

  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be removed." };

  try {
    await deleteRecipeInStore(parsed.data.id);
  } catch (error) {
    console.error(`[meals] Could not delete recipe ${parsed.data.id}:`, error);
    return { ok: false, message: "That could not be removed. Try again." };
  }
  refresh();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Photos                                                                      */
/* -------------------------------------------------------------------------- */

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Attach a photo, already shrunk by the browser, as a data URL.
 *
 * The type is read from the bytes' own signature as well as the data URL's
 * label, so a renamed file of anything else is refused rather than stored and
 * later served as an image.
 */
export async function setMealPhoto(input: {
  recipeId: string;
  dataUrl: string;
}): Promise<MealActionResult> {
  await requireParentPin();
  await requireUser();

  const parsed = z
    .object({ recipeId: Id, dataUrl: z.string().max(Math.ceil(PHOTO_MAX_BYTES * 1.4) + 64) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "That photo is too big. Try a smaller one." };

  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(parsed.data.dataUrl);
  const contentType = match?.[1];
  if (!match || !PHOTO_TYPES.includes(contentType as (typeof PHOTO_TYPES)[number])) {
    return { ok: false, message: "That is not a photo this can use." };
  }

  const bytes = new Uint8Array(Buffer.from(match[2], "base64"));
  if (bytes.byteLength === 0 || bytes.byteLength > PHOTO_MAX_BYTES) {
    return { ok: false, message: "That photo is too big. Try a smaller one." };
  }
  if (sniffImageType(bytes) !== contentType) {
    return { ok: false, message: "That is not a photo this can use." };
  }

  try {
    const found = await saveRecipePhoto(parsed.data.recipeId, bytes, contentType as string);
    if (!found) return { ok: false, message: "That recipe no longer exists." };
  } catch (error) {
    console.error(`[meals] Could not save a photo for ${parsed.data.recipeId}:`, error);
    return { ok: false, message: "The photo could not be saved. Try again." };
  }
  refresh();
  return { ok: true };
}

export async function clearMealPhoto(input: { recipeId: string }): Promise<MealActionResult> {
  await requireParentPin();
  await requireUser();

  const parsed = z.object({ recipeId: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be removed." };

  try {
    await removeRecipePhoto(parsed.data.recipeId);
  } catch (error) {
    console.error(`[meals] Could not remove the photo for ${parsed.data.recipeId}:`, error);
    return { ok: false, message: "That could not be removed. Try again." };
  }
  refresh();
  return { ok: true };
}

function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
