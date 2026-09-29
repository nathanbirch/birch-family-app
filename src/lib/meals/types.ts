/**
 * Plain, JSON-safe shapes for the Meals page — what the server hands the
 * browser, and what every pure function in `lib/meals/` works on.
 *
 * Deliberately free of MongoDB types (`ObjectId`, `Date`), for the reason
 * `lib/rewards/view.ts` gives: a store document passed straight to a Client
 * Component either fails to serialise or hands over more than it should.
 * Times are epoch milliseconds; ids are 24 hex characters.
 */

import type { PersonId } from "@/config/family";
import type { MealTime, MealType, RatingScore } from "@/config/meals";

/** Per one of the ingredient's own units. Grams, except `calories`. */
export type Nutrition = {
  calories: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
};

export const NUTRIENTS: readonly { key: keyof Nutrition; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "sugar", label: "Sugar", unit: "g" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
];

/** One shop's price for one pack of an ingredient. */
export type PriceView = {
  store: string;
  /** Dollars, for the whole pack. */
  price: number;
  /** When somebody last confirmed it. */
  checkedAt: number;
  /** A starter estimate nobody has confirmed at the shop yet. */
  estimated: boolean;
  /**
   * This store's own pack, when it differs from the ingredient's usual one —
   * Costco's 5 lb bag of cheese against everybody else's 2 lb. Left out, the
   * price is for the ingredient's `packLabel` / `packUnits`.
   */
  packLabel?: string;
  packUnits?: number;
};

export type IngredientView = {
  id: string;
  name: string;
  /** What recipes measure it in: "cup", "egg", "lb". */
  unit: string;
  /** What you actually pick up off the shelf: "2 lb bag". */
  packLabel: string;
  /** How many `unit`s are in one pack. */
  packUnits: number;
  prices: PriceView[];
  /** Per one `unit`. `null` when nobody has entered it. */
  nutrition: Nutrition | null;
};

export type RecipeLine = {
  ingredientId: string;
  /** In the ingredient's own `unit`. */
  qty: number;
  /** "diced", "optional", "for frying". */
  note: string;
};

export type RecipeView = {
  id: string;
  name: string;
  /** How many people the recipe as written feeds. */
  feeds: number;
  activeMinutes: number;
  totalMinutes: number;
  mealTimes: MealTime[];
  type: MealType;
  tags: string[];
  /** A link to where the recipe came from, if anywhere. */
  url: string;
  /** Steps, one per line. */
  instructions: string;
  lines: RecipeLine[];
  /** The recipe this is another version of, if any. */
  variantOf: string | null;
  /** Versioned, so a replaced photo is a new URL. */
  photoUrl: string | null;
};

export type MealsCatalog = {
  ingredients: IngredientView[];
  recipes: RecipeView[];
  /**
   * `"compiled"` when the database could not be reached and the page is
   * showing the starter catalog built into the app. Read-only in that state.
   */
  source: "database" | "compiled";
};

/* -------------------------------------------------------------------------- */
/* What the family has done with the catalog                                   */
/* -------------------------------------------------------------------------- */

export type PlanEntry = {
  /** Chosen by the browser — see `newItemId` in `lib/shopping/list.ts`. */
  id: string;
  recipeId: string;
  /** How many people this cooking of it is for. */
  servings: number;
  /** 0 = Monday … 6 = Sunday; `null` is "sometime this week". */
  day: number | null;
};

export type MealPlan = {
  entries: PlanEntry[];
  /** Ingredient ids already in the pantry, left off the shopping list. */
  haveIt: string[];
};

export type Ratings = Partial<Record<PersonId, RatingScore>>;

export type FamilyMealState = {
  favorites: string[];
  /** Keyed by recipe id. */
  ratings: Record<string, Ratings>;
  /** Keyed by recipe id; local calendar dates (`YYYY-MM-DD`), newest first. */
  cooked: Record<string, string[]>;
  plan: MealPlan;
};

export const EMPTY_FAMILY_STATE: FamilyMealState = {
  favorites: [],
  ratings: {},
  cooked: {},
  plan: { entries: [], haveIt: [] },
};
