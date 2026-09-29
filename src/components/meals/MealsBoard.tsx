"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";

import type { PersonId } from "@/config/family";
import { FAMILY_SIZE, type MealSortId, type RatingScore } from "@/config/meals";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import { toIsoDate } from "@/lib/dates";
import type { MealActionResult } from "@/lib/meals/action-result";
import {
  addMealToPlan,
  clearMealPlan,
  finishPlanEntry,
  logMealCooked,
  rateMeal,
  removeFromPlan,
  sendPlanToShoppingList,
  setMealFavorite,
  setPantryItem,
  updatePlanEntry,
} from "@/lib/meals/actions";
import { saveIngredientPrices } from "@/lib/meals/admin-actions";
import {
  DEFAULT_FILTERS,
  allTags,
  groupMatches,
  groupVersions,
  sortGroups,
  summarise,
  type MealFilters,
} from "@/lib/meals/browse";
import { costAll, indexIngredients, ingredientUsage } from "@/lib/meals/costing";
import { applyMealChange, type MealStateChange } from "@/lib/meals/optimistic";
import type { TypedPrice } from "@/lib/meals/prices";
import type { FamilyMealState, MealsCatalog } from "@/lib/meals/types";
import { newItemId } from "@/lib/shopping/list";

import { MealList } from "./MealList";
import { MealSheet, type MealSheetActions } from "./MealSheet";
import { PlanView, type PlanActions } from "./PlanView";
import { PricesView } from "./PricesView";
import { DiceIcon, MUTED_TEXT, ON_PAGE_STYLE, PRIMARY_STYLE } from "./ui";

export type MealsTab = "meals" | "plan" | "prices";

const TABS: readonly { id: MealsTab; label: string }[] = [
  { id: "meals", label: "Meals" },
  { id: "plan", label: "Plan" },
  { id: "prices", label: "Prices" },
];

/**
 * The Meals page: the list, the week's plan and the price book.
 *
 * ---------------------------------------------------------------------------
 * WHY `useOptimistic` IS RIGHT HERE WHEN IT WAS WRONG FOR THE SHOPPING LIST
 * ---------------------------------------------------------------------------
 * `useOptimistic` drops its overlay the moment the transition settles. The
 * shopping list does not revalidate — it has a live stream instead — so there
 * the overlay would fall away before the truth arrived and every tick would
 * blink. Every action here *does* revalidate, and Next.js delivers the
 * re-rendered page in the same response that settles the transition, so the
 * overlay and the server's answer change places on one frame. A failure is
 * the same mechanism in reverse: the overlay falls away onto unchanged props,
 * which is exactly the undo it should be, and the message says why.
 */
export function MealsBoard({
  catalog,
  state: serverState,
  unlocked,
  initialTab,
  initialMealId,
  initialDateIso,
}: {
  catalog: MealsCatalog;
  state: FamilyMealState;
  unlocked: boolean;
  initialTab: MealsTab;
  initialMealId: string | null;
  initialDateIso: string;
}) {
  const [state, applyOptimistic] = useOptimistic(serverState, applyMealChange);
  const [, startTransition] = useTransition();
  const today = useCurrentDate(initialDateIso);
  const readOnly = catalog.source !== "database";

  const [tab, setTab] = useState<MealsTab>(initialTab);
  const [filters, setFilters] = useState<MealFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<MealSortId>("cheapest");
  const [notice, setNotice] = useState<string | null>(null);

  /* --- Derived, all in the browser ------------------------------------ */

  const ingredientsById = useMemo(() => indexIngredients(catalog.ingredients), [catalog.ingredients]);
  const recipesById = useMemo(
    () => new Map(catalog.recipes.map((recipe) => [recipe.id, recipe])),
    [catalog.recipes],
  );
  const costs = useMemo(() => costAll(catalog.recipes, catalog.ingredients), [catalog]);
  const groups = useMemo(() => groupVersions(catalog.recipes), [catalog.recipes]);
  const usage = useMemo(() => ingredientUsage(catalog.recipes), [catalog.recipes]);
  const tags = useMemo(() => allTags(catalog.recipes, costs), [catalog.recipes, costs]);

  const shown = useMemo(() => {
    const context = { costs, state, ingredientsById };
    return sortGroups(
      groups.filter((group) => groupMatches(group, filters, context)),
      sort,
      { costs, state },
    );
  }, [groups, filters, sort, costs, state, ingredientsById]);
  const summary = useMemo(() => summarise(shown, costs), [shown, costs]);

  /* --- Opening a meal -------------------------------------------------- */

  // A shared link — `/meals?meal=…` — opens straight onto that meal.
  const [open, setOpen] = useState<{ groupId: string; recipeId: string } | null>(() => {
    if (!initialMealId) return null;
    const group = groups.find((g) => g.versions.some((version) => version.id === initialMealId));
    return group ? { groupId: group.primary.id, recipeId: initialMealId } : null;
  });

  const groupFor = useCallback(
    (recipeId: string) =>
      groups.find((group) => group.versions.some((version) => version.id === recipeId)) ?? null,
    [groups],
  );

  const openMeal = useCallback(
    (recipeId: string) => {
      const group = groupFor(recipeId);
      if (group) setOpen({ groupId: group.primary.id, recipeId });
    },
    [groupFor],
  );

  const openGroup = open ? groups.find((group) => group.primary.id === open.groupId) ?? null : null;

  function pickRandom() {
    const pool = tab === "meals" ? shown : groups;
    if (pool.length === 0) {
      setNotice("Nothing to pick from with these filters.");
      return;
    }
    const group = pool[Math.floor(Math.random() * pool.length)];
    openMeal(group.primary.id);
  }

  function chooseTab(next: MealsTab) {
    setTab(next);
    // Remembered in the address, so a reload or a home-screen resume lands on
    // the same tab — without a navigation, which would re-run the page.
    const url = new URL(window.location.href);
    if (next === "meals") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    url.searchParams.delete("meal");
    window.history.replaceState(null, "", url);
  }

  /* --- Saving ---------------------------------------------------------- */

  const run = useCallback(
    (change: MealStateChange, action: () => Promise<MealActionResult>, done?: string) => {
      if (readOnly) {
        setNotice("The meals database can't be reached right now, so nothing can be saved.");
        return;
      }
      startTransition(async () => {
        applyOptimistic(change);
        const result = await action();
        setNotice(result.ok ? (done ?? null) : result.message);
      });
    },
    [applyOptimistic, readOnly],
  );

  const todayIso = toIsoDate(today);

  const sheetActions: MealSheetActions = {
    onFavorite: (recipeId, favorite) =>
      run({ kind: "favorite", recipeId, favorite }, () => setMealFavorite({ recipeId, favorite })),
    onRate: (recipeId: string, personId: PersonId, score: RatingScore | 0) =>
      run({ kind: "rate", recipeId, personId, score }, () => rateMeal({ recipeId, personId, score })),
    onCooked: (recipeId, made) =>
      run(
        { kind: "cooked", recipeId, day: todayIso, made },
        () => logMealCooked({ recipeId, day: todayIso, made }),
      ),
    onAddToPlan: (recipeId, servings, day) => {
      const entry = { id: newItemId(), recipeId, servings, day };
      run({ kind: "plan-add", entry }, () => addMealToPlan(entry), "Added to this week's plan.");
    },
    onNotice: setNotice,
  };

  const planActions: PlanActions = {
    onUpdate: (id, patch) =>
      run({ kind: "plan-update", id, ...patch }, () => updatePlanEntry({ id, ...patch })),
    onRemove: (id) => run({ kind: "plan-remove", id }, () => removeFromPlan({ id })),
    onMade: (id, recipeId) =>
      run(
        { kind: "plan-remove", id },
        () => finishPlanEntry({ id, recipeId, day: todayIso }),
        "Logged as made today.",
      ),
    onClear: () => run({ kind: "plan-clear" }, () => clearMealPlan(), "Plan cleared."),
    onHave: (ingredientId, have) =>
      run({ kind: "have", ingredientId, have }, () => setPantryItem({ ingredientId, have })),
    onSendToList: async () => {
      if (readOnly) {
        setNotice("The meals database can't be reached right now.");
        return;
      }
      const result = await sendPlanToShoppingList();
      if (!result.ok) {
        setNotice(result.message);
        return;
      }
      const parts = [`Added ${result.added} to the shopping list`];
      if (result.alreadyThere > 0) parts.push(`${result.alreadyThere} already on it`);
      if (result.skippedFull > 0) parts.push(`${result.skippedFull} didn't fit — the list is full`);
      setNotice(`${parts.join(" · ")}.`);
    },
    onOpen: openMeal,
    onRandom: () => {
      chooseTab("meals");
      pickRandom();
    },
    onNotice: setNotice,
  };

  async function savePrices(id: string, prices: TypedPrice[]): Promise<boolean> {
    const result = await saveIngredientPrices({ id, prices });
    setNotice(result.ok ? "Prices saved." : result.message);
    return result.ok;
  }

  // Notices fade on their own; a new one restarts the clock.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const planCount = state.plan.entries.length;

  return (
    <>
      <header className="animate-soft-fade mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Meals</h1>
          <p className="mt-1 text-sm" style={MUTED_TEXT}>
            What each meal costs — per person, and for all {FAMILY_SIZE} of us.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={pickRandom}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={ON_PAGE_STYLE}
            title="Pick a random meal"
          >
            <DiceIcon className="h-6 w-6" />
            <span className="sr-only">Pick a random meal</span>
          </button>
          <Link
            href="/meals/admin"
            className="flex h-11 items-center rounded-full px-3.5 text-sm font-bold"
            style={unlocked ? PRIMARY_STYLE : ON_PAGE_STYLE}
          >
            {unlocked ? "Manage ✓" : "Manage"}
          </Link>
        </div>
      </header>

      {readOnly ? (
        <p
          role="status"
          className="mb-4 rounded-2xl px-4 py-3 text-sm font-semibold"
          style={ON_PAGE_STYLE}
        >
          The meals database can&apos;t be reached, so this is the built-in starter menu. Nothing can
          be saved until it&apos;s back.
        </p>
      ) : null}

      <div
        className="sticky top-0 z-20 -mx-4 mb-4 px-4 py-2 backdrop-blur"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-page-background) 85%, transparent)" }}
      >
        <div className="flex rounded-full p-1" style={ON_PAGE_STYLE} role="tablist" aria-label="Meals sections">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => chooseTab(item.id)}
                className="flex-1 rounded-full px-3 py-2 text-sm font-extrabold"
                style={selected ? PRIMARY_STYLE : undefined}
              >
                {item.label}
                {item.id === "plan" && planCount > 0 ? ` (${planCount})` : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="animate-soft-rise" key={tab}>
        {tab === "meals" ? (
          <MealList
            groups={shown}
            costs={costs}
            state={state}
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            summary={summary}
            tags={tags}
            onOpen={openMeal}
          />
        ) : null}
        {tab === "plan" ? (
          <PlanView
            state={state}
            recipesById={recipesById}
            ingredientsById={ingredientsById}
            readOnly={readOnly}
            actions={planActions}
          />
        ) : null}
        {tab === "prices" ? (
          <PricesView
            ingredients={catalog.ingredients}
            usage={usage}
            today={today}
            unlocked={unlocked}
            readOnly={readOnly}
            onSavePrices={savePrices}
          />
        ) : null}
      </div>

      {openGroup && open ? (
        <MealSheet
          key={open.groupId}
          group={openGroup}
          initialRecipeId={open.recipeId}
          ingredientsById={ingredientsById}
          state={state}
          today={today}
          unlocked={unlocked}
          readOnly={readOnly}
          actions={sheetActions}
          onClose={() => setOpen(null)}
        />
      ) : null}

      {notice ? (
        <div
          role="status"
          className="fixed inset-x-4 z-[120] mx-auto max-w-md rounded-2xl px-4 py-3 text-center text-sm font-bold shadow-lg"
          style={{
            bottom: "calc(5.5rem + env(safe-area-inset-bottom))",
            backgroundColor: "var(--color-text)",
            color: "var(--color-surface)",
          }}
        >
          {notice}
        </div>
      ) : null}
    </>
  );
}
