"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MAIN_STORES } from "@/config/meals";
import { BOTTOM_NAV_SPACE } from "@/config/navigation";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import { deleteIngredient, saveIngredient } from "@/lib/meals/admin-actions";
import { formatMoney } from "@/lib/meals/costing";
import { daysSince, describeAge } from "@/lib/meals/format";
import { formatQuantity, parseQuantity, pluralUnit } from "@/lib/meals/quantity";
import type { TypedPrice } from "@/lib/meals/prices";
import { NUTRIENTS, type IngredientView, type Nutrition, type PriceView } from "@/lib/meals/types";

import { FIELD_CLASS, FIELD_STYLE, MUTED_TEXT, ON_PAGE_STYLE, PRIMARY_STYLE, QUIET_STYLE, WARNING_COLOR } from "../ui";
import { UnitSuggestions } from "./UnitSuggestions";

type PriceRow = {
  key: string;
  store: string;
  price: string;
  main: boolean;
  /** This store sells its own size — Costco's 5 lb bag rather than the usual 2 lb. */
  ownPack: boolean;
  packLabel: string;
  packUnits: string;
};

function rowFor(price: PriceView | undefined, store: string, main: boolean): PriceRow {
  return {
    key: newRowKey(),
    store,
    price: price?.price.toFixed(2) ?? "",
    main,
    ownPack: Boolean(price?.packUnits),
    packLabel: price?.packUnits ? (price.packLabel ?? "") : "",
    packUnits: price?.packUnits ? formatQuantity(price.packUnits) : "",
  };
}

let rowCounter = 0;
const newRowKey = () => `price-${(rowCounter += 1)}`;

/**
 * Add or edit one ingredient: what recipes measure it in, what pack it comes
 * in, what each shop charges for that pack, and what one unit of it holds.
 *
 * The one relationship that matters most is spelled out on the form: "how
 * many cups are in the 2 lb bag". Every cost in the app is a pack price
 * divided by that number, so getting it right here is what makes every meal
 * that uses this ingredient cost the right amount.
 */
export function IngredientEditor({
  initial,
  usedBy,
  existingNames,
  readOnly,
  initialDateIso,
}: {
  initial: IngredientView | null;
  usedBy: readonly string[];
  existingNames: readonly string[];
  readOnly: boolean;
  initialDateIso: string;
}) {
  const router = useRouter();
  const today = useCurrentDate(initialDateIso);

  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [packLabel, setPackLabel] = useState(initial?.packLabel ?? "");
  const [packUnitsText, setPackUnitsText] = useState(initial ? formatQuantity(initial.packUnits) : "");
  const [rows, setRows] = useState<PriceRow[]>(() => {
    const main = MAIN_STORES.map((store) =>
      rowFor(initial?.prices.find((p) => p.store === store), store, true),
    );
    const others = (initial?.prices ?? [])
      .filter((p) => !(MAIN_STORES as readonly string[]).includes(p.store))
      .map((p) => rowFor(p, p.store, false));
    return [...main, ...others];
  });
  const [confirmPrices, setConfirmPrices] = useState(false);
  const [hasNutrition, setHasNutrition] = useState(initial?.nutrition !== null && initial !== null);
  const [nutrition, setNutrition] = useState<Record<keyof Nutrition, string>>(() => ({
    calories: String(initial?.nutrition?.calories ?? ""),
    carbs: String(initial?.nutrition?.carbs ?? ""),
    sugar: String(initial?.nutrition?.sugar ?? ""),
    protein: String(initial?.nutrition?.protein ?? ""),
    fat: String(initial?.nutrition?.fat ?? ""),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshot = JSON.stringify({ name, unit, packLabel, packUnitsText, rows: rows.map((r) => [r.store, r.price, r.ownPack, r.packLabel, r.packUnits]), hasNutrition, nutrition, confirmPrices });
  const [initialSnapshot] = useState(snapshot);
  const dirty = snapshot !== initialSnapshot;
  const leaving = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const packUnits = parseQuantity(packUnitsText);
  const parsedPrices: TypedPrice[] = rows.flatMap((row) => {
    const value = Number(row.price.trim().replace(/^\$/, ""));
    if (!row.store.trim() || !row.price.trim() || !Number.isFinite(value) || value <= 0) return [];
    const ownUnits = row.ownPack ? parseQuantity(row.packUnits) : null;
    return [
      {
        store: row.store.trim(),
        price: Math.round(value * 100) / 100,
        ...(ownUnits ? { packLabel: row.packLabel.trim(), packUnits: ownUnits } : {}),
      },
    ];
  });
  // Per unit, so a bigger pack is compared fairly with a smaller one.
  const cheapest = parsedPrices.reduce<{ store: string; perUnit: number } | null>((best, price) => {
    const units = price.packUnits ?? packUnits;
    if (!units) return best;
    const perUnit = price.price / units;
    return !best || perUnit < best.perUnit ? { store: price.store, perUnit } : best;
  }, null);
  const duplicateName = existingNames.some(
    (existing) => existing.trim().toLowerCase() === name.trim().toLowerCase(),
  );

  function validate(): string | null {
    if (!name.trim()) return "Give it a name.";
    if (duplicateName) return "There is already an ingredient with that name.";
    if (!unit.trim()) return "Say what recipes measure it in — cup, lb, each…";
    if (packUnits === null) return `Say how many ${pluralUnit(unit || "unit", 2)} are in one pack.`;
    for (const row of rows) {
      if (row.price.trim() && !parsedPrices.some((p) => p.store === row.store.trim())) {
        return `${row.store || "A store"}: enter a price like 2.49.`;
      }
      if (row.price.trim() && !row.store.trim()) return "Name the store for every price.";
      if (row.price.trim() && row.ownPack && parseQuantity(row.packUnits) === null) {
        return `${row.store}: say how many ${pluralUnit(unit || "unit", 2)} are in its pack.`;
      }
    }
    const stores = parsedPrices.map((p) => p.store.toLowerCase());
    if (new Set(stores).size !== stores.length) return "Each store only once.";
    if (hasNutrition) {
      for (const nutrient of NUTRIENTS) {
        const value = Number(nutrition[nutrient.key]);
        if (nutrition[nutrient.key].trim() === "" || !Number.isFinite(value) || value < 0) {
          return `Enter ${nutrient.label.toLowerCase()} (0 is fine), or untick nutrition.`;
        }
      }
    }
    return null;
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    const result = await saveIngredient({
      id: initial?.id,
      confirmPrices,
      name: name.trim(),
      unit: unit.trim(),
      packLabel: packLabel.trim(),
      packUnits: packUnits as number,
      prices: parsedPrices,
      nutrition: hasNutrition
        ? (Object.fromEntries(
            NUTRIENTS.map((n) => [n.key, Number(nutrition[n.key])]),
          ) as Nutrition)
        : null,
    });
    if (!result.ok) {
      setBusy(false);
      return setError(result.message);
    }
    leaving.current = true;
    router.push("/meals/admin");
  }

  async function onDelete() {
    if (!initial || !window.confirm(`Delete "${initial.name}"?`)) return;
    setBusy(true);
    const result = await deleteIngredient({ id: initial.id });
    if (!result.ok) {
      setBusy(false);
      return setError(result.message);
    }
    leaving.current = true;
    router.push("/meals/admin");
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-5">
      <header>
        <Link
          href="/meals/admin"
          onClick={(event) => {
            if (dirty && !window.confirm("Leave without saving your changes?")) event.preventDefault();
          }}
          className="text-sm font-bold"
          style={{ color: "var(--color-primary)" }}
        >
          ← Manage Meals
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          {initial ? "Edit ingredient" : "New ingredient"}
        </h1>
        {initial ? (
          <p className="mt-1 text-sm" style={MUTED_TEXT}>
            {usedBy.length === 0
              ? "Not used by any recipe yet."
              : usedBy.length <= 6
                ? `Used in ${usedBy.join(", ")}.`
                : `Used in ${usedBy.length} recipes, including ${usedBy.slice(0, 5).join(", ")}.`}
          </p>
        ) : null}
      </header>

      {readOnly ? (
        <p className="rounded-2xl px-4 py-3 text-sm font-semibold" style={ON_PAGE_STYLE}>
          The meals database can&apos;t be reached, so this can&apos;t be saved right now.
        </p>
      ) : null}

      <section className="app-card flex flex-col gap-3 p-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={FIELD_CLASS} style={{ ...FIELD_STYLE, ...(duplicateName ? { borderColor: WARNING_COLOR } : {}) }} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Recipes measure it in">
            <input value={unit} onChange={(e) => setUnit(e.target.value)} list="meal-units" placeholder="cup, lb, each…" maxLength={20} className={FIELD_CLASS} style={FIELD_STYLE} />
          </Field>
          <Field label="It comes as">
            <input value={packLabel} onChange={(e) => setPackLabel(e.target.value)} placeholder="2 lb bag" maxLength={60} className={FIELD_CLASS} style={FIELD_STYLE} />
          </Field>
        </div>
        <Field label={`How many ${pluralUnit(unit.trim() || "unit", 2)} are in one ${packLabel.trim() || "pack"}?`}>
          <input value={packUnitsText} onChange={(e) => setPackUnitsText(e.target.value)} inputMode="decimal" placeholder="8" className={FIELD_CLASS} style={FIELD_STYLE} />
        </Field>
        <UnitSuggestions />
        <p className="text-xs" style={MUTED_TEXT}>
          Every recipe using this is costed as the pack price ÷ this number. A 2 lb bag of shredded
          cheese is about 8 cups; a gallon of milk is 16; a pound of butter is 32 tbsp.
        </p>
      </section>

      <section className="app-card flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-extrabold">Prices</h2>
          <span className="text-sm font-bold tabular-nums">
            {cheapest ? `${formatMoney(cheapest.perUnit)} per ${unit || "unit"}` : ""}
          </span>
        </div>
        <p className="text-xs" style={MUTED_TEXT}>
          For one {packLabel || "pack"}, unless a store sells a different size — then tap
          &ldquo;Different size&rdquo; under it. Leave a store blank if it doesn&apos;t sell it. The
          cheapest per {unit || "unit"} wins
          {cheapest ? ` — right now ${cheapest.store}` : ""}.
        </p>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const stored = initial?.prices.find((p) => p.store === row.store);
            const update = (patch: Partial<PriceRow>) =>
              setRows(rows.map((r) => (r.key === row.key ? { ...r, ...patch } : r)));
            return (
              <li key={row.key} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  {row.main ? (
                    <span className="w-28 shrink-0 text-sm font-bold">{row.store}</span>
                  ) : (
                    <input
                      value={row.store}
                      onChange={(e) => update({ store: e.target.value })}
                      placeholder="Store"
                      aria-label="Store name"
                      maxLength={40}
                      className={`${FIELD_CLASS} w-28 shrink-0`}
                      style={FIELD_STYLE}
                    />
                  )}
                  <input
                    value={row.price}
                    onChange={(e) => update({ price: e.target.value })}
                    inputMode="decimal"
                    placeholder="—"
                    aria-label={`${row.store || "Store"} price`}
                    className={`${FIELD_CLASS} w-24`}
                    style={FIELD_STYLE}
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.7rem]" style={MUTED_TEXT}>
                    {stored
                      ? stored.estimated
                        ? "starter estimate"
                        : `checked ${describeAge(daysSince(stored.checkedAt, today))}`
                      : ""}
                  </span>
                  {!row.main ? (
                    <button
                      type="button"
                      aria-label="Remove this store"
                      onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                      className="shrink-0 rounded-full px-2 text-sm font-bold"
                      style={{ color: WARNING_COLOR }}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
                {row.ownPack ? (
                  <div className="flex items-center gap-2 pl-2 text-xs">
                    <input
                      value={row.packLabel}
                      onChange={(e) => update({ packLabel: e.target.value })}
                      placeholder="5 lb bag"
                      aria-label={`${row.store || "Store"} pack`}
                      maxLength={60}
                      className={`${FIELD_CLASS} flex-1`}
                      style={FIELD_STYLE}
                    />
                    <input
                      value={row.packUnits}
                      onChange={(e) => update({ packUnits: e.target.value })}
                      inputMode="decimal"
                      placeholder={pluralUnit(unit || "unit", 2)}
                      aria-label={`${pluralUnit(unit || "unit", 2)} in the ${row.store || "store"} pack`}
                      className={`${FIELD_CLASS} w-24`}
                      style={FIELD_STYLE}
                    />
                    <button
                      type="button"
                      onClick={() => update({ ownPack: false, packLabel: "", packUnits: "" })}
                      className="shrink-0 font-bold"
                      style={MUTED_TEXT}
                    >
                      Usual size
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => update({ ownPack: true })}
                    className="self-start pl-2 text-xs font-bold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    Different size at {row.store || "this store"}?
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setRows([...rows, rowFor(undefined, "", false)])}
            className="rounded-full px-3.5 py-1.5 text-sm font-bold"
            style={QUIET_STYLE}
          >
            + Another store
          </button>
          {initial ? (
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={confirmPrices} onChange={(e) => setConfirmPrices(e.target.checked)} />
              I checked these today
            </label>
          ) : null}
        </div>
      </section>

      <section className="app-card flex flex-col gap-3 p-4">
        <label className="flex items-center gap-2 font-extrabold">
          <input type="checkbox" checked={hasNutrition} onChange={(e) => setHasNutrition(e.target.checked)} />
          Nutrition per {unit.trim() || "unit"}
        </label>
        {hasNutrition ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {NUTRIENTS.map((nutrient) => (
              <Field key={nutrient.key} label={`${nutrient.label} (${nutrient.unit})`}>
                <input
                  value={nutrition[nutrient.key]}
                  onChange={(e) => setNutrition({ ...nutrition, [nutrient.key]: e.target.value })}
                  inputMode="decimal"
                  className={FIELD_CLASS}
                  style={FIELD_STYLE}
                />
              </Field>
            ))}
          </div>
        ) : (
          <p className="text-xs" style={MUTED_TEXT}>
            Without it, meals using this show lower calories and say so.
          </p>
        )}
        <p className="text-xs" style={MUTED_TEXT}>
          From the package label: scale the label&apos;s serving to one {unit.trim() || "unit"}.
        </p>
      </section>

      {error ? (
        <p role="alert" className="rounded-2xl px-4 py-2 text-sm font-semibold" style={{ ...ON_PAGE_STYLE, color: WARNING_COLOR }}>
          {error}
        </p>
      ) : null}

      <div
        className="sticky z-10 flex gap-2 rounded-full p-1.5 shadow-lg"
        style={{ bottom: `calc(${BOTTOM_NAV_SPACE} + 0.5rem)`, backgroundColor: "var(--color-surface)" }}
      >
        <button type="submit" disabled={busy || readOnly} className="flex-1 rounded-full px-4 py-2.5 text-sm font-extrabold disabled:opacity-50" style={PRIMARY_STYLE}>
          {busy ? "Saving…" : initial ? "Save ingredient" : "Add ingredient"}
        </button>
        {initial ? (
          <button
            type="button"
            disabled={busy || readOnly || usedBy.length > 0}
            onClick={onDelete}
            title={usedBy.length > 0 ? "Take it out of every recipe first" : undefined}
            className="rounded-full px-4 py-2.5 text-sm font-bold disabled:opacity-40"
            style={{ ...QUIET_STYLE, color: WARNING_COLOR }}
          >
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-bold" style={MUTED_TEXT}>
        {label}
      </span>
      {children}
    </label>
  );
}
