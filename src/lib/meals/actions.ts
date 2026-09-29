"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { FAMILY, type PersonId } from "@/config/family";
import { PLAN_DAYS, PLAN_SERVINGS_MAX } from "@/config/meals";
import { ACTIVE_ITEM_LIMIT } from "@/config/shopping";
import { requireUser } from "@/lib/auth/dal";
import { parseLocalDate } from "@/lib/dates";
import { findDuplicate, isItemId, newItemId, normaliseItemName } from "@/lib/shopping/list";
import { insertShoppingItem, readActiveItems } from "@/lib/shopping/store";

import type { MealActionResult, SendToListResult } from "./action-result";
import { searchable } from "./browse";
import { indexIngredients } from "./costing";
import { buildShoppingList, shoppingLineName } from "./plan";
import {
  addPlanEntry,
  clearPlan as clearPlanInStore,
  readCatalog,
  readPlan,
  removePlanEntry,
  setCooked,
  setFavorite,
  setHaveIt,
  setRating,
  updatePlanEntry as updatePlanEntryInStore,
} from "./store";

/**
 * Everything anybody in the family can do on the Meals page.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE MAY ONLY EXPORT ASYNC FUNCTIONS
 * ---------------------------------------------------------------------------
 * Every export is a public POST endpoint, so every check lives inside the
 * action: `requireUser()` first, then the parser. Parents' catalog edits are
 * in `admin-actions.ts`, behind the PIN as well.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE DO REVALIDATE, UNLIKE THE SHOPPING LIST'S
 * ---------------------------------------------------------------------------
 * The shopping list has a live stream carrying every change; this page does
 * not, and does not need one — nobody is ticking the same meal plan from two
 * aisles at once. So each action ends in `revalidatePath`, the response
 * carries the fresh page, and the board's `useOptimistic` overlay hands over
 * to it in the same frame. See `MealsBoard`.
 */

const Id = z.string().refine(isItemId, "That is not an id.");
const PersonIds = FAMILY.map((person) => person.id) as [PersonId, ...PersonId[]];
const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => parseLocalDate(value) !== null, "That is not a date.");
const Servings = z.number().int().min(1).max(PLAN_SERVINGS_MAX);
const PlanDay = z.number().int().min(0).max(PLAN_DAYS.length - 1).nullable();

function refresh(): void {
  revalidatePath("/meals", "layout");
}

function failed(what: string, error: unknown): MealActionResult {
  console.error(`[meals] Could not ${what}:`, error);
  return { ok: false, message: `That could not be saved. Try again.` };
}

/* -------------------------------------------------------------------------- */
/* Favourites, ratings, and "we made this"                                     */
/* -------------------------------------------------------------------------- */

export async function setMealFavorite(input: {
  recipeId: string;
  favorite: boolean;
}): Promise<MealActionResult> {
  await requireUser();
  const parsed = z.object({ recipeId: Id, favorite: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be saved." };

  try {
    await setFavorite(parsed.data.recipeId, parsed.data.favorite);
  } catch (error) {
    return failed("save a favourite", error);
  }
  refresh();
  return { ok: true };
}

/** `score: 0` clears that person's rating. */
export async function rateMeal(input: {
  recipeId: string;
  personId: string;
  score: number;
}): Promise<MealActionResult> {
  await requireUser();
  const parsed = z
    .object({
      recipeId: Id,
      personId: z.enum(PersonIds),
      score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "That rating could not be saved." };

  const { recipeId, personId, score } = parsed.data;
  try {
    await setRating(recipeId, personId, score === 0 ? null : score);
  } catch (error) {
    return failed("save a rating", error);
  }
  refresh();
  return { ok: true };
}

/**
 * Log (or un-log) a meal as made on a day.
 *
 * The day comes from the browser, as a local calendar date, because "today"
 * is the phone's today — the same rule the seating rotation follows. A server
 * in UTC would log Tuesday's late dinner on Wednesday.
 */
export async function logMealCooked(input: {
  recipeId: string;
  day: string;
  made: boolean;
}): Promise<MealActionResult> {
  await requireUser();
  const parsed = z.object({ recipeId: Id, day: Day, made: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be logged." };

  try {
    await setCooked(parsed.data.recipeId, parsed.data.day, parsed.data.made);
  } catch (error) {
    return failed("log a meal", error);
  }
  refresh();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* The plan                                                                    */
/* -------------------------------------------------------------------------- */

export async function addMealToPlan(input: {
  id: string;
  recipeId: string;
  servings: number;
  day: number | null;
}): Promise<MealActionResult> {
  await requireUser();
  const parsed = z
    .object({ id: Id, recipeId: Id, servings: Servings, day: PlanDay })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be added to the plan." };

  try {
    const outcome = await addPlanEntry(parsed.data);
    if (outcome === "full") {
      return { ok: false, message: "The plan is full. Take something off first." };
    }
  } catch (error) {
    return failed("add to the plan", error);
  }
  refresh();
  return { ok: true };
}

export async function updatePlanEntry(input: {
  id: string;
  servings?: number;
  day?: number | null;
}): Promise<MealActionResult> {
  await requireUser();
  const parsed = z
    .object({ id: Id, servings: Servings.optional(), day: PlanDay.optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be saved." };

  try {
    const found = await updatePlanEntryInStore(parsed.data.id, {
      servings: parsed.data.servings,
      day: parsed.data.day,
    });
    if (!found) return { ok: false, message: "That meal is no longer on the plan." };
  } catch (error) {
    return failed("change the plan", error);
  }
  refresh();
  return { ok: true };
}

export async function removeFromPlan(input: { id: string }): Promise<MealActionResult> {
  await requireUser();
  const parsed = z.object({ id: Id }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be removed." };

  try {
    // Already gone is not a failure — two taps, or somebody else got there first.
    await removePlanEntry(parsed.data.id);
  } catch (error) {
    return failed("change the plan", error);
  }
  refresh();
  return { ok: true };
}

/**
 * "We made it": log the meal as cooked today and take it off the plan, in one
 * tap. The log is written first — if the second write fails, the meal is
 * still on the plan and still recorded, which is the harmless half to be left
 * with.
 */
export async function finishPlanEntry(input: {
  id: string;
  recipeId: string;
  day: string;
}): Promise<MealActionResult> {
  await requireUser();
  const parsed = z.object({ id: Id, recipeId: Id, day: Day }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be logged." };

  try {
    await setCooked(parsed.data.recipeId, parsed.data.day, true);
    await removePlanEntry(parsed.data.id);
  } catch (error) {
    return failed("log a planned meal", error);
  }
  refresh();
  return { ok: true };
}

export async function clearMealPlan(): Promise<MealActionResult> {
  await requireUser();
  try {
    await clearPlanInStore();
  } catch (error) {
    return failed("clear the plan", error);
  }
  refresh();
  return { ok: true };
}

/** Tick an ingredient off the shopping list as already in the pantry, or put it back. */
export async function setPantryItem(input: {
  ingredientId: string;
  have: boolean;
}): Promise<MealActionResult> {
  await requireUser();
  const parsed = z.object({ ingredientId: Id, have: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be saved." };

  try {
    await setHaveIt(parsed.data.ingredientId, parsed.data.have);
  } catch (error) {
    return failed("update the pantry", error);
  }
  refresh();
  return { ok: true };
}

/**
 * Put the plan's shopping list on the family's live shopping list.
 *
 * Recomputed here from the stored plan and catalog rather than trusting lines
 * sent by the browser — it is the same `buildShoppingList` the Plan tab runs,
 * so the result is what was on screen, and nothing a hand-built request says
 * can put anything else on the family's list.
 *
 * Something already on the list is left alone rather than added twice. That
 * is judged by the ingredient's name as well as the whole line, so "Milk"
 * typed by hand this morning stops "Milk, 2% (1 gal jug)" from joining it.
 */
export async function sendPlanToShoppingList(): Promise<SendToListResult> {
  const user = await requireUser();

  try {
    const [catalog, plan] = await Promise.all([readCatalog(), readPlan()]);
    if (catalog.source !== "database") {
      return { ok: false, message: "The meals could not be loaded. Try again in a minute." };
    }

    const list = buildShoppingList(
      plan,
      new Map(catalog.recipes.map((recipe) => [recipe.id, recipe])),
      indexIngredients(catalog.ingredients),
    );
    const needs = [...list.byStore.flatMap((group) => group.items), ...list.unpriced];
    if (needs.length === 0) {
      return { ok: false, message: "There is nothing on this week's list to add." };
    }

    const active = await readActiveItems();
    let count = active.length;
    let added = 0;
    let alreadyThere = 0;
    let skippedFull = 0;

    for (const need of needs) {
      const name = normaliseItemName(shoppingLineName(need));
      const base = searchable(need.ingredient.name);
      const onList =
        findDuplicate(active, name) !== null ||
        active.some((item) => {
          const existing = searchable(item.name);
          return existing === base || existing.startsWith(`${base} `);
        });
      if (onList) {
        alreadyThere += 1;
        continue;
      }
      if (count >= ACTIVE_ITEM_LIMIT) {
        skippedFull += 1;
        continue;
      }
      await insertShoppingItem({ id: newItemId(), name, addedBy: user.displayName });
      count += 1;
      added += 1;
    }

    return { ok: true, added, alreadyThere, skippedFull };
  } catch (error) {
    console.error("[meals] Could not send the plan to the shopping list:", error);
    return { ok: false, message: "That could not be added. Try again." };
  }
}
