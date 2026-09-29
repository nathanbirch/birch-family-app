"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { MAIN_STORES, PRICE_SORTS, STALE_PRICE_DAYS, type PriceSortId } from "@/config/meals";
import { searchable } from "@/lib/meals/browse";
import {
  cheapestPrice,
  formatDollars,
  packOf,
  formatMoney,
  lastChecked,
  unitCost,
} from "@/lib/meals/costing";
import { daysSince, describeAge } from "@/lib/meals/format";
import type { TypedPrice } from "@/lib/meals/prices";
import type { IngredientView } from "@/lib/meals/types";

import { FIELD_CLASS, FIELD_STYLE, MUTED_TEXT, PRIMARY_STYLE, QUIET_STYLE, WARNING_COLOR } from "./ui";

/**
 * Every ingredient, what one of its units costs, and when that was last
 * checked.
 *
 * Anybody can read it. Changing a price is a parent's job, so the "Update"
 * button only appears once the PIN has been entered — and the action behind it
 * checks the PIN again regardless.
 */
export function PricesView({
  ingredients,
  usage,
  today,
  unlocked,
  readOnly,
  onSavePrices,
}: {
  ingredients: readonly IngredientView[];
  /** Recipe names by ingredient id. */
  usage: ReadonlyMap<string, string[]>;
  today: Date;
  unlocked: boolean;
  readOnly: boolean;
  onSavePrices: (id: string, prices: TypedPrice[]) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PriceSortId>("name");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const words = searchable(query).split(" ").filter(Boolean);
    const matching = ingredients.filter((ingredient) => {
      const text = searchable(`${ingredient.name} ${ingredient.prices.map((p) => p.store).join(" ")}`);
      return words.every((word) => text.includes(word));
    });
    const byName = (a: IngredientView, b: IngredientView) => a.name.localeCompare(b.name);
    return [...matching].sort((a, b) => {
      switch (sort) {
        case "name":
          return byName(a, b);
        case "oldest":
          return (lastChecked(a) ?? 0) - (lastChecked(b) ?? 0) || byName(a, b);
        case "used":
          return (usage.get(b.id)?.length ?? 0) - (usage.get(a.id)?.length ?? 0) || byName(a, b);
        case "priciest":
          return (unitCost(b) ?? -1) - (unitCost(a) ?? -1) || byName(a, b);
      }
    });
  }, [ingredients, query, sort, usage]);

  const estimated = ingredients.filter((i) => i.prices.some((p) => p.estimated)).length;
  const stale = ingredients.filter((i) => {
    const checked = lastChecked(i);
    return checked !== null && daysSince(checked, today) > STALE_PRICE_DAYS;
  }).length;

  return (
    <section aria-labelledby="prices-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="prices-heading" className="text-lg font-extrabold">
          Prices
        </h2>
        {unlocked && !readOnly ? (
          <Link
            href="/meals/admin/ingredients/new"
            className="rounded-full px-3 py-1 text-xs font-extrabold"
            style={PRIMARY_STYLE}
          >
            + Ingredient
          </Link>
        ) : null}
      </div>
      <p className="mt-1 text-sm" style={MUTED_TEXT}>
        Every ingredient, what a unit costs, and when it was last checked.
        {estimated > 0 ? ` ${estimated} still have starter estimates.` : ""}
        {stale > 0 ? ` ${stale} haven't been checked in ${STALE_PRICE_DAYS} days.` : ""}
      </p>

      <div className="mt-3 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search ingredients</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ingredients"
            className={`${FIELD_CLASS} rounded-full`}
            style={FIELD_STYLE}
          />
        </label>
        <label>
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as PriceSortId)}
            className="rounded-full border px-3 py-2 text-sm font-semibold"
            style={FIELD_STYLE}
          >
            {PRICE_SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!unlocked ? (
        <p className="mt-2 text-xs" style={MUTED_TEXT}>
          Parents can change prices after entering the PIN under{" "}
          <Link href="/meals/admin" className="font-bold underline">
            Manage
          </Link>
          .
        </p>
      ) : null}

      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((ingredient) => {
          const perUnit = unitCost(ingredient);
          const checked = lastChecked(ingredient);
          const age = checked === null ? null : daysSince(checked, today);
          const usedBy = usage.get(ingredient.id) ?? [];
          const open = openId === ingredient.id;
          const best = cheapestPrice(ingredient);

          return (
            <li key={ingredient.id} className="app-card themed-transition p-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : ingredient.id)}
                aria-expanded={open}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block font-bold leading-snug">
                    {ingredient.name}{" "}
                    <span className="text-xs font-semibold" style={MUTED_TEXT}>
                      (1 {ingredient.unit})
                    </span>
                  </span>
                  <span className="block text-xs" style={MUTED_TEXT}>
                    {ingredient.packLabel || "pack"} · {usedBy.length === 0 ? "not in any recipe yet" : `in ${usedBy.length} recipe${usedBy.length === 1 ? "" : "s"}`}
                    {ingredient.nutrition ? ` · ${Math.round(ingredient.nutrition.calories)} kcal/${ingredient.unit}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className="block text-lg font-extrabold leading-none tabular-nums"
                    style={perUnit === null ? { color: WARNING_COLOR } : undefined}
                  >
                    {perUnit === null ? "no price" : formatMoney(perUnit)}
                  </span>
                  <span className="text-[0.7rem]" style={MUTED_TEXT}>
                    per {ingredient.unit}
                  </span>
                </span>
              </button>

              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {ingredient.prices.map((price) => (
                  <li key={price.store} className={price === best ? "font-bold" : undefined}>
                    {price.store} {formatDollars(price.price)}
                    {price.packUnits ? (
                      <span className="font-normal" style={MUTED_TEXT}>
                        {" "}/ {packOf(ingredient, price).label}
                      </span>
                    ) : null}
                    {price.estimated ? (
                      <span className="ml-1 rounded px-1 text-[0.6rem] font-bold uppercase" style={QUIET_STYLE}>
                        est.
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p
                className="mt-1 text-[0.7rem]"
                style={age !== null && age > STALE_PRICE_DAYS ? { color: WARNING_COLOR } : MUTED_TEXT}
              >
                {age !== null
                  ? `Checked ${describeAge(age)}`
                  : ingredient.prices.length > 0
                    ? "Starter estimate — not checked at a store yet"
                    : "No price yet"}
              </p>

              {open && usedBy.length > 0 ? (
                <p className="mt-2 text-xs" style={MUTED_TEXT}>
                  Used in {usedBy.join(", ")}.
                </p>
              ) : null}

              {unlocked && !readOnly ? (
                editingId === ingredient.id ? (
                  <QuickPriceForm
                    ingredient={ingredient}
                    onCancel={() => setEditingId(null)}
                    onSave={async (prices) => {
                      const ok = await onSavePrices(ingredient.id, prices);
                      if (ok) setEditingId(null);
                    }}
                  />
                ) : (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(ingredient.id)}
                      className="rounded-full px-3 py-1 text-xs font-bold"
                      style={QUIET_STYLE}
                    >
                      Update price
                    </button>
                    <Link
                      href={`/meals/admin/ingredients/${ingredient.id}`}
                      className="rounded-full px-3 py-1 text-xs font-bold"
                      style={QUIET_STYLE}
                    >
                      Edit
                    </Link>
                  </div>
                )
              ) : null}
            </li>
          );
        })}
      </ul>

      {rows.length === 0 ? (
        <p className="mt-8 text-center text-sm" style={MUTED_TEXT}>
          No ingredient matches that.
        </p>
      ) : null}
    </section>
  );
}

/**
 * The shelf-side edit: one box per store, pre-filled, and a Save that dates
 * every one of them today — "I'm standing here and this is what it costs".
 * Clearing a box drops that store's price.
 */
function QuickPriceForm({
  ingredient,
  onSave,
  onCancel,
}: {
  ingredient: IngredientView;
  onSave: (prices: TypedPrice[]) => Promise<void>;
  onCancel: () => void;
}) {
  const stores = [
    ...MAIN_STORES,
    ...ingredient.prices.map((p) => p.store).filter((store) => !(MAIN_STORES as readonly string[]).includes(store)),
  ];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      stores.map((store) => [
        store,
        ingredient.prices.find((p) => p.store === store)?.price.toFixed(2) ?? "",
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packFor = (store: string) => {
    const existing = ingredient.prices.find((p) => p.store === store);
    return (existing ? packOf(ingredient, existing).label : ingredient.packLabel) || "pack";
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const prices: TypedPrice[] = [];
    for (const store of stores) {
      const raw = values[store]?.trim().replace(/^\$/, "") ?? "";
      if (raw === "") continue;
      const price = Number(raw);
      if (!Number.isFinite(price) || price <= 0) {
        setError(`${store}: enter a price like 2.49.`);
        return;
      }
      // A store's own pack size is kept as it was; changing *that* is the
      // full editor's job, not the shelf-side one.
      const existing = ingredient.prices.find((p) => p.store === store);
      prices.push({
        store,
        price: Math.round(price * 100) / 100,
        ...(existing?.packUnits ? { packLabel: existing.packLabel, packUnits: existing.packUnits } : {}),
      });
    }
    setBusy(true);
    setError(null);
    await onSave(prices);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-2 rounded-2xl p-3" style={QUIET_STYLE}>
      <p className="mb-2 text-xs" style={MUTED_TEXT}>
        The price of one pack at each store. Saving marks them all checked today. A
        store that sells a different size is set in Edit.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {stores.map((store) => (
          <label key={store} className="flex flex-col gap-1 text-xs font-bold">
            <span>
              {store}
              <span className="font-normal" style={MUTED_TEXT}>
                {" "}· {packFor(store)}
              </span>
            </span>
            <input
              inputMode="decimal"
              value={values[store] ?? ""}
              onChange={(event) => setValues({ ...values, [store]: event.target.value })}
              placeholder="—"
              className={FIELD_CLASS}
              style={FIELD_STYLE}
            />
          </label>
        ))}
      </div>
      {error ? (
        <p className="mt-2 text-xs font-semibold" style={{ color: WARNING_COLOR }}>
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full px-3.5 py-1.5 text-xs font-extrabold disabled:opacity-50"
          style={PRIMARY_STYLE}
        >
          {busy ? "Saving…" : "Save prices"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3.5 py-1.5 text-xs font-bold"
          style={{ backgroundColor: "var(--color-surface)" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
