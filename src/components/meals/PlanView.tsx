"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  FAMILY_SIZE,
  PLAN_DAYS,
  PLAN_SERVINGS_MAX,
  SALES_TAX_RATE,
} from "@/config/meals";
import { formatDollars, formatMoney } from "@/lib/meals/costing";
import {
  budgetPlan,
  buildShoppingList,
  describeNeed,
  describePacks,
  planText,
  shoppingListText,
  type ShoppingNeed,
} from "@/lib/meals/plan";
import type { FamilyMealState, IngredientView, RecipeView } from "@/lib/meals/types";

import {
  FIELD_STYLE,
  MUTED_TEXT,
  ON_PAGE_STYLE,
  PRIMARY_STYLE,
  QUIET_STYLE,
  StatTile,
  Stepper,
  WARNING_COLOR,
} from "./ui";

export type PlanActions = {
  onUpdate: (id: string, patch: { servings?: number; day?: number | null }) => void;
  onRemove: (id: string) => void;
  onMade: (id: string, recipeId: string) => void;
  onClear: () => void;
  onHave: (ingredientId: string, have: boolean) => void;
  onSendToList: () => Promise<void>;
  onOpen: (recipeId: string) => void;
  onRandom: () => void;
  onNotice: (message: string) => void;
};

/**
 * This week's plan and the shopping it adds up to.
 *
 * Everything here is worked out in the browser from the catalog the page
 * already has — see `lib/meals/plan.ts` — so changing a meal's servings moves
 * the budget and the shopping list on the same frame.
 */
export function PlanView({
  state,
  recipesById,
  ingredientsById,
  readOnly,
  actions,
}: {
  state: FamilyMealState;
  recipesById: ReadonlyMap<string, RecipeView>;
  ingredientsById: ReadonlyMap<string, IngredientView>;
  readOnly: boolean;
  actions: PlanActions;
}) {
  const budget = useMemo(
    () => budgetPlan(state.plan, recipesById, ingredientsById),
    [state.plan, recipesById, ingredientsById],
  );
  const list = useMemo(
    () => buildShoppingList(state.plan, recipesById, ingredientsById),
    [state.plan, recipesById, ingredientsById],
  );
  const [sending, setSending] = useState(false);

  const servingsTotal = budget.meals.reduce(
    (sum, meal) => sum + (meal.recipe ? meal.entry.servings : 0),
    0,
  );

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      actions.onNotice(done);
    } catch {
      actions.onNotice("Could not copy. Try again.");
    }
  }

  if (budget.meals.length === 0) {
    return (
      <section aria-label="This week's plan" className="app-card flex flex-col items-center gap-3 p-8 text-center">
        <h2 className="text-lg font-extrabold">This week&apos;s plan</h2>
        <p className="text-sm" style={MUTED_TEXT}>
          No meals planned yet. Open a meal and tap &ldquo;Add to plan&rdquo;.
        </p>
        <button
          type="button"
          onClick={actions.onRandom}
          className="rounded-full px-4 py-2 text-sm font-extrabold"
          style={PRIMARY_STYLE}
        >
          🎲 Suggest a meal
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* --- The meals --------------------------------------------------- */}
      <section aria-labelledby="plan-heading">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="plan-heading" className="text-lg font-extrabold">
            This week&apos;s plan
          </h2>
          <button
            type="button"
            onClick={() => copy(planText(budget), "Plan copied.")}
            className="text-sm font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            Copy plan
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile label="Budget" value={formatDollars(budget.total)} detail={`${budget.meals.length} meals`} />
          <StatTile
            label="Per serving"
            value={formatMoney(budget.perServing)}
            detail={`across ${servingsTotal}`}
          />
          <StatTile label="Avg meal" value={formatMoney(budget.averagePerMeal)} />
        </div>
        {budget.partlyPriced > 0 ? (
          <p className="mt-2 text-xs font-semibold" style={{ color: WARNING_COLOR }}>
            {budget.partlyPriced} planned meal{budget.partlyPriced === 1 ? " has" : "s have"} an
            ingredient with no price, so the budget is too low.
          </p>
        ) : null}

        <ul className="mt-3 flex flex-col gap-2">
          {budget.meals.map((meal) => (
            <li key={meal.entry.id} className="app-card themed-transition flex flex-col gap-2 p-3">
              {meal.recipe ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => actions.onOpen(meal.entry.recipeId)}
                      className="min-w-0 text-left"
                    >
                      <span className="block font-bold leading-snug">{meal.recipe.name}</span>
                      <span className="text-xs" style={MUTED_TEXT}>
                        {formatDollars(meal.costed?.total ?? null)} for {meal.entry.servings}
                        {meal.costed && !meal.costed.priced ? "*" : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Take ${meal.recipe.name} off the plan`}
                      disabled={readOnly}
                      onClick={() => actions.onRemove(meal.entry.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold disabled:opacity-40"
                      style={QUIET_STYLE}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-semibold" style={MUTED_TEXT}>
                      <span className="sr-only">Day</span>
                      <select
                        value={meal.entry.day ?? ""}
                        disabled={readOnly}
                        onChange={(event) =>
                          actions.onUpdate(meal.entry.id, {
                            day: event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                        className="rounded-full border px-2.5 py-1 text-xs font-bold"
                        style={FIELD_STYLE}
                      >
                        <option value="">Any day</option>
                        {PLAN_DAYS.map((day, index) => (
                          <option key={day} value={index}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Stepper
                      value={meal.entry.servings}
                      max={PLAN_SERVINGS_MAX}
                      disabled={readOnly}
                      onChange={(servings) => actions.onUpdate(meal.entry.id, { servings })}
                      label={`servings of ${meal.recipe.name}`}
                    />
                    <span className="text-xs" style={MUTED_TEXT}>
                      servings
                    </span>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => actions.onMade(meal.entry.id, meal.entry.recipeId)}
                      className="ml-auto rounded-full px-3 py-1 text-xs font-extrabold disabled:opacity-40"
                      style={QUIET_STYLE}
                      title="Log it as made today and take it off the plan"
                    >
                      ✓ We made it
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span style={MUTED_TEXT}>A meal that has since been deleted.</span>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => actions.onRemove(meal.entry.id)}
                    className="rounded-full px-3 py-1 text-xs font-bold"
                    style={QUIET_STYLE}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* --- The shopping list ------------------------------------------- */}
      <section aria-labelledby="list-heading">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="list-heading" className="text-lg font-extrabold">
            Shopping list
          </h2>
          <button
            type="button"
            onClick={() => copy(shoppingListText(list), "Shopping list copied.")}
            className="text-sm font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            Copy list
          </button>
        </div>
        <p className="mt-1 text-xs" style={MUTED_TEXT}>
          {list.mealCount} meal{list.mealCount === 1 ? "'s" : "s'"} ingredients, one line each, in
          whole packs, at whichever store is cheapest. Tick what you already have.
        </p>

        <div className="app-card mt-3 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold">
              {list.byStore.length > 1 ? "Splitting stores" : list.byStore.length === 1 ? `All at ${list.byStore[0].store}` : "Nothing left to buy"}
            </span>
            <span className="text-lg font-extrabold tabular-nums">{formatDollars(list.total)}</span>
          </div>
          <p className="text-xs" style={MUTED_TEXT}>
            With {Math.round(SALES_TAX_RATE * 100)}% tax. More than the budget when packs are
            bigger than the recipes need — the rest is next week&apos;s pantry.
          </p>
          {list.byStore.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs">
              {list.comparisons.map((comparison) => {
                const difference = comparison.total - list.total;
                return (
                  <li key={comparison.store} className="flex justify-between gap-2">
                    <span style={MUTED_TEXT}>
                      Everything at {comparison.store}
                      {comparison.missing > 0 ? ` (${comparison.missing} not sold there)` : ""}
                    </span>
                    <span className="tabular-nums font-semibold">
                      {formatDollars(comparison.total)}
                      {difference > 0.005 ? ` (+${formatDollars(difference)})` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {list.byStore.map((group) => (
          <StoreSection
            key={group.store}
            title={group.store}
            subtitle={`about ${formatDollars(group.subtotal)}`}
            needs={group.items}
            readOnly={readOnly}
            onToggle={(need) => actions.onHave(need.ingredient.id, true)}
            toggleLabel="Have it"
          />
        ))}

        {list.unpriced.length > 0 ? (
          <StoreSection
            title="No price yet"
            subtitle="Add a price to cost these"
            needs={list.unpriced}
            readOnly={readOnly}
            onToggle={(need) => actions.onHave(need.ingredient.id, true)}
            toggleLabel="Have it"
          />
        ) : null}

        {list.have.length > 0 ? (
          <StoreSection
            title="Already have"
            subtitle={`${list.have.length} left off the list`}
            needs={list.have}
            readOnly={readOnly}
            onToggle={(need) => actions.onHave(need.ingredient.id, false)}
            toggleLabel="Back on the list"
            muted
          />
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={readOnly || sending || list.byStore.length + list.unpriced.length === 0}
            onClick={async () => {
              setSending(true);
              await actions.onSendToList();
              setSending(false);
            }}
            className="rounded-full px-4 py-2 text-sm font-extrabold disabled:opacity-50"
            style={PRIMARY_STYLE}
          >
            {sending ? "Adding…" : "Add to the family shopping list"}
          </button>
          <Link
            href="/shopping"
            className="rounded-full px-4 py-2 text-sm font-bold"
            style={ON_PAGE_STYLE}
          >
            Open Shopping
          </Link>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => {
              if (window.confirm("Clear the whole plan and the shopping list for everybody?")) {
                actions.onClear();
              }
            }}
            className="ml-auto rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50"
            style={{ ...ON_PAGE_STYLE, color: WARNING_COLOR }}
          >
            Clear plan
          </button>
        </div>
        <p className="mt-2 text-xs" style={MUTED_TEXT}>
          Planned for {FAMILY_SIZE} by default. The plan is shared: everyone in the family sees the same one.
        </p>
      </section>
    </div>
  );
}

function StoreSection({
  title,
  subtitle,
  needs,
  readOnly,
  onToggle,
  toggleLabel,
  muted = false,
}: {
  title: string;
  subtitle: string;
  needs: readonly ShoppingNeed[];
  readOnly: boolean;
  onToggle: (need: ShoppingNeed) => void;
  toggleLabel: string;
  muted?: boolean;
}) {
  return (
    <div className={`mt-4 ${muted ? "opacity-70" : ""}`}>
      <h3 className="flex items-baseline justify-between px-1 text-sm font-extrabold">
        <span>{title}</span>
        <span className="text-xs font-semibold" style={MUTED_TEXT}>
          {subtitle}
        </span>
      </h3>
      <ul className="app-card mt-1.5 divide-y" style={{ borderColor: "var(--color-border)" }}>
        {needs.map((need) => (
          <li
            key={need.ingredient.id}
            className="flex items-center gap-3 px-3 py-2"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${muted ? "line-through" : ""}`}>
                {need.ingredient.name}
              </p>
              <p className="text-xs" style={MUTED_TEXT}>
                {describePacks(need)} · needs {describeNeed(need)} for {need.recipes.join(", ")}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums">
              {need.cost === null ? "—" : formatDollars(need.cost)}
            </span>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onToggle(need)}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold disabled:opacity-40"
              style={QUIET_STYLE}
            >
              {toggleLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
