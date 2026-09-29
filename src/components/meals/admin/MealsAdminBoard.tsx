"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FAMILY_SIZE, STALE_PRICE_DAYS } from "@/config/meals";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import { lockParentPin } from "@/lib/auth/parent-pin-actions";
import { deleteIngredient, deleteRecipe } from "@/lib/meals/admin-actions";
import { groupVersions, searchable } from "@/lib/meals/browse";
import { costAll, formatMoney, ingredientUsage, lastChecked, unitCost } from "@/lib/meals/costing";
import { daysSince } from "@/lib/meals/format";
import type { MealsCatalog } from "@/lib/meals/types";

import {
  FIELD_CLASS,
  FIELD_STYLE,
  MUTED_TEXT,
  ON_PAGE_STYLE,
  PRIMARY_STYLE,
  QUIET_STYLE,
  StatTile,
  WARNING_COLOR,
} from "../ui";

/**
 * `/meals/admin`: the catalog at a glance, and the way into every editor.
 *
 * Deliberately a list of links rather than inline editing. A recipe is a long
 * form — a dozen ingredient lines, the method, a photo — and on a phone it
 * deserves a whole screen with the keyboard up, not a card squeezed between
 * ninety others.
 */
export function MealsAdminBoard({
  catalog,
  initialDateIso,
}: {
  catalog: MealsCatalog;
  initialDateIso: string;
}) {
  const router = useRouter();
  const today = useCurrentDate(initialDateIso);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"recipes" | "ingredients">("recipes");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const readOnly = catalog.source !== "database";

  const costs = useMemo(() => costAll(catalog.recipes, catalog.ingredients), [catalog]);
  const groups = useMemo(() => groupVersions(catalog.recipes), [catalog.recipes]);
  const usage = useMemo(() => ingredientUsage(catalog.recipes), [catalog.recipes]);

  const words = searchable(query).split(" ").filter(Boolean);
  const matches = (text: string) => {
    const haystack = searchable(text);
    return words.every((word) => haystack.includes(word));
  };

  const unpricedRecipes = catalog.recipes.filter((recipe) => !costs.get(recipe.id)?.priced).length;
  const estimated = catalog.ingredients.filter((i) => i.prices.some((p) => p.estimated)).length;
  const stale = catalog.ingredients.filter((i) => {
    const checked = lastChecked(i);
    return checked !== null && daysSince(checked, today) > STALE_PRICE_DAYS;
  }).length;

  async function onLock() {
    await lockParentPin();
    router.push("/meals");
    router.refresh();
  }

  async function onDeleteRecipe(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? Its ratings, favourite and "made it" log go with it.`)) return;
    setBusyId(id);
    const result = await deleteRecipe({ id });
    setBusyId(null);
    setMessage(result.ok ? `Deleted "${name}".` : result.message);
    if (result.ok) router.refresh();
  }

  async function onDeleteIngredient(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setBusyId(id);
    const result = await deleteIngredient({ id });
    setBusyId(null);
    setMessage(result.ok ? `Deleted "${name}".` : result.message);
    if (result.ok) router.refresh();
  }

  return (
    <>
      <header className="animate-soft-fade mb-5 flex items-start justify-between gap-3">
        <div>
          <Link href="/meals" className="text-sm font-bold" style={{ color: "var(--color-primary)" }}>
            ← Meals
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Manage Meals</h1>
          <p className="mt-1 text-sm" style={MUTED_TEXT}>
            Recipes, ingredients and prices.
          </p>
        </div>
        <button
          type="button"
          onClick={onLock}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold"
          style={{ ...ON_PAGE_STYLE, color: "var(--color-text-muted)" }}
        >
          Lock
        </button>
      </header>

      {readOnly ? (
        <p role="status" className="mb-4 rounded-2xl px-4 py-3 text-sm font-semibold" style={ON_PAGE_STYLE}>
          The meals database can&apos;t be reached, so nothing can be changed right now.
        </p>
      ) : null}

      {message ? (
        <p role="status" className="mb-4 rounded-2xl px-4 py-2 text-sm font-semibold" style={ON_PAGE_STYLE}>
          {message}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Recipes" value={catalog.recipes.length} detail={`${groups.length} meals`} />
        <StatTile label="Ingredients" value={catalog.ingredients.length} />
        <StatTile label="Estimates" value={estimated} detail="prices to confirm" />
        <StatTile label="Stale" value={stale} detail={`${STALE_PRICE_DAYS}+ days old`} />
      </div>
      {unpricedRecipes > 0 ? (
        <p className="mt-2 text-xs font-semibold" style={{ color: WARNING_COLOR }}>
          {unpricedRecipes} recipe{unpricedRecipes === 1 ? " has" : "s have"} an ingredient with no price.
        </p>
      ) : null}

      {!readOnly ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/meals/admin/recipes/new"
            className="rounded-full px-4 py-2 text-sm font-extrabold"
            style={PRIMARY_STYLE}
          >
            + New recipe
          </Link>
          <Link
            href="/meals/admin/ingredients/new"
            className="rounded-full px-4 py-2 text-sm font-bold"
            style={ON_PAGE_STYLE}
          >
            + New ingredient
          </Link>
        </div>
      ) : null}

      <div className="mt-5 flex rounded-full p-1" style={ON_PAGE_STYLE} role="tablist">
        {(["recipes", "ingredients"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className="flex-1 rounded-full px-3 py-1.5 text-sm font-extrabold capitalize"
            style={section === id ? PRIMARY_STYLE : undefined}
          >
            {id}
          </button>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="sr-only">Search</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={section === "recipes" ? "Search recipes" : "Search ingredients"}
          className={`${FIELD_CLASS} rounded-full`}
          style={FIELD_STYLE}
        />
      </label>

      {section === "recipes" ? (
        <ul className="mt-3 flex flex-col gap-2">
          {groups
            .filter((group) => group.versions.some((version) => matches(version.name)))
            .sort((a, b) => a.primary.name.localeCompare(b.primary.name))
            .flatMap((group) => group.versions.map((recipe, index) => ({ recipe, isVersion: index > 0 })))
            .map(({ recipe, isVersion }) => {
              const cost = costs.get(recipe.id);
              return (
                <li
                  key={recipe.id}
                  className={`app-card flex items-center gap-3 p-3 ${isVersion ? "ml-5" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {isVersion ? "↳ " : ""}
                      {recipe.name}
                    </p>
                    <p className="text-xs" style={MUTED_TEXT}>
                      {formatMoney(cost?.perPerson ?? null)}/person · {formatMoney(cost?.family ?? null)} for{" "}
                      {FAMILY_SIZE} · feeds {recipe.feeds}
                      {cost && !cost.priced ? (
                        <span style={{ color: WARNING_COLOR }}> · {cost.unpriced.length} unpriced</span>
                      ) : null}
                      {recipe.photoUrl ? " · 📷" : ""}
                    </p>
                  </div>
                  {!readOnly ? (
                    <div className="flex shrink-0 gap-1">
                      <Link
                        href={`/meals/admin/recipes/${recipe.id}`}
                        className="rounded-full px-3 py-1 text-xs font-bold"
                        style={QUIET_STYLE}
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/meals/admin/recipes/new?copy=${recipe.id}`}
                        className="rounded-full px-3 py-1 text-xs font-bold"
                        style={QUIET_STYLE}
                      >
                        Copy
                      </Link>
                      <button
                        type="button"
                        aria-label={`Delete ${recipe.name}`}
                        disabled={busyId === recipe.id}
                        onClick={() => onDeleteRecipe(recipe.id, recipe.name)}
                        className="rounded-full px-2.5 py-1 text-xs font-bold disabled:opacity-40"
                        style={{ ...QUIET_STYLE, color: WARNING_COLOR }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
        </ul>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {catalog.ingredients
            .filter((ingredient) => matches(ingredient.name))
            .map((ingredient) => {
              const usedBy = usage.get(ingredient.id)?.length ?? 0;
              const perUnit = unitCost(ingredient);
              return (
                <li key={ingredient.id} className="app-card flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{ingredient.name}</p>
                    <p className="text-xs" style={MUTED_TEXT}>
                      {perUnit === null ? (
                        <span style={{ color: WARNING_COLOR }}>no price</span>
                      ) : (
                        `${formatMoney(perUnit)} per ${ingredient.unit}`
                      )}{" "}
                      · {ingredient.packLabel || "pack"} ·{" "}
                      {usedBy === 0 ? "not used yet" : `in ${usedBy} recipe${usedBy === 1 ? "" : "s"}`}
                      {ingredient.prices.some((p) => p.estimated) ? " · estimate" : ""}
                    </p>
                  </div>
                  {!readOnly ? (
                    <div className="flex shrink-0 gap-1">
                      <Link
                        href={`/meals/admin/ingredients/${ingredient.id}`}
                        className="rounded-full px-3 py-1 text-xs font-bold"
                        style={QUIET_STYLE}
                      >
                        Edit
                      </Link>
                      {usedBy === 0 ? (
                        <button
                          type="button"
                          aria-label={`Delete ${ingredient.name}`}
                          disabled={busyId === ingredient.id}
                          onClick={() => onDeleteIngredient(ingredient.id, ingredient.name)}
                          className="rounded-full px-2.5 py-1 text-xs font-bold disabled:opacity-40"
                          style={{ ...QUIET_STYLE, color: WARNING_COLOR }}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
        </ul>
      )}
    </>
  );
}
