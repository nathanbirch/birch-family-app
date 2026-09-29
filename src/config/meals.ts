/**
 * The Meals page's fixed facts: who is being fed, where the food is bought,
 * what a sales tax is, and the vocabulary a recipe is described in.
 *
 * The recipes and ingredients themselves are *not* here — they are family
 * data that a parent edits from a phone, so they live in the database and are
 * only seeded from `config/meals-seed.ts`. What is here is everything that
 * would take a deploy to change on purpose.
 */

import { FAMILY } from "./family";

/**
 * How many people "the family" is when a meal is costed for everybody.
 *
 * Read from the roster rather than typed as 7, so the family cost on every
 * card follows `config/family.ts` if the family ever changes size — there is
 * no second place to remember.
 */
export const FAMILY_SIZE = FAMILY.length;

/**
 * Sales tax added to every recipe total — 6%, Idaho's state rate, where
 * groceries are taxed at the till like anything else. Change it here if the
 * family shops somewhere that taxes food differently.
 */
export const SALES_TAX_RATE = 0.06;

/**
 * The shops the family buys food at. Each ingredient is costed at whichever of
 * its prices is cheapest per unit — these, or any other vendor a price is
 * recorded against (a pizza place, "Homemade").
 *
 * These are the boxes the price editors always offer, and the stores the Plan
 * tab prices the whole list at. A store can sell its own pack size — Costco
 * nearly always does — which is why a price may carry a pack of its own (see
 * `PriceView`).
 *
 * None of the three publishes a price feed anybody outside can use (see
 * docs/meals.md#where-prices-come-from), so every price in the app was
 * checked by a person or by the scheduled price check — none is seeded.
 */
export const MAIN_STORES = ["Walmart", "Broulim's", "Costco"] as const;

/** A price older than this is flagged as due for a check on the Prices tab. */
export const STALE_PRICE_DAYS = 60;

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

/** When a meal is eaten — the quick tabs across the top of the Meals list. */
export const MEAL_TIMES = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "side", label: "Sides" },
  { id: "dessert", label: "Desserts" },
  { id: "other", label: "Other" },
] as const;

export type MealTime = (typeof MEAL_TIMES)[number]["id"];

export const MEAL_TIME_IDS: readonly MealTime[] = MEAL_TIMES.map((t) => t.id);

/** What kind of dish it is. One per recipe — the "Type" filter. */
export const MEAL_TYPES = [
  "Baking",
  "Bread",
  "Breakfast",
  "Crock Pot",
  "Dessert",
  "Drink",
  "Entree",
  "Ethnic",
  "Fruit",
  "Kid",
  "Meat",
  "Mexican",
  "Pasta",
  "Pizza",
  "Salad",
  "Sandwich",
  "Sauce",
  "Side",
  "Snack",
  "Soup",
  "Vegetable",
] as const;

export type MealType = (typeof MEAL_TYPES)[number];

/**
 * Labels a parent can put on a recipe. Free-form in the database — the editor
 * also accepts a new one — but these are the ones offered as chips.
 *
 * The cost, time and nutrition labels ("under $1", "quick", "low-carb", …) are
 * deliberately *not* here: those are worked out from the numbers every time a
 * meal is shown (see `AUTO_TAG_RULES`), so they can never disagree with the
 * price on the card.
 */
export const SUGGESTED_TAGS = [
  "air fryer",
  "crock pot",
  "freezer",
  "grill",
  "holiday",
  "instant pot",
  "kid favorite",
  "kid project",
  "make ahead",
  "microwave",
  "no bake",
  "oven",
  "stove top",
  "treat",
] as const;

/**
 * The thresholds behind the computed tags, per person.
 *
 * Only the tightest time tag is applied — a 15-minute meal is "under 20 min",
 * not also "under 30 min" and "under 1 hour" — so a card never carries three
 * chips that say the same thing.
 */
export const AUTO_TAG_RULES = {
  underDollarPerPerson: 1,
  lowCalorie: 400,
  highCalorie: 800,
  highProtein: 25,
  lowCarb: 20,
  lowSugar: 5,
  lowFat: 10,
} as const;

/* -------------------------------------------------------------------------- */
/* The Meals list's filters                                                    */
/* -------------------------------------------------------------------------- */

export const PRICE_FILTERS = [
  { id: "any", label: "Any price", max: null },
  { id: "1", label: "Under $1", max: 1 },
  { id: "2", label: "Under $2", max: 2 },
  { id: "3", label: "Under $3", max: 3 },
] as const;

export const CALORIE_FILTERS = [
  { id: "any", label: "Any calories", max: null },
  { id: "400", label: "Under 400 kcal", max: 400 },
  { id: "600", label: "Under 600 kcal", max: 600 },
  { id: "800", label: "Under 800 kcal", max: 800 },
] as const;

export const TIME_FILTERS = [
  { id: "any", label: "Any time", max: null },
  { id: "20", label: "Under 20 min", max: 20 },
  { id: "30", label: "Under 30 min", max: 30 },
  { id: "60", label: "Under 1 hour", max: 60 },
] as const;

export const MEAL_SORTS = [
  { id: "cheapest", label: "Cheapest first" },
  { id: "priciest", label: "Priciest first" },
  { id: "name", label: "A to Z" },
  { id: "type", label: "By type" },
  { id: "calories", label: "Fewest calories" },
  { id: "quickest", label: "Quickest" },
  { id: "not-lately", label: "Haven't had in a while" },
  { id: "loved", label: "Most loved" },
] as const;

export type MealSortId = (typeof MEAL_SORTS)[number]["id"];

export const PRICE_SORTS = [
  { id: "name", label: "A to Z" },
  { id: "oldest", label: "Oldest price" },
  { id: "used", label: "Most used" },
  { id: "priciest", label: "Priciest" },
] as const;

export type PriceSortId = (typeof PRICE_SORTS)[number]["id"];

/* -------------------------------------------------------------------------- */
/* The plan                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The days a planned meal can be pinned to, Monday first like every other
 * week in this app. A plan entry with no day is "sometime this week".
 */
export const PLAN_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** How many meals the plan will hold — a thumb on "Add to plan", not a limit anyone means. */
export const PLAN_ENTRY_LIMIT = 40;

/** The most servings one planned meal can be scaled to. */
export const PLAN_SERVINGS_MAX = 60;

/* -------------------------------------------------------------------------- */
/* Ratings                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What each person thinks of a meal. Three faces rather than five stars: the
 * youngest raters cannot tell a 3 from a 4, but every one of them can tell
 * "love it" from "no thanks".
 */
export const RATING_FACES = [
  { score: 3, emoji: "😋", label: "Love it" },
  { score: 2, emoji: "🙂", label: "It's OK" },
  { score: 1, emoji: "😖", label: "No thanks" },
] as const;

export type RatingScore = (typeof RATING_FACES)[number]["score"];

/* -------------------------------------------------------------------------- */
/* Photos                                                                      */
/* -------------------------------------------------------------------------- */

/** The longest edge a meal photo is shrunk to in the browser before upload. */
export const PHOTO_MAX_EDGE = 1200;

/**
 * The largest photo the server will store, in bytes, after decoding.
 *
 * Kept well under the 1MB Server Action body limit once base64 has added its
 * third — the browser lowers the JPEG quality until the picture fits.
 */
export const PHOTO_MAX_BYTES = 700_000;
