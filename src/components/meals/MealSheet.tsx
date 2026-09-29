"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { FAMILY, type PersonId } from "@/config/family";
import {
  FAMILY_SIZE,
  MAIN_STORES,
  MEAL_TIMES,
  PLAN_DAYS,
  PLAN_SERVINGS_MAX,
  RATING_FACES,
  SALES_TAX_RATE,
  type RatingScore,
} from "@/config/meals";
import { summariseRatings, type MealGroup } from "@/lib/meals/browse";
import {
  cheapestPrice,
  costRecipe,
  formatDollars,
  formatMinutes,
  formatMoney,
  packOf,
  perUnitAt,
} from "@/lib/meals/costing";
import { toIsoDate } from "@/lib/dates";
import { describeLastMade } from "@/lib/meals/format";
import { describeAmount, formatQuantity } from "@/lib/meals/quantity";
import {
  NUTRIENTS,
  type FamilyMealState,
  type IngredientView,
  type RecipeView,
} from "@/lib/meals/types";

import { PersonFace } from "./PersonFace";
import { CloseButton, Sheet } from "./Sheet";
import {
  FIELD_STYLE,
  HeartIcon,
  MUTED_TEXT,
  PRIMARY_STYLE,
  QUIET_STYLE,
  StatTile,
  Stepper,
  TagChip,
  WARNING_COLOR,
} from "./ui";

export type MealSheetActions = {
  onFavorite: (recipeId: string, favorite: boolean) => void;
  onRate: (recipeId: string, personId: PersonId, score: RatingScore | 0) => void;
  onCooked: (recipeId: string, made: boolean) => void;
  onAddToPlan: (recipeId: string, servings: number, day: number | null) => void;
  onNotice: (message: string) => void;
};

/**
 * Everything about one meal.
 *
 * Opens scaled "for 7" rather than as written, because the family is the
 * number anybody standing in the kitchen is cooking for; "as written" is one
 * tap away for somebody following the original card.
 */
export function MealSheet({
  group,
  initialRecipeId,
  ingredientsById,
  state,
  today,
  unlocked,
  readOnly,
  actions,
  onClose,
}: {
  group: MealGroup;
  initialRecipeId: string;
  ingredientsById: ReadonlyMap<string, IngredientView>;
  state: FamilyMealState;
  today: Date;
  unlocked: boolean;
  /** The database is away: nothing can be saved, so nothing offers to. */
  readOnly: boolean;
  actions: MealSheetActions;
  onClose: () => void;
}) {
  const [recipeId, setRecipeId] = useState(initialRecipeId);
  const recipe = group.versions.find((version) => version.id === recipeId) ?? group.primary;

  return (
    <Sheet label={recipe.name} onClose={onClose}>
      <div
        className="flex items-start justify-between gap-3 border-b px-5 pb-3 pt-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-tight tracking-tight">{recipe.name}</h2>
          <p className="mt-0.5 text-xs" style={MUTED_TEXT}>
            {describeHeader(recipe)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!readOnly ? (
            /*
             * On every meal, for everybody: the editor asks for the parent PIN
             * itself when it is not already unlocked, then opens straight onto
             * this recipe. A parent should never have to hunt for "where do I
             * change this" — it is on the thing they want to change.
             */
            <Link
              href={`/meals/admin/recipes/${recipe.id}`}
              className="flex h-10 items-center rounded-full px-3.5 text-sm font-extrabold"
              style={QUIET_STYLE}
            >
              ✎ Edit
            </Link>
          ) : null}
          <CloseButton onClick={onClose} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">
        {group.versions.length > 1 ? (
          <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Versions">
            {group.versions.map((version) => (
              <button
                key={version.id}
                type="button"
                role="tab"
                aria-selected={version.id === recipe.id}
                onClick={() => setRecipeId(version.id)}
                className="rounded-full px-3 py-1 text-xs font-bold"
                style={version.id === recipe.id ? PRIMARY_STYLE : QUIET_STYLE}
              >
                {version.name}
              </button>
            ))}
          </div>
        ) : null}

        {/* Keyed on the recipe so switching versions starts each one fresh. */}
        <RecipeDetail
          key={recipe.id}
          recipe={recipe}
          ingredientsById={ingredientsById}
          state={state}
          today={today}
          unlocked={unlocked}
          readOnly={readOnly}
          actions={actions}
        />
      </div>
    </Sheet>
  );
}

function describeHeader(recipe: RecipeView): string {
  const when = recipe.mealTimes
    .map((id) => MEAL_TIMES.find((time) => time.id === id)?.label)
    .filter(Boolean)
    .join(", ");
  const parts = [recipe.type, when, `recipe feeds ${formatQuantity(recipe.feeds)}`];
  if (recipe.totalMinutes > 0) {
    parts.push(
      recipe.activeMinutes > 0 && recipe.activeMinutes < recipe.totalMinutes
        ? `${formatMinutes(recipe.totalMinutes)} (${formatMinutes(recipe.activeMinutes)} hands-on)`
        : formatMinutes(recipe.totalMinutes),
    );
  }
  return parts.filter(Boolean).join(" · ");
}

function RecipeDetail({
  recipe,
  ingredientsById,
  state,
  today,
  unlocked,
  readOnly,
  actions,
}: {
  recipe: RecipeView;
  ingredientsById: ReadonlyMap<string, IngredientView>;
  state: FamilyMealState;
  today: Date;
  unlocked: boolean;
  readOnly: boolean;
  actions: MealSheetActions;
}) {
  const [servings, setServings] = useState(FAMILY_SIZE);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planDay, setPlanDay] = useState<number | null>(null);
  const [planServings, setPlanServings] = useState(FAMILY_SIZE);

  const costed = useMemo(
    () => costRecipe(recipe, ingredientsById, servings),
    [recipe, ingredientsById, servings],
  );

  const favorite = state.favorites.includes(recipe.id);
  const ratings = state.ratings[recipe.id] ?? {};
  const ratingSummary = summariseRatings(ratings);
  const cookedDays = state.cooked[recipe.id] ?? [];
  const todayIso = toIsoDate(today);
  const madeToday = cookedDays.includes(todayIso);
  const planned = state.plan.entries.filter((entry) => entry.recipeId === recipe.id).length;
  const asWritten = servings === recipe.feeds;

  async function copyRecipe() {
    try {
      await navigator.clipboard.writeText(recipeText(recipe, costed.lines, servings));
      actions.onNotice("Recipe copied.");
    } catch {
      actions.onNotice("Could not copy the recipe.");
    }
  }

  return (
    <>
      {recipe.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- see MealCard
        <img
          src={recipe.photoUrl}
          alt={recipe.name}
          className="mb-4 aspect-[4/3] w-full rounded-2xl object-cover"
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Per person"
          value={
            <>
              {formatMoney(costed.perPerson)}
              {!costed.priced ? "*" : ""}
            </>
          }
        />
        <StatTile
          label={`For ${FAMILY_SIZE}`}
          value={
            <>
              {formatMoney(costed.family)}
              {!costed.priced ? "*" : ""}
            </>
          }
        />
      </div>
      {!costed.priced && costed.unpriced.length > 0 ? (
        <p className="mt-2 text-xs font-semibold" style={{ color: WARNING_COLOR }}>
          * No price yet for {costed.unpriced.join(", ")}, so this is too low.
        </p>
      ) : null}

      {recipe.tags.length + costed.autoTags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {recipe.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
          {costed.autoTags
            .filter((tag) => !recipe.tags.includes(tag))
            .map((tag) => (
              <TagChip key={tag} tag={tag} auto />
            ))}
        </div>
      ) : null}

      {costed.nutrition ? (
        <div className="mt-4">
          <div className="grid grid-cols-5 gap-1 rounded-2xl p-2" style={QUIET_STYLE}>
            {NUTRIENTS.map((nutrient) => (
              <div key={nutrient.key} className="text-center">
                <div className="text-sm font-extrabold tabular-nums">
                  {Math.round(costed.nutrition?.[nutrient.key] ?? 0)}
                  <span className="text-[0.65rem] font-bold" style={MUTED_TEXT}>
                    {nutrient.unit === "g" ? "g" : ""}
                  </span>
                </div>
                <div className="text-[0.65rem] font-semibold" style={MUTED_TEXT}>
                  {nutrient.key === "calories" ? "kcal" : nutrient.label}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[0.7rem]" style={MUTED_TEXT}>
            Per person, from package labels — estimates.
            {costed.missingNutrition.length > 0
              ? ` Missing for ${costed.missingNutrition.join(", ")}, so these are low.`
              : ""}
          </p>
        </div>
      ) : null}

      {/* --- Actions ------------------------------------------------------ */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setPlanning((open) => !open)}
          aria-expanded={planning}
          className="rounded-full px-4 py-2 text-sm font-extrabold disabled:opacity-50"
          style={PRIMARY_STYLE}
        >
          + Add to plan{planned > 0 ? ` (${planned} on it)` : ""}
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => actions.onFavorite(recipe.id, !favorite)}
          aria-pressed={favorite}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold disabled:opacity-50"
          style={favorite ? { backgroundColor: "#e11d48", color: "#fff" } : QUIET_STYLE}
        >
          <HeartIcon filled={favorite} className="h-4 w-4" />
          {favorite ? "Favorited" : "Favorite"}
        </button>
        <button
          type="button"
          onClick={copyRecipe}
          className="rounded-full px-3.5 py-2 text-sm font-bold"
          style={QUIET_STYLE}
        >
          Copy recipe
        </button>
      </div>

      {planning ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl p-3" style={QUIET_STYLE}>
          <label className="flex items-center gap-2 text-sm font-semibold">
            Day
            <select
              value={planDay ?? ""}
              onChange={(event) =>
                setPlanDay(event.target.value === "" ? null : Number(event.target.value))
              }
              className="rounded-full border px-3 py-1 text-sm"
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
          <span className="flex items-center gap-2 text-sm font-semibold">
            Servings
            <Stepper
              value={planServings}
              max={PLAN_SERVINGS_MAX}
              onChange={setPlanServings}
              label="servings to plan"
            />
          </span>
          <button
            type="button"
            onClick={() => {
              actions.onAddToPlan(recipe.id, planServings, planDay);
              setPlanning(false);
            }}
            className="ml-auto rounded-full px-4 py-1.5 text-sm font-extrabold"
            style={PRIMARY_STYLE}
          >
            Add
          </button>
        </div>
      ) : null}

      {/* --- Who likes it ------------------------------------------------ */}
      <section className="mt-6" aria-labelledby="ratings-heading">
        <div className="flex items-baseline justify-between">
          <h3 id="ratings-heading" className="text-sm font-extrabold">
            Who likes it?
          </h3>
          <span className="text-xs" style={MUTED_TEXT}>
            {ratingSummary.love + ratingSummary.ok + ratingSummary.no === 0
              ? "Tap a face to say"
              : `😋 ${ratingSummary.love} · 🙂 ${ratingSummary.ok} · 😖 ${ratingSummary.no}`}
          </span>
        </div>
        <ul className="mt-2 grid grid-cols-7 gap-1">
          {FAMILY.map((person) => {
            const score = ratings[person.id];
            const face = RATING_FACES.find((f) => f.score === score);
            const next = nextScore(score);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => actions.onRate(recipe.id, person.id, next)}
                  className="flex w-full flex-col items-center gap-1 rounded-xl py-1 disabled:opacity-60"
                  aria-label={`${person.name}: ${face?.label ?? "hasn't said"}. Tap for ${
                    next === 0 ? "no answer" : RATING_FACES.find((f) => f.score === next)?.label
                  }.`}
                >
                  <span className="relative">
                    <PersonFace member={person} />
                    <span
                      className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs"
                      style={{
                        backgroundColor: "var(--color-surface)",
                        boxShadow: "0 1px 3px var(--color-shadow)",
                      }}
                      aria-hidden="true"
                    >
                      {face?.emoji ?? "·"}
                    </span>
                  </span>
                  <span className="max-w-full truncate text-[0.65rem] font-semibold" style={MUTED_TEXT}>
                    {person.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* --- Made it ----------------------------------------------------- */}
      <section
        className="mt-5 flex items-center justify-between gap-3 rounded-2xl p-3"
        style={QUIET_STYLE}
      >
        <div className="min-w-0 text-sm">
          <p className="font-bold">
            {madeToday
              ? cookedDays[1]
                ? describeLastMade(cookedDays[1], today).replace("Last made", "Before today:")
                : "First time it's been logged"
              : describeLastMade(cookedDays[0] ?? null, today)}
          </p>
          {cookedDays.length > 1 ? (
            <p className="text-xs" style={MUTED_TEXT}>
              Logged {cookedDays.length}
              {cookedDays.length >= 20 ? "+" : ""} times
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => actions.onCooked(recipe.id, !madeToday)}
          aria-pressed={madeToday}
          className="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-extrabold disabled:opacity-50"
          style={madeToday ? PRIMARY_STYLE : { ...FIELD_STYLE, border: "1px solid var(--color-border)" }}
        >
          {madeToday ? "✓ Made today" : "We made this today"}
        </button>
      </section>

      {/* --- Ingredients ------------------------------------------------- */}
      <section className="mt-6" aria-labelledby="ingredients-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="ingredients-heading" className="text-sm font-extrabold">
            Ingredients
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full p-0.5" style={QUIET_STYLE} role="group" aria-label="Scale">
              <button
                type="button"
                onClick={() => setServings(recipe.feeds)}
                aria-pressed={asWritten}
                className="rounded-full px-2.5 py-1 text-xs font-bold"
                style={asWritten ? PRIMARY_STYLE : undefined}
              >
                As written
              </button>
              <button
                type="button"
                onClick={() => setServings(FAMILY_SIZE)}
                aria-pressed={servings === FAMILY_SIZE && !asWritten}
                className="rounded-full px-2.5 py-1 text-xs font-bold"
                style={servings === FAMILY_SIZE && !asWritten ? PRIMARY_STYLE : undefined}
              >
                For {FAMILY_SIZE}
              </button>
            </div>
            <Stepper
              value={Math.round(servings)}
              max={PLAN_SERVINGS_MAX}
              onChange={setServings}
              label="servings"
            />
          </div>
        </div>
        <p className="mt-1 text-xs" style={MUTED_TEXT}>
          {asWritten
            ? `As written — feeds ${formatQuantity(recipe.feeds)}.`
            : `Scaled for ${formatQuantity(servings)} (the recipe feeds ${formatQuantity(recipe.feeds)}).`}{" "}
          Tap an ingredient for its prices.
        </p>

        <ul className="mt-2 divide-y" style={{ borderColor: "var(--color-border)" }}>
          {costed.lines.map((line, index) => {
            const key = `${line.ingredientId}-${index}`;
            const open = openLine === key;
            return (
              <li key={key} style={{ borderColor: "var(--color-border)" }}>
                <button
                  type="button"
                  onClick={() => setOpenLine(open ? null : key)}
                  aria-expanded={open}
                  className="flex w-full items-baseline gap-3 py-2 text-left"
                  disabled={!line.ingredient}
                >
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{line.ingredient?.name ?? "A removed ingredient"}</span>
                    {line.note ? (
                      <span className="text-xs" style={MUTED_TEXT}>
                        {" "}
                        — {line.note}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums" style={MUTED_TEXT}>
                    {line.ingredient ? describeAmount(line.qty, line.ingredient.unit) : ""}
                  </span>
                  <span
                    className="w-14 shrink-0 text-right text-sm font-bold tabular-nums"
                    style={line.cost === null ? { color: WARNING_COLOR } : undefined}
                  >
                    {line.cost === null ? "no price" : formatMoney(line.cost)}
                  </span>
                </button>
                {open && line.ingredient ? <StorePrices ingredient={line.ingredient} /> : null}
              </li>
            );
          })}
        </ul>

        <div className="mt-2 flex items-baseline justify-between border-t pt-2 text-sm" style={{ borderColor: "var(--color-border)" }}>
          <span className="font-extrabold">
            Recipe total{" "}
            <span className="text-xs font-semibold" style={MUTED_TEXT}>
              (with {Math.round(SALES_TAX_RATE * 100)}% tax)
            </span>
          </span>
          <span className="font-extrabold tabular-nums">{formatDollars(costed.total)}</span>
        </div>
      </section>

      {/* --- Method ------------------------------------------------------ */}
      {recipe.instructions.trim() || recipe.url ? (
        <section className="mt-6" aria-labelledby="method-heading">
          <h3 id="method-heading" className="text-sm font-extrabold">
            Method
          </h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
            {recipe.instructions
              .split("\n")
              .map((step) => step.trim())
              .filter(Boolean)
              .map((step, index) => (
                <li key={index}>{step}</li>
              ))}
          </ol>
          {/^https?:\/\//i.test(recipe.url) ? (
            // Checked here as well as on save: a row edited by hand in Atlas
            // never went through the action's parser.
            <a
              href={recipe.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-sm font-bold underline"
              style={{ color: "var(--color-primary)" }}
            >
              Original recipe ↗
            </a>
          ) : null}
        </section>
      ) : null}

      {unlocked && !readOnly ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={`/meals/admin/recipes/new?copy=${recipe.id}`}
            className="rounded-full px-3.5 py-1.5 text-sm font-bold"
            style={QUIET_STYLE}
          >
            Make a copy
          </Link>
          <Link
            href={`/meals/admin/recipes/new?copy=${recipe.id}&version=1`}
            className="rounded-full px-3.5 py-1.5 text-sm font-bold"
            style={QUIET_STYLE}
          >
            Add a version
          </Link>
        </div>
      ) : null}

      <p className="mt-6 text-[0.7rem] leading-relaxed" style={MUTED_TEXT}>
        Per-person cost divides the recipe total by how many it feeds. The family cost is for{" "}
        {FAMILY_SIZE}. Each ingredient is priced at whichever of {listOf(MAIN_STORES)} is cheapest per
        {" "}unit (or wherever else it has a price), for the amount used, plus{" "}
        {Math.round(SALES_TAX_RATE * 100)}% tax.
      </p>
    </>
  );
}

/**
 * The expanded row: every shop's price for its own pack, and what that comes
 * to per unit — the only fair comparison once one of them is Costco's bigger
 * bag. Cheapest per unit first, and marked.
 */
function StorePrices({ ingredient }: { ingredient: IngredientView }) {
  const best = cheapestPrice(ingredient);
  const rows = ingredient.prices
    .map((price) => ({ price, pack: packOf(ingredient, price), perUnit: perUnitAt(ingredient, price) }))
    .sort((a, b) => (a.perUnit ?? Infinity) - (b.perUnit ?? Infinity));
  return (
    <div className="mb-2 rounded-xl px-3 py-2 text-xs" style={QUIET_STYLE}>
      {rows.length === 0 ? (
        <p style={{ color: WARNING_COLOR }}>No price recorded yet.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(({ price, pack, perUnit }) => (
            <li key={price.store} className="flex justify-between gap-2">
              <span className={price === best ? "font-bold" : undefined}>
                {price.store}
                {price === best ? " ✓ best" : ""}
                {price.estimated ? " (estimate)" : ""}
              </span>
              <span className="text-right tabular-nums">
                {formatDollars(price.price)} / {pack.label || "pack"}
                <span className="block" style={MUTED_TEXT}>
                  {formatMoney(perUnit)} per {ingredient.unit}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Walmart, Broulim's and Costco". */
function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Nobody → love it → it's OK → no thanks → nobody. */
function nextScore(score: RatingScore | undefined): RatingScore | 0 {
  if (score === undefined) return 3;
  if (score === 3) return 2;
  if (score === 2) return 1;
  return 0;
}

/** The recipe as text, at the scale on screen — for pasting into a message. */
function recipeText(
  recipe: RecipeView,
  lines: ReturnType<typeof costRecipe>["lines"],
  servings: number,
): string {
  const ingredientLines = lines.map((line) => {
    const amount = line.ingredient ? describeAmount(line.qty, line.ingredient.unit) : "";
    const name = line.ingredient?.name ?? "A removed ingredient";
    return `- ${amount} ${name}${line.note ? `, ${line.note}` : ""}`.replace("-  ", "- ");
  });
  const steps = recipe.instructions
    .split("\n")
    .map((step) => step.trim())
    .filter(Boolean)
    .map((step, index) => `${index + 1}. ${step}`);
  return [
    `${recipe.name} (serves ${formatQuantity(servings)})`,
    "",
    ...ingredientLines,
    ...(steps.length > 0 ? ["", ...steps] : []),
    ...(recipe.url ? ["", recipe.url] : []),
  ].join("\n");
}
