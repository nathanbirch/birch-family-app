import "server-only";

import { Binary, ObjectId, type Collection, type Document } from "mongodb";

import { COLLECTIONS, type CollectionName } from "@/config/db";
import type { PersonId } from "@/config/family";
import { PLAN_ENTRY_LIMIT, type MealTime, type MealType, type RatingScore } from "@/config/meals";
import { reportDegraded } from "@/lib/data-health";
import { getCollection } from "@/lib/db";

import type {
  ApiKeyDocument,
  CookedDocument,
  FavoriteDocument,
  IngredientDocument,
  MetaDocument,
  PhotoDocument,
  PlanDocument,
  PriceDocument,
  RatingDocument,
  RecipeDocument,
} from "./documents";
import { mergePrices, type TypedPrice } from "./prices";
import { compiledCatalog } from "./seed";
import { seedIngredientDocuments, seedRecipeDocuments } from "./seed-documents";
import {
  EMPTY_FAMILY_STATE,
  type FamilyMealState,
  type IngredientView,
  type MealsCatalog,
  type Nutrition,
  type PlanEntry,
  type RecipeView,
} from "./types";

/**
 * The Meals page's eight collections.
 *
 * ---------------------------------------------------------------------------
 * READS ARE FORGIVING, WRITES ARE NOT
 * ---------------------------------------------------------------------------
 * The rule every store in this app follows. An unreachable cluster shows the
 * starter catalog compiled into the app (and an empty plan) rather than an
 * error page — dinner still needs deciding — and says so with a banner. Writes
 * have nothing sensible to fall back to, so they throw and the action reports
 * it.
 *
 * ---------------------------------------------------------------------------
 * THE FIRST LOAD SEEDS ITSELF
 * ---------------------------------------------------------------------------
 * The page must be useful the first time anyone opens it, without somebody
 * remembering to run a script. So `readCatalog` checks once per process for
 * the `mealMeta` marker and, if it is missing, writes the starter catalog
 * first. That write is idempotent — see `lib/meals/seed.ts` for why the ids
 * are hashed from the seed keys — so two instances doing it at once, or
 * `npm run db:seed` doing it as well, cost nothing but a few ignored
 * duplicate-key errors.
 */

async function collection<T extends Document>(name: CollectionName): Promise<Collection<T>> {
  return getCollection<T>(name);
}

const ingredients = () => collection<IngredientDocument>(COLLECTIONS.mealIngredients);
const recipes = () => collection<RecipeDocument>(COLLECTIONS.mealRecipes);
const photos = () => collection<PhotoDocument>(COLLECTIONS.mealPhotos);
const favorites = () => collection<FavoriteDocument>(COLLECTIONS.mealFavorites);
const ratings = () => collection<RatingDocument>(COLLECTIONS.mealRatings);
const cooked = () => collection<CookedDocument>(COLLECTIONS.mealCooked);
const plans = () => collection<PlanDocument>(COLLECTIONS.mealPlan);
const meta = () => collection<MetaDocument>(COLLECTIONS.mealMeta);
const apiKeys = () => collection<ApiKeyDocument>(COLLECTIONS.mealApiKeys);

const PLAN_ID = "family" as const;

/* -------------------------------------------------------------------------- */
/* Seeding                                                                     */
/* -------------------------------------------------------------------------- */

declare global {
  var __birchMealsSeeded: Promise<void> | undefined;
}

/**
 * Write the starter catalog if this database has never had it.
 *
 * Memoised per process, like the Mongo client in `lib/db.ts`, so it is one
 * `findOne` per server start rather than one per page view. A failure clears
 * the memo, so the next request tries again rather than never.
 */
export function ensureMealsSeeded(): Promise<void> {
  globalThis.__birchMealsSeeded ??= seedIfNeeded().catch((error) => {
    globalThis.__birchMealsSeeded = undefined;
    throw error;
  });
  return globalThis.__birchMealsSeeded;
}

async function seedIfNeeded(): Promise<void> {
  const marker = await meta();
  if (await marker.findOne({ _id: "seed" })) return;

  const now = new Date();
  const ingredientDocs = seedIngredientDocuments(now);
  const recipeDocs = seedRecipeDocuments(now);

  await insertIgnoringDuplicates(await ingredients(), ingredientDocs);
  await insertIgnoringDuplicates(await recipes(), recipeDocs);
  await ensureMealIndexes();

  await marker.updateOne(
    { _id: "seed" },
    {
      $setOnInsert: {
        seededAt: now,
        ingredients: ingredientDocs.length,
        recipes: recipeDocs.length,
      },
    },
    { upsert: true },
  );
  console.log(
    `[meals] Seeded the starter catalog: ${recipeDocs.length} recipes, ` +
      `${ingredientDocs.length} ingredients.`,
  );
}

async function insertIgnoringDuplicates<T extends Document>(
  target: Collection<T>,
  documents: readonly T[],
): Promise<void> {
  if (documents.length === 0) return;
  try {
    // `ordered: false` so one existing row does not stop the rest.
    await target.insertMany(documents as never[], { ordered: false });
  } catch (error) {
    if (!onlyDuplicates(error)) throw error;
  }
}

function onlyDuplicates(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const writeErrors = (error as { writeErrors?: unknown }).writeErrors;
  const list = Array.isArray(writeErrors) ? writeErrors : writeErrors ? [writeErrors] : [];
  if (list.length === 0) return isDuplicateKey(error);
  return list.every((entry) => (entry as { code?: unknown }).code === 11000);
}

/* -------------------------------------------------------------------------- */
/* Reading the catalog                                                         */
/* -------------------------------------------------------------------------- */

/** Every ingredient and recipe, or the starter catalog if the cluster is away. */
export async function readCatalog(): Promise<MealsCatalog> {
  try {
    await ensureMealsSeeded();
    const [ingredientDocs, recipeDocs] = await Promise.all([
      ingredients().then((c) => c.find({}).sort({ name: 1 }).toArray()),
      recipes().then((c) => c.find({}).sort({ name: 1 }).toArray()),
    ]);
    return {
      ingredients: ingredientDocs.flatMap((doc) => toIngredientView(doc) ?? []),
      recipes: recipeDocs.flatMap((doc) => toRecipeView(doc) ?? []),
      source: "database",
    };
  } catch (error) {
    reportDegraded("meals");
    console.warn(
      `[meals] Could not read the catalog: ${describe(error)}. Showing the starter catalog.`,
    );
    return compiledCatalog();
  }
}

/** One recipe for the editor, or `null`. Throws if the cluster is away. */
export async function readRecipe(id: string): Promise<RecipeView | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await recipes()).findOne({ _id: new ObjectId(id) });
  return doc ? toRecipeView(doc) : null;
}

/** One ingredient for the editor, or `null`. Throws if the cluster is away. */
export async function readIngredient(id: string): Promise<IngredientView | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await ingredients()).findOne({ _id: new ObjectId(id) });
  return doc ? toIngredientView(doc) : null;
}

/**
 * A document into a view, or `null` if it is not one.
 *
 * Every field is checked because this is the boundary between the database
 * and the page: a row hand-edited in Atlas should cost one ingredient, not
 * the whole catalog.
 */
function toIngredientView(doc: IngredientDocument): IngredientView | null {
  if (typeof doc.name !== "string" || doc.name.trim() === "") return null;
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    unit: typeof doc.unit === "string" && doc.unit ? doc.unit : "each",
    packLabel: typeof doc.packLabel === "string" ? doc.packLabel : "",
    packUnits: typeof doc.packUnits === "number" && doc.packUnits > 0 ? doc.packUnits : 1,
    prices: (Array.isArray(doc.prices) ? doc.prices : []).flatMap((price) =>
      typeof price?.store === "string" &&
      typeof price.price === "number" &&
      price.checkedAt instanceof Date
        ? [
            {
              store: price.store,
              price: price.price,
              checkedAt: price.checkedAt.getTime(),
              estimated: price.estimated === true,
              ...(typeof price.packUnits === "number" && price.packUnits > 0
                ? {
                    packUnits: price.packUnits,
                    packLabel: typeof price.packLabel === "string" ? price.packLabel : "",
                  }
                : {}),
            },
          ]
        : [],
    ),
    nutrition: isNutrition(doc.nutrition) ? doc.nutrition : null,
  };
}

function isNutrition(value: unknown): value is Nutrition {
  if (typeof value !== "object" || value === null) return false;
  const n = value as Record<string, unknown>;
  return ["calories", "carbs", "sugar", "protein", "fat"].every(
    (key) => typeof n[key] === "number" && Number.isFinite(n[key]),
  );
}

function toRecipeView(doc: RecipeDocument): RecipeView | null {
  if (typeof doc.name !== "string" || doc.name.trim() === "") return null;
  const id = doc._id.toHexString();
  return {
    id,
    name: doc.name,
    feeds: typeof doc.feeds === "number" && doc.feeds > 0 ? doc.feeds : 1,
    activeMinutes: typeof doc.activeMinutes === "number" ? doc.activeMinutes : 0,
    totalMinutes: typeof doc.totalMinutes === "number" ? doc.totalMinutes : 0,
    mealTimes: Array.isArray(doc.mealTimes) ? doc.mealTimes : [],
    type: doc.type,
    tags: Array.isArray(doc.tags) ? doc.tags.filter((tag) => typeof tag === "string") : [],
    url: typeof doc.url === "string" ? doc.url : "",
    instructions: typeof doc.instructions === "string" ? doc.instructions : "",
    lines: (Array.isArray(doc.lines) ? doc.lines : []).flatMap((line) =>
      line?.ingredientId instanceof ObjectId && typeof line.qty === "number"
        ? [
            {
              ingredientId: line.ingredientId.toHexString(),
              qty: line.qty,
              note: typeof line.note === "string" ? line.note : "",
            },
          ]
        : [],
    ),
    variantOf: doc.variantOf instanceof ObjectId ? doc.variantOf.toHexString() : null,
    photoUrl: doc.photoVersion ? photoUrl(id, doc.photoVersion) : null,
  };
}

export function photoUrl(recipeId: string, version: string): string {
  return `/api/meals/photo/${recipeId}?v=${encodeURIComponent(version)}`;
}

/* -------------------------------------------------------------------------- */
/* Reading what the family has done                                            */
/* -------------------------------------------------------------------------- */

/** How many "made it" dates are kept per meal on the page. */
const COOKED_DAYS_SHOWN = 20;

/** Favourites, ratings, the cooking log and the plan. Empty if the cluster is away. */
export async function readFamilyState(): Promise<FamilyMealState> {
  try {
    const [favoriteDocs, ratingDocs, cookedDocs, planDoc] = await Promise.all([
      favorites().then((c) => c.find({}).toArray()),
      ratings().then((c) => c.find({}).toArray()),
      cooked().then((c) => c.find({}).sort({ day: -1 }).toArray()),
      plans().then((c) => c.findOne({ _id: PLAN_ID })),
    ]);

    const state: FamilyMealState = {
      favorites: favoriteDocs.map((doc) => doc._id.toHexString()),
      ratings: {},
      cooked: {},
      plan: {
        entries: (planDoc?.entries ?? []).flatMap((entry) =>
          typeof entry?.id === "string" && entry.recipeId instanceof ObjectId
            ? [
                {
                  id: entry.id,
                  recipeId: entry.recipeId.toHexString(),
                  servings: typeof entry.servings === "number" ? entry.servings : 1,
                  day: typeof entry.day === "number" ? entry.day : null,
                },
              ]
            : [],
        ),
        haveIt: (planDoc?.haveIt ?? []).map((id) => id.toHexString()),
      },
    };

    for (const doc of ratingDocs) {
      const key = doc.recipeId.toHexString();
      state.ratings[key] = { ...state.ratings[key], [doc.personId]: doc.score };
    }

    for (const doc of cookedDocs) {
      const key = doc.recipeId.toHexString();
      const days = (state.cooked[key] ??= []);
      if (days.length < COOKED_DAYS_SHOWN) days.push(doc.day);
    }

    return state;
  } catch (error) {
    reportDegraded("meals");
    console.warn(`[meals] Could not read the family's plan: ${describe(error)}.`);
    return EMPTY_FAMILY_STATE;
  }
}

/**
 * The plan's meals by name, and nothing else — the dashboard badge's whole
 * need. Two small reads rather than the catalog, since the dashboard is
 * opened far more often than the Meals page. Empty if the cluster is away:
 * the badge simply does not appear.
 */
export async function readPlanPreview(): Promise<{ day: number | null; name: string }[]> {
  try {
    const plan = await (await plans()).findOne({ _id: PLAN_ID });
    const entries = plan?.entries ?? [];
    if (entries.length === 0) return [];
    const names = await (await recipes())
      .find({ _id: { $in: entries.map((entry) => entry.recipeId) } }, { projection: { name: 1 } })
      .toArray();
    const byId = new Map(names.map((doc) => [doc._id.toHexString(), doc.name]));
    return entries.flatMap((entry) => {
      const name = byId.get(entry.recipeId.toHexString());
      return name ? [{ day: typeof entry.day === "number" ? entry.day : null, name }] : [];
    });
  } catch (error) {
    console.warn(`[meals] Could not read the plan for the dashboard: ${describe(error)}.`);
    return [];
  }
}

/** Just the plan, for the "send to shopping list" action. Throws if the cluster is away. */
export async function readPlan(): Promise<FamilyMealState["plan"]> {
  const doc = await (await plans()).findOne({ _id: PLAN_ID });
  return {
    entries: (doc?.entries ?? []).map((entry) => ({
      id: entry.id,
      recipeId: entry.recipeId.toHexString(),
      servings: entry.servings,
      day: entry.day,
    })),
    haveIt: (doc?.haveIt ?? []).map((id) => id.toHexString()),
  };
}

/* -------------------------------------------------------------------------- */
/* Writing: the family                                                         */
/* -------------------------------------------------------------------------- */

export async function setFavorite(recipeId: string, favorite: boolean): Promise<void> {
  const target = await favorites();
  const _id = new ObjectId(recipeId);
  if (favorite) {
    await target.updateOne({ _id }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  } else {
    await target.deleteOne({ _id });
  }
}

/** `score` of `null` clears the rating. */
export async function setRating(
  recipeId: string,
  personId: PersonId,
  score: RatingScore | null,
): Promise<void> {
  const target = await ratings();
  const _id = `${recipeId}:${personId}`;
  if (score === null) {
    await target.deleteOne({ _id });
    return;
  }
  await target.updateOne(
    { _id },
    { $set: { recipeId: new ObjectId(recipeId), personId, score, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function setCooked(recipeId: string, day: string, made: boolean): Promise<void> {
  const target = await cooked();
  const _id = `${recipeId}:${day}`;
  if (made) {
    await target.updateOne(
      { _id },
      { $setOnInsert: { recipeId: new ObjectId(recipeId), day, createdAt: new Date() } },
      { upsert: true },
    );
  } else {
    await target.deleteOne({ _id });
  }
}

export type AddPlanOutcome = "added" | "already-there" | "full";

/**
 * Put a meal on the plan, under an id the browser chose.
 *
 * The id is what makes a retry harmless — a second attempt finds its own entry
 * already there — for the same reason the shopping list's ids are chosen by
 * the browser. The limit is checked in the same filter as the write, so two
 * phones adding the fortieth meal at once cannot make forty-one.
 */
export async function addPlanEntry(entry: PlanEntry): Promise<AddPlanOutcome> {
  const target = await plans();
  const existing = await target.findOne({ _id: PLAN_ID });
  if (existing?.entries.some((e) => e.id === entry.id)) return "already-there";
  if ((existing?.entries.length ?? 0) >= PLAN_ENTRY_LIMIT) return "full";

  try {
    const outcome = await target.updateOne(
      {
        _id: PLAN_ID,
        "entries.id": { $ne: entry.id },
        [`entries.${PLAN_ENTRY_LIMIT - 1}`]: { $exists: false },
      },
      {
        $push: {
          entries: {
            id: entry.id,
            recipeId: new ObjectId(entry.recipeId),
            servings: entry.servings,
            day: entry.day,
          },
        },
        $set: { updatedAt: new Date() },
        $setOnInsert: { haveIt: [] },
      },
      { upsert: true },
    );
    return outcome.matchedCount + outcome.upsertedCount > 0 ? "added" : "already-there";
  } catch (error) {
    // The filter failed on a document that exists — the entry is already
    // there, or the plan is full — so the upsert tried to create a second
    // "family" plan and collided with the first.
    if (isDuplicateKey(error)) {
      const after = await target.findOne({ _id: PLAN_ID });
      return after?.entries.some((e) => e.id === entry.id) ? "already-there" : "full";
    }
    throw error;
  }
}

/** Returns whether the entry was found. */
export async function updatePlanEntry(
  id: string,
  patch: { servings?: number; day?: number | null },
): Promise<boolean> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.servings !== undefined) set["entries.$.servings"] = patch.servings;
  if (patch.day !== undefined) set["entries.$.day"] = patch.day;
  const outcome = await (await plans()).updateOne({ _id: PLAN_ID, "entries.id": id }, { $set: set });
  return outcome.matchedCount > 0;
}

/** Take one entry off, handing back what it was (for "we made it"). */
export async function removePlanEntry(id: string): Promise<PlanEntry | null> {
  const target = await plans();
  const before = await target.findOneAndUpdate(
    { _id: PLAN_ID },
    { $pull: { entries: { id } }, $set: { updatedAt: new Date() } },
    { returnDocument: "before" },
  );
  const entry = before?.entries.find((e) => e.id === id);
  return entry
    ? {
        id: entry.id,
        recipeId: entry.recipeId.toHexString(),
        servings: entry.servings,
        day: entry.day,
      }
    : null;
}

/** Start the week over: no meals, nothing ticked as already in the pantry. */
export async function clearPlan(): Promise<void> {
  await (await plans()).updateOne(
    { _id: PLAN_ID },
    { $set: { entries: [], haveIt: [], updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function setHaveIt(ingredientId: string, have: boolean): Promise<void> {
  const _id = new ObjectId(ingredientId);
  await (await plans()).updateOne(
    { _id: PLAN_ID },
    have
      ? { $addToSet: { haveIt: _id }, $set: { updatedAt: new Date() }, $setOnInsert: { entries: [] } }
      : { $pull: { haveIt: _id }, $set: { updatedAt: new Date() } },
    { upsert: have },
  );
}

/* -------------------------------------------------------------------------- */
/* Writing: the catalog (parents only — see admin-actions.ts)                  */
/* -------------------------------------------------------------------------- */

export type IngredientInput = {
  name: string;
  unit: string;
  packLabel: string;
  packUnits: number;
  prices: TypedPrice[];
  nutrition: Nutrition | null;
};

export async function insertIngredient(input: IngredientInput): Promise<string> {
  const now = new Date();
  const doc: IngredientDocument = {
    _id: new ObjectId(),
    name: input.name,
    unit: input.unit,
    packLabel: input.packLabel,
    packUnits: input.packUnits,
    prices: mergePrices([], input.prices, now, true),
    nutrition: input.nutrition,
    createdAt: now,
    updatedAt: now,
  };
  await (await ingredients()).insertOne(doc);
  return doc._id.toHexString();
}

/** Returns whether the ingredient was found. */
export async function updateIngredient(
  id: string,
  input: IngredientInput,
  confirmPrices: boolean,
): Promise<boolean> {
  const target = await ingredients();
  const _id = new ObjectId(id);
  const existing = await target.findOne({ _id });
  if (!existing) return false;
  const now = new Date();
  await target.updateOne(
    { _id },
    {
      $set: {
        name: input.name,
        unit: input.unit,
        packLabel: input.packLabel,
        packUnits: input.packUnits,
        prices: mergePrices(existing.prices ?? [], input.prices, now, confirmPrices),
        nutrition: input.nutrition,
        updatedAt: now,
      },
    },
  );
  return true;
}

/** Just the prices — the Prices tab's quick edit. Every one is dated today. */
export async function updateIngredientPrices(
  id: string,
  prices: TypedPrice[],
): Promise<boolean> {
  const target = await ingredients();
  const _id = new ObjectId(id);
  const existing = await target.findOne({ _id });
  if (!existing) return false;
  const now = new Date();
  await target.updateOne(
    { _id },
    { $set: { prices: mergePrices(existing.prices ?? [], prices, now, true), updatedAt: now } },
  );
  return true;
}

/** The names of the recipes that use an ingredient. */
export async function recipesUsingIngredient(id: string): Promise<string[]> {
  const docs = await (await recipes())
    .find({ "lines.ingredientId": new ObjectId(id) }, { projection: { name: 1 } })
    .toArray();
  return docs.map((doc) => doc.name);
}

export async function deleteIngredient(id: string): Promise<void> {
  const _id = new ObjectId(id);
  await (await ingredients()).deleteOne({ _id });
  await (await plans()).updateOne({ _id: PLAN_ID }, { $pull: { haveIt: _id } });
}

export type RecipeInput = {
  name: string;
  feeds: number;
  activeMinutes: number;
  totalMinutes: number;
  mealTimes: MealTime[];
  type: MealType;
  tags: string[];
  url: string;
  instructions: string;
  lines: { ingredientId: string; qty: number; note: string }[];
  variantOf: string | null;
};

function recipeFields(input: RecipeInput) {
  return {
    name: input.name,
    feeds: input.feeds,
    activeMinutes: input.activeMinutes,
    totalMinutes: input.totalMinutes,
    mealTimes: input.mealTimes,
    type: input.type,
    tags: input.tags,
    url: input.url,
    instructions: input.instructions,
    lines: input.lines.map((line) => ({
      ingredientId: new ObjectId(line.ingredientId),
      qty: line.qty,
      note: line.note,
    })),
    variantOf: input.variantOf ? new ObjectId(input.variantOf) : null,
  };
}

/** Which of these ingredient ids exist. */
export async function existingIngredientIds(ids: readonly string[]): Promise<Set<string>> {
  const valid = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const docs = await (await ingredients())
    .find({ _id: { $in: valid } }, { projection: { _id: 1 } })
    .toArray();
  return new Set(docs.map((doc) => doc._id.toHexString()));
}

/**
 * The recipe a new version should hang off: the root of `id`'s own group, so
 * versions never nest. `null` if there is no such recipe.
 */
export async function versionRoot(id: string): Promise<string | null> {
  if (!ObjectId.isValid(id)) return null;
  const target = await recipes();
  let current = await target.findOne({ _id: new ObjectId(id) }, { projection: { variantOf: 1 } });
  const seen = new Set<string>();
  while (current?.variantOf && !seen.has(current._id.toHexString())) {
    seen.add(current._id.toHexString());
    const parent = await target.findOne(
      { _id: current.variantOf },
      { projection: { variantOf: 1 } },
    );
    if (!parent) break;
    current = parent;
  }
  return current ? current._id.toHexString() : null;
}

export async function insertRecipe(input: RecipeInput): Promise<string> {
  const now = new Date();
  const doc: RecipeDocument = {
    _id: new ObjectId(),
    ...recipeFields(input),
    photoVersion: null,
    createdAt: now,
    updatedAt: now,
  };
  await (await recipes()).insertOne(doc);
  return doc._id.toHexString();
}

/** Returns whether the recipe was found. */
export async function updateRecipe(id: string, input: RecipeInput): Promise<boolean> {
  const outcome = await (await recipes()).updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...recipeFields(input), updatedAt: new Date() } },
  );
  return outcome.matchedCount > 0;
}

/**
 * Delete a recipe and everything that only meant something because of it.
 *
 * Its other versions are not deleted — they are promoted to stand on their
 * own — and nothing anybody *cooked* is rewritten; the log rows simply stop
 * being shown.
 */
export async function deleteRecipe(id: string): Promise<void> {
  const _id = new ObjectId(id);
  await (await recipes()).deleteOne({ _id });
  await Promise.all([
    recipes().then((c) => c.updateMany({ variantOf: _id }, { $set: { variantOf: null } })),
    photos().then((c) => c.deleteOne({ _id })),
    favorites().then((c) => c.deleteOne({ _id })),
    ratings().then((c) => c.deleteMany({ recipeId: _id })),
    cooked().then((c) => c.deleteMany({ recipeId: _id })),
    plans().then((c) =>
      c.updateOne({ _id: PLAN_ID }, { $pull: { entries: { recipeId: _id } } }),
    ),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Photos                                                                      */
/* -------------------------------------------------------------------------- */

/** Store a photo and point the recipe at its new version. Returns whether the recipe exists. */
export async function saveRecipePhoto(
  recipeId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<boolean> {
  const _id = new ObjectId(recipeId);
  const version = new ObjectId().toHexString().slice(-10);
  const found = await (await recipes()).updateOne(
    { _id },
    { $set: { photoVersion: version, updatedAt: new Date() } },
  );
  if (found.matchedCount === 0) return false;
  await (await photos()).updateOne(
    { _id },
    { $set: { data: new Binary(bytes), contentType, version, updatedAt: new Date() } },
    { upsert: true },
  );
  return true;
}

export async function removeRecipePhoto(recipeId: string): Promise<void> {
  const _id = new ObjectId(recipeId);
  await (await recipes()).updateOne({ _id }, { $set: { photoVersion: null, updatedAt: new Date() } });
  await (await photos()).deleteOne({ _id });
}

export async function readRecipePhoto(
  recipeId: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!ObjectId.isValid(recipeId)) return null;
  const doc = await (await photos()).findOne({ _id: new ObjectId(recipeId) });
  if (!doc) return null;
  return { bytes: new Uint8Array(doc.data.buffer), contentType: doc.contentType };
}

/* -------------------------------------------------------------------------- */
/* The price API                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether a key's hash belongs to a live key. Records when it was last used,
 * at most once a minute, so the admin can tell a key in use from a forgotten
 * one without every request paying for a write.
 */
export async function isApiKeyHash(hash: string): Promise<boolean> {
  const target = await apiKeys();
  const doc = await target.findOne({ _id: hash });
  if (!doc) return false;
  const now = new Date();
  if (!doc.lastUsedAt || now.getTime() - doc.lastUsedAt.getTime() > 60_000) {
    await target.updateOne({ _id: hash }, { $set: { lastUsedAt: now } });
  }
  return true;
}

/**
 * Record one store's price for an ingredient, checked right now.
 *
 * Only that store's entry changes; every other store keeps its price and its
 * date. An unchanged price still gets today's date — the point of a daily
 * check is to be able to say "this was still right this morning". Returns the
 * ingredient afterwards, or `null` if there is no such ingredient.
 */
export async function setStorePrice(
  id: string,
  price: { store: string; price: number; packLabel?: string; packUnits?: number },
): Promise<IngredientView | null> {
  const target = await ingredients();
  const _id = new ObjectId(id);
  const existing = await target.findOne({ _id });
  if (!existing) return null;

  const now = new Date();
  const entry: PriceDocument = {
    store: price.store,
    price: price.price,
    checkedAt: now,
    estimated: false,
    ...(price.packUnits && price.packUnits > 0
      ? { packLabel: price.packLabel ?? "", packUnits: price.packUnits }
      : {}),
  };
  const others = (existing.prices ?? []).filter((p) => p.store !== price.store);
  const prices = [...others, entry];

  await target.updateOne({ _id }, { $set: { prices, updatedAt: now } });
  return toIngredientView({ ...existing, prices, updatedAt: now });
}

/* -------------------------------------------------------------------------- */

/**
 * Indexes these collections need. Idempotent. Run as part of the first seed,
 * so a database that has never seen `npm run db:seed` still gets them.
 */
export async function ensureMealIndexes(): Promise<void> {
  const recipeCollection = await recipes();
  await recipeCollection.createIndex({ "lines.ingredientId": 1 }, { name: "by_ingredient" });
  await recipeCollection.createIndex({ variantOf: 1 }, { name: "by_parent" });
  await (await ratings()).createIndex({ recipeId: 1 }, { name: "by_recipe" });
  await (await cooked()).createIndex({ recipeId: 1, day: -1 }, { name: "by_recipe_day" });
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
