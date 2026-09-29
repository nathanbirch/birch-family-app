import { describe, expect, it } from "vitest";

import { FAMILY } from "@/config/family";
import { FAMILY_SIZE, SALES_TAX_RATE } from "@/config/meals";
import { SEED_INGREDIENTS, SEED_RECIPES } from "@/config/meals-seed";
import {
  DEFAULT_FILTERS,
  groupMatches,
  groupVersions,
  matchesSearch,
  sortGroups,
  summarise,
  summariseRatings,
} from "@/lib/meals/browse";
import {
  autoTags,
  bestBuy,
  cheapestPrice,
  costAll,
  costRecipe,
  formatMinutes,
  formatMoney,
  indexIngredients,
  ingredientUsage,
  lastChecked,
  packOf,
  unitCost,
} from "@/lib/meals/costing";
import { describeAge, describeLastMade } from "@/lib/meals/format";
import { applyMealChange } from "@/lib/meals/optimistic";
import {
  budgetPlan,
  buildShoppingList,
  orderPlan,
  packsFor,
  shoppingLineName,
  shoppingListText,
} from "@/lib/meals/plan";
import { mergePrices } from "@/lib/meals/prices";
import {
  convertQuantity,
  describeAmount,
  formatQuantity,
  friendlyAmount,
  parseQuantity,
  pluralUnit,
  unitChoices,
} from "@/lib/meals/quantity";
import { SEED_BATCHES, compiledCatalog, findSeedProblem, seedId } from "@/lib/meals/seed";
import {
  EMPTY_FAMILY_STATE,
  type FamilyMealState,
  type IngredientView,
  type RecipeView,
} from "@/lib/meals/types";

/*
 * The Meals page's arithmetic. Everything below is pure, which is the point:
 * the card, the sheet, the plan, the shopping list and the editor's preview
 * all go through these functions, so testing them here is testing the number
 * on every screen.
 */

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1, 12);

function ingredient(overrides: Partial<IngredientView> & { id: string }): IngredientView {
  return {
    name: overrides.id,
    unit: "cup",
    packLabel: "bag",
    packUnits: 4,
    prices: [],
    nutrition: { calories: 100, carbs: 10, sugar: 1, protein: 5, fat: 2 },
    ...overrides,
  };
}

function recipe(overrides: Partial<RecipeView> & { id: string }): RecipeView {
  return {
    name: overrides.id,
    feeds: 4,
    activeMinutes: 10,
    totalMinutes: 30,
    mealTimes: ["dinner"],
    type: "Entree",
    tags: [],
    url: "",
    instructions: "",
    lines: [],
    variantOf: null,
    photoUrl: null,
    ...overrides,
  };
}

const price = (store: string, value: number, estimated = false) => ({
  store,
  price: value,
  checkedAt: T0,
  estimated,
});

/* -------------------------------------------------------------------------- */

describe("quantities", () => {
  it("reads the ways a recipe card writes an amount", () => {
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity("1 1/2")).toBe(1.5);
    expect(parseQuantity("1-1/2")).toBe(1.5);
    expect(parseQuantity("3/4")).toBe(0.75);
    expect(parseQuantity("½")).toBe(0.5);
    expect(parseQuantity("1½")).toBe(1.5);
    expect(parseQuantity("1 ½")).toBe(1.5);
    expect(parseQuantity(".25")).toBe(0.25);
    expect(parseQuantity("0,5")).toBe(0.5);
  });

  it("refuses nothing, zero, negatives and nonsense rather than guessing", () => {
    for (const bad of ["", "  ", "0", "-1", "abc", "1/0", "two"]) {
      expect(parseQuantity(bad)).toBeNull();
    }
  });

  it("writes numbers the way a recipe card would", () => {
    expect(formatQuantity(1.5)).toBe("1½");
    expect(formatQuantity(0.25)).toBe("¼");
    expect(formatQuantity(1 / 3)).toBe("⅓");
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(0.999)).toBe("1");
    // Not within a hair of a nice fraction: decimals, not an invented one.
    expect(formatQuantity(2.4)).toBe("2.4");
  });

  it("round-trips what it writes", () => {
    for (const value of [0.125, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1.5, 3.25]) {
      expect(parseQuantity(formatQuantity(value))).toBeCloseTo(value, 2);
    }
  });

  it("converts within volume and weight, and nowhere else", () => {
    expect(convertQuantity(3, "tbsp", "cup")).toBeCloseTo(0.1875);
    expect(convertQuantity(1, "cup", "tsp")).toBe(48);
    expect(convertQuantity(8, "oz", "lb")).toBe(0.5);
    expect(convertQuantity(2, "egg", "cup")).toBe(2);
    expect(unitChoices("cup")).toEqual(["tsp", "tbsp", "cup"]);
    expect(unitChoices("egg")).toEqual(["egg"]);
    expect(unitChoices("cup dry")).toEqual(["cup dry"]);
  });

  it("says an amount in the unit a person would", () => {
    expect(friendlyAmount(0.1875, "cup")).toEqual({ qty: 3, unit: "tbsp" });
    expect(friendlyAmount(16, "tbsp")).toEqual({ qty: 1, unit: "cup" });
    expect(friendlyAmount(0.5, "lb")).toEqual({ qty: 8, unit: "oz" });
    expect(friendlyAmount(20, "oz")).toEqual({ qty: 1.25, unit: "lb" });
    expect(friendlyAmount(3, "egg")).toEqual({ qty: 3, unit: "egg" });
  });

  it("pluralises units, including the awkward ones", () => {
    expect(pluralUnit("cup", 2)).toBe("cups");
    expect(pluralUnit("cup", 1)).toBe("cup");
    expect(pluralUnit("tbsp", 3)).toBe("tbsp");
    expect(pluralUnit("tomato", 3)).toBe("tomatoes");
    expect(pluralUnit("loaf", 2)).toBe("loaves");
    expect(pluralUnit("box", 2)).toBe("boxes");
    expect(pluralUnit("bunch", 2)).toBe("bunches");
    expect(pluralUnit("cup dry", 3)).toBe("cups dry");
    expect(pluralUnit("hot dog", 16)).toBe("hot dogs");
    expect(describeAmount(0.125, "cup")).toBe("2 tbsp");
    expect(describeAmount(2, "egg")).toBe("2 eggs");
  });
});

/* -------------------------------------------------------------------------- */

describe("costing", () => {
  const cheese = ingredient({
    id: "cheese",
    packUnits: 8,
    prices: [price("Walmart", 8), price("Broulim's", 10)],
    nutrition: { calories: 400, carbs: 2, sugar: 0, protein: 24, fat: 32 },
  });
  const tortillas = ingredient({
    id: "tortillas",
    unit: "tortilla",
    packUnits: 10,
    prices: [price("Walmart", 3), price("Broulim's", 2.5)],
    nutrition: { calories: 140, carbs: 24, sugar: 1, protein: 4, fat: 3.5 },
  });
  const byId = indexIngredients([cheese, tortillas]);
  const quesadillas = recipe({
    id: "q",
    feeds: 5,
    lines: [
      { ingredientId: "cheese", qty: 2, note: "" },
      { ingredientId: "tortillas", qty: 10, note: "" },
    ],
  });

  it("prices each ingredient at its cheapest store, independently", () => {
    expect(cheapestPrice(cheese)?.store).toBe("Walmart");
    expect(cheapestPrice(tortillas)?.store).toBe("Broulim's");
    expect(unitCost(cheese)).toBe(1);
    expect(unitCost(tortillas)).toBe(0.25);
  });

  it("compares a store's own bigger pack fairly, per unit", () => {
    const bulk = ingredient({
      id: "bulk",
      packLabel: "2 lb bag",
      packUnits: 8,
      prices: [price("Walmart", 8), { ...price("Costco", 17), packLabel: "5 lb bag", packUnits: 20 }],
    });
    // $17 for 20 cups beats $8 for 8 cups, per cup.
    expect(cheapestPrice(bulk)?.store).toBe("Costco");
    expect(unitCost(bulk)).toBeCloseTo(0.85);
    expect(packOf(bulk, bulk.prices[1])).toEqual({ label: "5 lb bag", units: 20 });
    expect(packOf(bulk, bulk.prices[0])).toEqual({ label: "2 lb bag", units: 8 });
  });

  it("buys where the amount needed costs least, not where a unit does", () => {
    const bulk = ingredient({
      id: "bulk",
      packLabel: "2 lb bag",
      packUnits: 8,
      prices: [price("Walmart", 8), { ...price("Costco", 17), packLabel: "5 lb bag", packUnits: 20 }],
    });
    // A cup: one Walmart bag ($8) beats one Costco bag ($17).
    expect(bestBuy(bulk, 1)).toMatchObject({ packs: 1, cost: 8, packLabel: "2 lb bag" });
    expect(bestBuy(bulk, 1)?.price.store).toBe("Walmart");
    // Eighteen cups: three Walmart bags ($24) lose to one Costco bag ($17).
    expect(bestBuy(bulk, 18)).toMatchObject({ packs: 1, cost: 17, packLabel: "5 lb bag" });
    expect(bestBuy(ingredient({ id: "none", prices: [] }), 1)).toBeNull();
  });

  it("costs what the recipe uses, adds tax, and divides by who it feeds", () => {
    const costed = costRecipe(quesadillas, byId);
    // 2 cups at $1 + 10 tortillas at 25¢ = $4.50, then tax.
    expect(costed.subtotal).toBeCloseTo(4.5);
    expect(costed.total).toBeCloseTo(4.5 * (1 + SALES_TAX_RATE));
    expect(costed.perPerson).toBeCloseTo((4.5 * (1 + SALES_TAX_RATE)) / 5);
    expect(costed.family).toBeCloseTo(costed.perPerson! * FAMILY_SIZE);
    expect(costed.priced).toBe(true);
  });

  it("costs the family of seven, from the roster", () => {
    expect(FAMILY_SIZE).toBe(7);
    expect(FAMILY_SIZE).toBe(FAMILY.length);
  });

  it("scales the lines and total, never the per-person price", () => {
    const asWritten = costRecipe(quesadillas, byId);
    const forTen = costRecipe(quesadillas, byId, 10);
    expect(forTen.total).toBeCloseTo(asWritten.total * 2);
    expect(forTen.lines[0].qty).toBe(4);
    expect(forTen.perPerson).toBeCloseTo(asWritten.perPerson!);
    expect(forTen.nutrition?.calories).toBeCloseTo(asWritten.nutrition!.calories);
  });

  it("works out nutrition per person", () => {
    const costed = costRecipe(quesadillas, byId);
    expect(costed.nutrition?.calories).toBeCloseTo((2 * 400 + 10 * 140) / 5);
    expect(costed.nutrition?.protein).toBeCloseTo((2 * 24 + 10 * 4) / 5);
  });

  it("says when a price or nutrition is missing, rather than pretending it is free", () => {
    const salsa = ingredient({ id: "salsa", prices: [], nutrition: null });
    const withSalsa = recipe({
      ...quesadillas,
      lines: [...quesadillas.lines, { ingredientId: "salsa", qty: 1, note: "" }],
    });
    const costed = costRecipe(withSalsa, indexIngredients([cheese, tortillas, salsa]));
    expect(costed.priced).toBe(false);
    expect(costed.unpriced).toEqual(["salsa"]);
    expect(costed.missingNutrition).toEqual(["salsa"]);
    expect(costed.lines[2].cost).toBeNull();
    // No per-person or family cost at all — a total missing the salsa is not
    // what the meal costs.
    expect(costed.perPerson).toBeNull();
    expect(costed.family).toBeNull();
    // An untrustworthy figure earns no tag from it.
    expect(costed.autoTags).not.toContain("under $1");
    expect(costed.autoTags.some((tag) => tag.startsWith("low-"))).toBe(false);
  });

  it("copes with an ingredient that has been deleted from under a recipe", () => {
    const orphan = recipe({ id: "o", lines: [{ ingredientId: "gone", qty: 1, note: "" }] });
    const costed = costRecipe(orphan, byId);
    expect(costed.priced).toBe(false);
    expect(costed.lines[0].ingredient).toBeNull();
  });

  it("applies only the tightest time tag", () => {
    expect(autoTags({ perPerson: null, totalMinutes: 15, nutrition: null })).toEqual([
      "under 20 min",
      "quick",
    ]);
    expect(autoTags({ perPerson: null, totalMinutes: 45, nutrition: null })).toEqual([
      "under 1 hour",
    ]);
    expect(autoTags({ perPerson: null, totalMinutes: 480, nutrition: null })).toEqual(["slow"]);
  });

  it("tags by cost and nutrition from the thresholds", () => {
    const tags = autoTags({
      perPerson: 0.8,
      totalMinutes: 0,
      nutrition: { calories: 350, carbs: 15, sugar: 3, protein: 30, fat: 8 },
    });
    expect(tags).toEqual(
      expect.arrayContaining(["under $1", "low-calorie", "high-protein", "low-carb", "low-sugar", "low-fat"]),
    );
    expect(tags).not.toContain("high-calorie");
  });

  it("counts only confirmed prices as checked", () => {
    const estimated = ingredient({ id: "e", prices: [price("Walmart", 1, true)] });
    const mixed = ingredient({
      id: "m",
      prices: [price("Walmart", 1, true), { ...price("Costco", 2), checkedAt: T0 - DAY }],
    });
    expect(lastChecked(estimated)).toBeNull();
    expect(lastChecked(mixed)).toBe(T0 - DAY);
  });

  it("says prices the way a price tag does", () => {
    expect(formatMoney(0.08)).toBe("8¢");
    expect(formatMoney(0.004)).toBe("1¢");
    expect(formatMoney(1.27)).toBe("$1.27");
    expect(formatMoney(null)).toBe("—");
    expect(formatMinutes(20)).toBe("20 min");
    expect(formatMinutes(75)).toBe("1 h 15 min");
    expect(formatMinutes(480)).toBe("8 h");
    expect(formatMinutes(0)).toBe("—");
  });
});

/* -------------------------------------------------------------------------- */

describe("finding a meal", () => {
  const cheese = ingredient({ id: "cheese", name: "Cheddar cheese", prices: [price("Walmart", 4)] });
  const beans = ingredient({ id: "beans", name: "Refried beans", prices: [] });
  const byId = indexIngredients([cheese, beans]);

  const nachos = recipe({
    id: "nachos",
    name: "Nachos (Basic)",
    totalMinutes: 15,
    lines: [{ ingredientId: "cheese", qty: 1, note: "" }],
  });
  const supreme = recipe({ id: "supreme", name: "Nachos Supreme", variantOf: "nachos" });
  const deluxe = recipe({ id: "deluxe", name: "Nachos Deluxe", variantOf: "supreme" });
  const orphan = recipe({ id: "orphan", name: "Orphan", variantOf: "deleted" });
  const beany = recipe({
    id: "beany",
    name: "Bean Burritos",
    mealTimes: ["lunch"],
    type: "Mexican",
    totalMinutes: 90,
    lines: [{ ingredientId: "beans", qty: 1, note: "" }],
  });

  it("collapses versions into one card, chains included, orphans kept", () => {
    const groups = groupVersions([nachos, supreme, deluxe, orphan, beany]);
    const nachoGroup = groups.find((g) => g.primary.id === "nachos");
    expect(nachoGroup?.versions.map((v) => v.id)).toEqual(["nachos", "supreme", "deluxe"]);
    expect(groups.map((g) => g.primary.id).sort()).toEqual(["beany", "nachos", "orphan"]);
  });

  it("searches word by word, across names and ingredients", () => {
    expect(matchesSearch(nachos, "basic nachos", byId)).toBe(true);
    expect(matchesSearch(nachos, "cheddar", byId)).toBe(true);
    expect(matchesSearch(nachos, "CHÉDDAR", byId)).toBe(true);
    expect(matchesSearch(nachos, "beans", byId)).toBe(false);
    expect(matchesSearch(beany, "refried", byId)).toBe(true);
  });

  it("filters on the card's own numbers, and searches every version", () => {
    const groups = groupVersions([nachos, supreme, beany]);
    const costs = costAll([nachos, supreme, beany], [cheese, beans]);
    const context = { costs, state: EMPTY_FAMILY_STATE, ingredientsById: byId };
    const shown = (filters: Partial<typeof DEFAULT_FILTERS>) =>
      groups
        .filter((group) => groupMatches(group, { ...DEFAULT_FILTERS, ...filters }, context))
        .map((group) => group.primary.id);

    expect(shown({})).toEqual(["nachos", "beany"]);
    expect(shown({ query: "supreme" })).toEqual(["nachos"]);
    expect(shown({ mealTime: "lunch" })).toEqual(["beany"]);
    expect(shown({ type: "Mexican" })).toEqual(["beany"]);
    expect(shown({ time: "30" })).toEqual(["nachos"]);
    // Unpriced meals never pass a price ceiling.
    expect(shown({ price: "3" })).toEqual(["nachos"]);
    expect(shown({ tag: "under 20 min" })).toEqual(["nachos"]);
    expect(shown({ favoritesOnly: true })).toEqual([]);
  });

  it("finds a favourite through any of its versions", () => {
    const groups = groupVersions([nachos, supreme]);
    const state: FamilyMealState = { ...EMPTY_FAMILY_STATE, favorites: ["supreme"] };
    const context = { costs: costAll([nachos, supreme], [cheese]), state, ingredientsById: byId };
    expect(groupMatches(groups[0], { ...DEFAULT_FILTERS, favoritesOnly: true }, context)).toBe(true);
  });

  it("sorts unpriced meals last in both directions", () => {
    const groups = groupVersions([nachos, beany]);
    const context = { costs: costAll([nachos, beany], [cheese, beans]), state: EMPTY_FAMILY_STATE };
    expect(sortGroups(groups, "cheapest", context).map((g) => g.primary.id)).toEqual(["nachos", "beany"]);
    expect(sortGroups(groups, "priciest", context).map((g) => g.primary.id)).toEqual(["nachos", "beany"]);
  });

  it("puts never-made meals first, then the longest since", () => {
    const a = recipe({ id: "a", name: "A" });
    const b = recipe({ id: "b", name: "B" });
    const c = recipe({ id: "c", name: "C" });
    const state: FamilyMealState = {
      ...EMPTY_FAMILY_STATE,
      cooked: { a: ["2026-09-20"], c: ["2026-08-01"] },
    };
    const sorted = sortGroups(groupVersions([a, b, c]), "not-lately", { costs: new Map(), state });
    expect(sorted.map((g) => g.primary.id)).toEqual(["b", "c", "a"]);
  });

  it("summarises what is shown", () => {
    const groups = groupVersions([nachos, beany]);
    const summary = summarise(groups, costAll([nachos, beany], [cheese, beans]));
    expect(summary.count).toBe(2);
    expect(summary.cheapest?.group.primary.id).toBe("nachos");
    expect(summary.averagePerPerson).toBeCloseTo(summary.cheapest!.perPerson);
  });

  it("counts the faces", () => {
    expect(summariseRatings({ nathan: 3, sarah: 3, james: 1 })).toEqual({
      love: 2,
      ok: 0,
      no: 1,
      average: 7 / 3,
    });
    expect(summariseRatings(undefined).average).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("the plan and its shopping list", () => {
  const cheese = ingredient({
    id: "cheese",
    name: "Cheddar",
    packLabel: "2 lb bag",
    packUnits: 8,
    prices: [price("Walmart", 8), price("Broulim's", 9)],
  });
  const lime = ingredient({
    id: "lime",
    name: "Limes",
    unit: "lime",
    packLabel: "each",
    packUnits: 1,
    prices: [price("Walmart", 0.4), price("Broulim's", 0.3)],
  });
  const garlic = ingredient({
    id: "garlic",
    name: "Garlic",
    unit: "clove",
    packLabel: "3 bulb pack (~30 cloves)",
    packUnits: 30,
    prices: [price("Walmart", 1.5)],
  });
  const saffron = ingredient({ id: "saffron", name: "Saffron", prices: [] });
  const ingredients = indexIngredients([cheese, lime, garlic, saffron]);

  const tacos = recipe({
    id: "tacos",
    name: "Tacos",
    feeds: 7,
    lines: [
      { ingredientId: "cheese", qty: 3, note: "" },
      { ingredientId: "lime", qty: 2, note: "" },
    ],
  });
  const soup = recipe({
    id: "soup",
    name: "Soup",
    feeds: 7,
    lines: [
      { ingredientId: "cheese", qty: 2, note: "" },
      { ingredientId: "garlic", qty: 3, note: "" },
      { ingredientId: "saffron", qty: 1, note: "" },
    ],
  });
  const recipes = new Map([tacos, soup].map((r) => [r.id, r]));

  const plan = {
    entries: [
      { id: "1", recipeId: "soup", servings: 7, day: null },
      { id: "2", recipeId: "tacos", servings: 14, day: 4 },
      { id: "3", recipeId: "deleted", servings: 7, day: 0 },
    ],
    haveIt: [],
  };

  it("rounds whole packs up, forgiving floating-point dust", () => {
    expect(packsFor(2.0000000000000004, 2)).toBe(1);
    expect(packsFor(2.01, 2)).toBe(2);
    expect(packsFor(0.1, 8)).toBe(1);
  });

  it("adds every meal's need together before rounding to packs", () => {
    const list = buildShoppingList(plan, recipes, ingredients);
    const cheeseNeed = list.byStore.flatMap((g) => g.items).find((n) => n.ingredient.id === "cheese");
    // Tacos doubled: 6 cups, plus soup's 2 = 8 cups = exactly one 8-cup bag.
    expect(cheeseNeed?.need).toBeCloseTo(8);
    expect(cheeseNeed?.packs).toBe(1);
    expect(cheeseNeed?.recipes).toEqual(["Soup", "Tacos"]);
    expect(list.mealCount).toBe(2);
  });

  it("splits by the store each item is cheapest at", () => {
    const list = buildShoppingList(plan, recipes, ingredients);
    const stores = Object.fromEntries(
      list.byStore.map((group) => [group.store, group.items.map((n) => n.ingredient.id)]),
    );
    expect(stores).toEqual({ Walmart: ["cheese", "garlic"], "Broulim's": ["lime"] });
    expect(list.unpriced.map((n) => n.ingredient.id)).toEqual(["saffron"]);
    expect(list.total).toBeCloseTo(list.subtotal * (1 + SALES_TAX_RATE));
  });

  it("compares against buying everything at one store, gaps filled at the cheapest", () => {
    const list = buildShoppingList(plan, recipes, ingredients);
    const walmart = list.comparisons.find((c) => c.store === "Walmart");
    const broulims = list.comparisons.find((c) => c.store === "Broulim's");
    // Walmart: cheese 8 + limes 4 × 0.40 + garlic 1.50.
    expect(walmart?.total).toBeCloseTo((8 + 1.6 + 1.5) * (1 + SALES_TAX_RATE));
    expect(walmart?.missing).toBe(0);
    // Broulim's has no garlic price: counted missing, bought at Walmart's.
    expect(broulims?.missing).toBe(1);
    expect(broulims?.total).toBeCloseTo((9 + 1.2 + 1.5) * (1 + SALES_TAX_RATE));
  });

  it("leaves out a store that sells none of the list, rather than an empty comparison", () => {
    const list = buildShoppingList(plan, recipes, ingredients);
    expect(list.comparisons.map((c) => c.store)).toEqual(["Walmart", "Broulim's"]);
  });

  it("buys the big pack only when the week needs that much", () => {
    const rice = ingredient({
      id: "rice",
      name: "Rice",
      packLabel: "5 lb bag",
      packUnits: 12,
      prices: [price("Walmart", 3.5), { ...price("Costco", 15), packLabel: "25 lb bag", packUnits: 60 }],
    });
    const pilaf = recipe({ id: "pilaf", name: "Pilaf", feeds: 7, lines: [{ ingredientId: "rice", qty: 3, note: "" }] });
    const byId = indexIngredients([rice]);
    const small = buildShoppingList(
      { entries: [{ id: "a", recipeId: "pilaf", servings: 7, day: null }], haveIt: [] },
      new Map([["pilaf", pilaf]]),
      byId,
    );
    expect(small.byStore.map((g) => g.store)).toEqual(["Walmart"]);
    const forServings = (servings: number) =>
      buildShoppingList(
        { entries: [{ id: "a", recipeId: "pilaf", servings, day: null }], haveIt: [] },
        new Map([["pilaf", pilaf]]),
        byId,
      ).byStore[0];
    // 24 cups: two Walmart bags ($7) beat Costco's one ($15).
    expect(forServings(56)).toMatchObject({ store: "Walmart", subtotal: 7 });
    // About 50 cups: five Walmart bags ($17.50) lose to Costco's one ($15).
    const party = forServings(117);
    expect(party.store).toBe("Costco");
    expect(shoppingLineName(party.items[0])).toBe("Rice — 25 lb bag");
    // 61 cups would take two Costco bags ($30) — six Walmart bags ($21) win back.
    expect(forServings(143).store).toBe("Walmart");
  });

  it("leaves pantry items off the list, and keeps them to put back", () => {
    const list = buildShoppingList({ ...plan, haveIt: ["cheese"] }, recipes, ingredients);
    expect(list.have.map((n) => n.ingredient.id)).toEqual(["cheese"]);
    expect(list.byStore.flatMap((g) => g.items).some((n) => n.ingredient.id === "cheese")).toBe(false);
  });

  it("names lines for the family list without brackets in brackets", () => {
    const list = buildShoppingList(plan, recipes, ingredients);
    const names = list.byStore.flatMap((g) => g.items).map(shoppingLineName);
    expect(names).toContain("Garlic — 3 bulb pack (~30 cloves)");
    expect(names).toContain("Cheddar — 2 lb bag");
    expect(names).toContain("Limes — 4");
    expect(shoppingListText(list)).toContain("No price yet");
  });

  it("gives no budget while any planned meal is missing a price", () => {
    const budget = budgetPlan(plan, recipes, ingredients);
    expect(orderPlan(plan.entries).map((e) => e.id)).toEqual(["3", "2", "1"]);
    expect(budget.meals.map((m) => m.recipe?.id ?? null)).toEqual([null, "tacos", "soup"]);
    // The soup's saffron has no price: a budget without it is not the budget.
    expect(budget.partlyPriced).toBe(1);
    expect(budget.total).toBeNull();
    expect(budget.perServing).toBeNull();
  });

  it("budgets what the meals use once every one is priced, skipping deleted meals", () => {
    const pricedSaffron = { ...saffron, prices: [price("Walmart", 12)] };
    const all = indexIngredients([cheese, lime, garlic, pricedSaffron]);
    const budget = budgetPlan(plan, recipes, all);
    const tacosCost = costRecipe(tacos, all, 14).total;
    const soupCost = costRecipe(soup, all, 7).total;
    expect(budget.total).toBeCloseTo(tacosCost + soupCost);
    expect(budget.perServing).toBeCloseTo((tacosCost + soupCost) / 21);
  });
});

/* -------------------------------------------------------------------------- */

describe("optimistic changes", () => {
  const start: FamilyMealState = {
    favorites: ["a"],
    ratings: { a: { nathan: 3 } },
    cooked: { a: ["2026-09-01"] },
    plan: { entries: [{ id: "p1", recipeId: "a", servings: 7, day: null }], haveIt: ["x"] },
  };

  it("favourites on and off", () => {
    expect(applyMealChange(start, { kind: "favorite", recipeId: "b", favorite: true }).favorites).toEqual(["a", "b"]);
    expect(applyMealChange(start, { kind: "favorite", recipeId: "a", favorite: false }).favorites).toEqual([]);
  });

  it("rates, and clears a rating with 0", () => {
    expect(applyMealChange(start, { kind: "rate", recipeId: "a", personId: "sarah", score: 1 }).ratings.a).toEqual({
      nathan: 3,
      sarah: 1,
    });
    expect(applyMealChange(start, { kind: "rate", recipeId: "a", personId: "nathan", score: 0 }).ratings.a).toEqual({});
  });

  it("logs a day newest first, once", () => {
    const made = applyMealChange(start, { kind: "cooked", recipeId: "a", day: "2026-09-10", made: true });
    expect(made.cooked.a).toEqual(["2026-09-10", "2026-09-01"]);
    const again = applyMealChange(made, { kind: "cooked", recipeId: "a", day: "2026-09-10", made: true });
    expect(again.cooked.a).toEqual(["2026-09-10", "2026-09-01"]);
    expect(applyMealChange(made, { kind: "cooked", recipeId: "a", day: "2026-09-10", made: false }).cooked.a).toEqual([
      "2026-09-01",
    ]);
  });

  it("adds, changes and removes plan entries, and never adds one twice", () => {
    const entry = { id: "p2", recipeId: "b", servings: 4, day: 2 };
    const added = applyMealChange(start, { kind: "plan-add", entry });
    expect(added.plan.entries).toHaveLength(2);
    expect(applyMealChange(added, { kind: "plan-add", entry }).plan.entries).toHaveLength(2);
    const changed = applyMealChange(added, { kind: "plan-update", id: "p2", servings: 9 });
    expect(changed.plan.entries[1]).toEqual({ ...entry, servings: 9 });
    expect(applyMealChange(changed, { kind: "plan-update", id: "p2", day: null }).plan.entries[1].day).toBeNull();
    expect(applyMealChange(changed, { kind: "plan-remove", id: "p1" }).plan.entries.map((e) => e.id)).toEqual(["p2"]);
  });

  it("clears the plan and the pantry together, and toggles the pantry", () => {
    expect(applyMealChange(start, { kind: "plan-clear" }).plan).toEqual({ entries: [], haveIt: [] });
    expect(applyMealChange(start, { kind: "have", ingredientId: "y", have: true }).plan.haveIt).toEqual(["x", "y"]);
    expect(applyMealChange(start, { kind: "have", ingredientId: "x", have: false }).plan.haveIt).toEqual([]);
  });

  it("never mutates the state it was given", () => {
    const frozen = structuredClone(start);
    applyMealChange(start, { kind: "rate", recipeId: "a", personId: "nathan", score: 0 });
    applyMealChange(start, { kind: "plan-update", id: "p1", servings: 3 });
    expect(start).toEqual(frozen);
  });
});

/* -------------------------------------------------------------------------- */

describe("merging typed prices onto stored ones", () => {
  const before = [
    { store: "Walmart", price: 2.5, checkedAt: new Date(T0 - 30 * DAY), estimated: true },
    { store: "Broulim's", price: 3, checkedAt: new Date(T0 - 30 * DAY), estimated: false },
  ];
  const now = new Date(T0);

  it("keeps an unchanged price's date and flag", () => {
    const merged = mergePrices(before, [{ store: "Walmart", price: 2.5 }], now, false);
    expect(merged[0]).toEqual(before[0]);
  });

  it("dates a changed price today and stops calling it an estimate", () => {
    const merged = mergePrices(before, [{ store: "Walmart", price: 2.25 }], now, false);
    expect(merged[0]).toEqual({ store: "Walmart", price: 2.25, checkedAt: now, estimated: false });
  });

  it("dates every price today when told they were all just checked", () => {
    const merged = mergePrices(before, [{ store: "Walmart", price: 2.5 }, { store: "Broulim's", price: 3 }], now, true);
    expect(merged.every((p) => p.checkedAt === now && !p.estimated)).toBe(true);
  });

  it("treats a new pack size as a new price, and keeps a store's own pack", () => {
    const merged = mergePrices(
      before,
      [{ store: "Walmart", price: 2.5, packLabel: "5 lb bag", packUnits: 20 }],
      now,
      false,
    );
    expect(merged[0]).toEqual({
      store: "Walmart",
      price: 2.5,
      checkedAt: now,
      estimated: false,
      packLabel: "5 lb bag",
      packUnits: 20,
    });
  });

  it("drops a store left out", () => {
    expect(mergePrices(before, [{ store: "Costco", price: 2 }], now, false).map((p) => p.store)).toEqual(["Costco"]);
  });
});

/* -------------------------------------------------------------------------- */

describe("ages and dates", () => {
  it("describes how long ago", () => {
    expect(describeAge(0)).toBe("today");
    expect(describeAge(1)).toBe("yesterday");
    expect(describeAge(12)).toBe("12 days ago");
    expect(describeAge(90)).toBe("3 months ago");
    expect(describeAge(800)).toBe("2 years ago");
  });

  it("describes the last time a meal was made, in local days", () => {
    const today = new Date(2026, 8, 28, 21, 0);
    expect(describeLastMade(null, today)).toBe("Not logged yet");
    expect(describeLastMade("2026-09-28", today)).toBe("Made today");
    expect(describeLastMade("2026-09-03", today)).toMatch(/^Last made .* · 25 days ago$/);
    expect(describeLastMade("not a date", today)).toBe("Not logged yet");
  });
});

/* -------------------------------------------------------------------------- */

describe("the starter catalog", () => {
  it("has no broken references", () => {
    expect(findSeedProblem()).toBeNull();
  });

  it("gives every key a distinct, ObjectId-shaped id that never changes", () => {
    const ids = [
      ...SEED_INGREDIENTS.map((i) => seedId("ingredient", i.key)),
      ...SEED_RECIPES.map((r) => seedId("recipe", r.key)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{24}$/);
    // Pinned: changing the hash would orphan every plan, rating and favourite
    // already saved against the seeded meals.
    expect(seedId("recipe", "tacos-beef")).toBe("d0ee59e00fe3db3c9475c144");
  });

  it("seeds no price at all — every one has to be checked by somebody", () => {
    const catalog = compiledCatalog();
    for (const item of catalog.ingredients) {
      expect(item.prices, item.name).toEqual([]);
      expect(item.packUnits, item.name).toBeGreaterThan(0);
    }
    const costs = costAll(catalog.recipes, catalog.ingredients);
    for (const meal of catalog.recipes) {
      const cost = costs.get(meal.id);
      expect(cost?.perPerson, meal.name).toBeNull();
      expect(cost?.missingNutrition, meal.name).toEqual([]);
      expect(meal.mealTimes.length, meal.name).toBeGreaterThan(0);
    }
  });

  it("uses every starter ingredient in at least one meal", () => {
    const catalog = compiledCatalog();
    const usage = ingredientUsage(catalog.recipes);
    const unused = catalog.ingredients.filter((i) => !usage.has(i.id)).map((i) => i.name);
    expect(unused).toEqual([]);
  });

  it("carries the family's own recipes as a second batch, each with its link", () => {
    const batch = SEED_BATCHES.find((b) => b.id === "family-favorites-2026-09");
    expect(batch?.recipes).toHaveLength(54);
    const catalog = compiledCatalog();
    const withLinks = batch!.recipes.filter((r) => r.url);
    expect(withLinks.length).toBeGreaterThanOrEqual(45);
    for (const recipe of batch!.recipes) {
      const view = catalog.recipes.find((r) => r.id === seedId("recipe", recipe.key));
      expect(view?.instructions, recipe.name).toBeTruthy();
      expect(view?.lines.length, recipe.name).toBeGreaterThan(0);
    }
  });

  it("puts the family's recipe on top of the starter one it supersedes", () => {
    const catalog = compiledCatalog();
    const byId = new Map(catalog.recipes.map((r) => [r.id, r]));
    const starterWaffles = byId.get(seedId("recipe", "waffles"));
    expect(starterWaffles?.variantOf).toBe(seedId("recipe", "fam-waffles"));
    // Same name as the family's — renamed, so the switcher can tell them apart.
    expect(starterWaffles?.name).toBe("Waffles (starter)");
    // A different name is left alone.
    expect(byId.get(seedId("recipe", "teriyaki-chicken"))?.name).toBe("Teriyaki Chicken & Rice");
    // A chain collapses: Tacos (chicken) → Tacos (beef) → the family's Tacos.
    const tacos = groupVersions(catalog.recipes).find((g) => g.primary.name === "Tacos");
    expect(tacos?.versions.map((v) => v.name).sort()).toEqual(["Tacos", "Tacos (beef)", "Tacos (chicken)"]);
  });

  it("names no two versions of one meal the same", () => {
    for (const group of groupVersions(compiledCatalog().recipes)) {
      const names = group.versions.map((v) => v.name);
      expect(new Set(names).size, names.join(" / ")).toBe(names.length);
    }
  });

  it("covers every tab on the Meals list", () => {
    const catalog = compiledCatalog();
    for (const time of ["breakfast", "lunch", "dinner", "side", "dessert", "other"] as const) {
      expect(catalog.recipes.some((r) => r.mealTimes.includes(time)), time).toBe(true);
    }
  });
});
