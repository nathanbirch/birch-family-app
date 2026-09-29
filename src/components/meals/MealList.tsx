"use client";

import { useState } from "react";

import {
  CALORIE_FILTERS,
  MEAL_SORTS,
  MEAL_TIMES,
  MEAL_TYPES,
  PRICE_FILTERS,
  TIME_FILTERS,
  type MealSortId,
} from "@/config/meals";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  isGroupFavorite,
  summariseRatings,
  type MealFilters,
  type MealGroup,
  type MealSummary,
} from "@/lib/meals/browse";
import { formatMoney, type CostedRecipe } from "@/lib/meals/costing";
import type { FamilyMealState } from "@/lib/meals/types";

import { MealCard } from "./MealCard";
import { FIELD_CLASS, FIELD_STYLE, HeartIcon, MUTED_TEXT, ON_PAGE_STYLE, QUIET_STYLE, StatTile } from "./ui";

/**
 * The Meals tab: search, the meal-time strip, filters, sort, three numbers,
 * and the cards.
 *
 * Holds nothing of its own but whether the filter drawer is open — the
 * filters themselves live on the board, because the dice in the header picks
 * from whatever they currently let through.
 */
export function MealList({
  groups,
  costs,
  state,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  summary,
  tags,
  onOpen,
}: {
  groups: readonly MealGroup[];
  costs: ReadonlyMap<string, CostedRecipe>;
  state: FamilyMealState;
  filters: MealFilters;
  onFiltersChange: (next: MealFilters) => void;
  sort: MealSortId;
  onSortChange: (next: MealSortId) => void;
  summary: MealSummary;
  tags: readonly string[];
  onOpen: (recipeId: string) => void;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const set = <K extends keyof MealFilters>(key: K, value: MealFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value });
  const activeCount = activeFilterCount(filters);

  return (
    <section aria-label="Meals">
      <label className="relative block">
        <span className="sr-only">Search meals or ingredients</span>
        <input
          type="search"
          value={filters.query}
          onChange={(event) => set("query", event.target.value)}
          placeholder="Search meals or ingredients"
          className={`${FIELD_CLASS} rounded-full py-2.5 pl-10`}
          style={FIELD_STYLE}
          enterKeyHint="search"
        />
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          style={MUTED_TEXT}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      </label>

      <div className="nav-strip -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="When it is eaten">
        {[{ id: "all" as const, label: "All" }, ...MEAL_TIMES].map((time) => {
          const selected = filters.mealTime === time.id;
          return (
            <button
              key={time.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => set("mealTime", time.id)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold"
              style={
                selected
                  ? { backgroundColor: "var(--color-primary)", color: "var(--color-on-primary)", border: "1px solid transparent" }
                  : ON_PAGE_STYLE
              }
            >
              {time.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-bold"
          style={ON_PAGE_STYLE}
        >
          Filters
          {activeCount > 0 ? (
            <span
              className="rounded-full px-1.5 text-xs"
              style={{ backgroundColor: "var(--color-primary)", color: "var(--color-on-primary)" }}
            >
              {activeCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => set("favoritesOnly", !filters.favoritesOnly)}
          aria-pressed={filters.favoritesOnly}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold"
          style={
            filters.favoritesOnly
              ? { backgroundColor: "#e11d48", color: "#fff", border: "1px solid transparent" }
              : ON_PAGE_STYLE
          }
        >
          <HeartIcon filled={filters.favoritesOnly} className="h-4 w-4" />
          Favorites
        </button>
        <label className="ml-auto min-w-0 flex-1 text-right">
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as MealSortId)}
            className="w-full max-w-[11rem] rounded-full border px-3 py-1.5 text-sm font-semibold"
            style={FIELD_STYLE}
          >
            {MEAL_SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showFilters ? (
        <div className="app-card mt-3 grid grid-cols-2 gap-2 p-3">
          <FilterSelect
            label="Price per person"
            value={filters.price}
            options={PRICE_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
            onChange={(value) => set("price", value as MealFilters["price"])}
          />
          <FilterSelect
            label="Calories per person"
            value={filters.calories}
            options={CALORIE_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
            onChange={(value) => set("calories", value as MealFilters["calories"])}
          />
          <FilterSelect
            label="Time"
            value={filters.time}
            options={TIME_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
            onChange={(value) => set("time", value as MealFilters["time"])}
          />
          <FilterSelect
            label="Type"
            value={filters.type}
            options={[
              { value: "any", label: "Any type" },
              ...MEAL_TYPES.map((type) => ({ value: type, label: type })),
            ]}
            onChange={(value) => set("type", value)}
          />
          <FilterSelect
            label="Tag"
            value={filters.tag}
            options={[{ value: "any", label: "Any tag" }, ...tags.map((tag) => ({ value: tag, label: tag }))]}
            onChange={(value) => set("tag", value)}
          />
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => onFiltersChange({ ...DEFAULT_FILTERS, query: filters.query, mealTime: filters.mealTime })}
              disabled={activeCount === 0}
              className="w-full rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-40"
              style={QUIET_STYLE}
            >
              Clear filters
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatTile label="Meals" value={summary.count} />
        <StatTile label="Avg / person" value={formatMoney(summary.averagePerPerson)} />
        <StatTile
          label="Cheapest"
          value={summary.cheapest ? formatMoney(summary.cheapest.perPerson) : "—"}
          detail={summary.cheapest?.group.primary.name}
        />
      </div>

      {groups.length === 0 ? (
        <p className="mt-10 text-center text-sm" style={MUTED_TEXT}>
          No meals match. Try fewer filters, or a different search.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.primary.id}>
              <MealCard
                group={group}
                cost={costs.get(group.primary.id)}
                favorite={isGroupFavorite(state, group)}
                ratings={summariseRatings(state.ratings[group.primary.id])}
                onOpen={() => onOpen(group.primary.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {groups.some((group) => !costs.get(group.primary.id)?.priced) ? (
        <p className="mt-6 text-center text-xs leading-relaxed" style={MUTED_TEXT}>
          A meal shows its cost once every one of its ingredients has a real price — enter
          them on the Prices tab as you shop.
        </p>
      ) : null}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-bold" style={MUTED_TEXT}>
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD_CLASS}
        style={FIELD_STYLE}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
