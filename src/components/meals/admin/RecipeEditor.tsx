"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  FAMILY_SIZE,
  MAIN_STORES,
  MEAL_TIMES,
  MEAL_TYPES,
  SALES_TAX_RATE,
  SUGGESTED_TAGS,
  type MealTime,
  type MealType,
} from "@/config/meals";
import { BOTTOM_NAV_SPACE } from "@/config/navigation";
import {
  clearMealPhoto,
  deleteRecipe,
  saveIngredient,
  saveRecipe,
  setMealPhoto,
} from "@/lib/meals/admin-actions";
import { costRecipe, formatDollars, formatMoney, indexIngredients } from "@/lib/meals/costing";
import { shrinkPhoto } from "@/lib/meals/photo-client";
import {
  convertQuantity,
  formatQuantity,
  friendlyAmount,
  parseQuantity,
  pluralUnit,
  unitChoices,
} from "@/lib/meals/quantity";
import type { IngredientView, RecipeView } from "@/lib/meals/types";

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
import { UnitSuggestions } from "./UnitSuggestions";

type LineDraft = {
  key: string;
  ingredientId: string | null;
  /** What is typed in the ingredient box. */
  search: string;
  qtyText: string;
  /** The unit the amount is typed in — the ingredient's own, or a convertible one. */
  unit: string;
  note: string;
};

type PhotoChange = { kind: "keep" } | { kind: "new"; dataUrl: string } | { kind: "remove" };

let lineCounter = 0;
const newLineKey = () => `line-${(lineCounter += 1)}`;

function toDraft(
  line: RecipeView["lines"][number],
  ingredient: IngredientView | undefined,
): LineDraft {
  const friendly = ingredient
    ? friendlyAmount(line.qty, ingredient.unit)
    : { qty: line.qty, unit: "" };
  return {
    key: newLineKey(),
    ingredientId: line.ingredientId,
    search: ingredient?.name ?? "",
    qtyText: formatQuantity(friendly.qty),
    unit: friendly.unit,
    note: line.note,
  };
}

const blankLine = (): LineDraft => ({
  key: newLineKey(),
  ingredientId: null,
  search: "",
  qtyText: "",
  unit: "",
  note: "",
});

/**
 * Add or edit one recipe.
 *
 * Everything is typed the way a recipe card says it — "1½", "¼ cup",
 * "3 tbsp" — and converted to the ingredient's own unit only on save (see
 * `lib/meals/quantity.ts`). The cost preview underneath is the same
 * `costRecipe` the meal cards use, run on every keystroke, so what this says a
 * recipe costs is what the list will say once it is saved.
 */
export function RecipeEditor({
  recipeId,
  initial,
  ingredients: initialIngredients,
  parents,
  readOnly,
}: {
  /** `null` for a new recipe (including a copy). */
  recipeId: string | null;
  initial: RecipeView | null;
  ingredients: readonly IngredientView[];
  parents: readonly { id: string; name: string }[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [ingredients, setIngredients] = useState<IngredientView[]>(() => [...initialIngredients]);
  const byId = useMemo(() => indexIngredients(ingredients), [ingredients]);
  const byName = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.name.trim().toLowerCase(), ingredient])),
    [ingredients],
  );

  const [name, setName] = useState(initial?.name ?? "");
  const [parentId, setParentId] = useState(initial?.variantOf ?? "");
  const [mealTimes, setMealTimes] = useState<MealTime[]>(initial?.mealTimes ?? ["dinner"]);
  const [type, setType] = useState<MealType>(initial?.type ?? "Entree");
  const [feedsText, setFeedsText] = useState(initial ? formatQuantity(initial.feeds) : String(FAMILY_SIZE));
  const [activeText, setActiveText] = useState(initial?.activeMinutes ? String(initial.activeMinutes) : "");
  const [totalText, setTotalText] = useState(initial?.totalMinutes ? String(initial.totalMinutes) : "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagText, setTagText] = useState("");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    initial && initial.lines.length > 0
      ? initial.lines.map((line) => toDraft(line, initialIngredients.find((i) => i.id === line.ingredientId)))
      : [blankLine(), blankLine(), blankLine()],
  );
  const [photo, setPhoto] = useState<PhotoChange>({ kind: "keep" });
  const [scaleText, setScaleText] = useState("");
  const [quickAddFor, setQuickAddFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* --- Unsaved changes ------------------------------------------------- */

  const snapshot = JSON.stringify({
    name,
    parentId,
    mealTimes,
    type,
    feedsText,
    activeText,
    totalText,
    tags,
    url,
    instructions,
    lines: lines.map((line) => [line.ingredientId, line.search, line.qtyText, line.unit, line.note]),
    photo: photo.kind,
  });
  // What the form said when it opened, to tell "changed" from "touched".
  const [initialSnapshot] = useState(snapshot);
  const dirty = snapshot !== initialSnapshot;
  const saving = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (saving.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* --- The live preview ------------------------------------------------ */

  const feeds = parseQuantity(feedsText);
  const resolvedLines = lines.flatMap((line) => {
    const ingredient = line.ingredientId ? byId.get(line.ingredientId) : undefined;
    const qty = parseQuantity(line.qtyText);
    if (!ingredient || qty === null) return [];
    return [
      {
        ingredientId: ingredient.id,
        qty: convertQuantity(qty, line.unit || ingredient.unit, ingredient.unit),
        note: line.note.trim(),
      },
    ];
  });
  const preview = costRecipe(
    {
      id: recipeId ?? "draft",
      name,
      feeds: feeds ?? 0,
      activeMinutes: Number.parseInt(activeText, 10) || 0,
      totalMinutes: Number.parseInt(totalText, 10) || 0,
      mealTimes,
      type,
      tags,
      url,
      instructions,
      lines: resolvedLines,
      variantOf: null,
      photoUrl: null,
    },
    byId,
  );

  /* --- Editing lines --------------------------------------------------- */

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function chooseIngredient(key: string, text: string) {
    const match = byName.get(text.trim().toLowerCase()) ?? null;
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        if (!match) return { ...line, search: text, ingredientId: null };
        const unit = unitChoices(match.unit).includes(line.unit) ? line.unit : match.unit;
        return { ...line, search: match.name, ingredientId: match.id, unit };
      }),
    );
  }

  function moveLine(key: string, direction: -1 | 1) {
    setLines((current) => {
      const index = current.findIndex((line) => line.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function applyScale() {
    const factor = parseQuantity(scaleText);
    if (factor === null) {
      setError("Enter a factor such as 2 or 0.5.");
      return;
    }
    setError(null);
    setLines((current) =>
      current.map((line) => {
        const qty = parseQuantity(line.qtyText);
        return qty === null ? line : { ...line, qtyText: formatQuantity(qty * factor) };
      }),
    );
    if (feeds !== null) setFeedsText(formatQuantity(Math.round(feeds * factor * 100) / 100));
    setScaleText("");
  }

  function toggleTag(tag: string) {
    setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));
  }

  function addTypedTag() {
    const tag = tagText.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagText("");
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    try {
      setError(null);
      setPhoto({ kind: "new", dataUrl: await shrinkPhoto(file) });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That photo could not be used.");
    }
  }

  /* --- Saving ---------------------------------------------------------- */

  function validate(): string | null {
    if (!name.trim()) return "Give the recipe a name.";
    if (feeds === null) return "Enter how many this feeds.";
    if (mealTimes.length === 0) return "Pick when it is eaten.";
    for (const line of lines) {
      const blank = !line.search.trim() && !line.qtyText.trim();
      if (blank) continue;
      if (!line.ingredientId) {
        return `"${line.search || "An ingredient"}" isn't in the list yet — pick one, or tap "New" to add it.`;
      }
      if (parseQuantity(line.qtyText) === null) return `Enter an amount for ${line.search}.`;
    }
    return null;
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    const result = await saveRecipe({
      id: recipeId ?? undefined,
      name: name.trim(),
      feeds: feeds as number,
      activeMinutes: Number.parseInt(activeText, 10) || 0,
      totalMinutes: Number.parseInt(totalText, 10) || 0,
      mealTimes,
      type,
      tags,
      url: url.trim(),
      instructions: instructions.trim(),
      lines: resolvedLines,
      variantOf: parentId || null,
    });

    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }

    if (photo.kind === "new") {
      const uploaded = await setMealPhoto({ recipeId: result.id, dataUrl: photo.dataUrl });
      if (!uploaded.ok) {
        setBusy(false);
        setError(`The recipe saved, but the photo did not: ${uploaded.message}`);
        return;
      }
    } else if (photo.kind === "remove") {
      await clearMealPhoto({ recipeId: result.id });
    }

    saving.current = true;
    router.push(`/meals?meal=${result.id}`);
  }

  async function onDelete() {
    if (!recipeId) return;
    if (!window.confirm(`Delete "${name}"? Its ratings, favourite and "made it" log go with it.`)) return;
    setBusy(true);
    const result = await deleteRecipe({ id: recipeId });
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }
    saving.current = true;
    router.push("/meals/admin");
  }

  /*
   * Editing a meal comes from that meal's sheet, so leaving goes back to it —
   * not to a list of ninety recipes. A new one has no sheet yet.
   */
  const backHref = recipeId ? `/meals?meal=${recipeId}` : "/meals/admin";
  const confirmLeave = (event: React.MouseEvent) => {
    if (dirty && !window.confirm("Leave without saving your changes?")) event.preventDefault();
  };

  const existingPhoto = photo.kind === "keep" ? initial?.photoUrl ?? null : null;
  const shownPhoto = photo.kind === "new" ? photo.dataUrl : existingPhoto;
  const allTagChoices = [...new Set([...SUGGESTED_TAGS, ...tags])];

  return (
    <form onSubmit={onSave} className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={backHref}
            onClick={confirmLeave}
            className="text-sm font-bold"
            style={{ color: "var(--color-primary)" }}
          >
            {recipeId ? `← ${initial?.name ?? "Back"}` : "← Manage Meals"}
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            {recipeId ? "Edit recipe" : initial ? "New meal (copy)" : "New recipe"}
          </h1>
          {recipeId ? (
            <p className="mt-1 text-sm" style={MUTED_TEXT}>
              Change anything, then Save. Prices and the cost below update as you type.
            </p>
          ) : null}
        </div>
        {dirty ? (
          <span className="mt-2 shrink-0 text-xs font-bold" style={MUTED_TEXT}>
            Unsaved
          </span>
        ) : null}
      </header>

      {readOnly ? (
        <p className="rounded-2xl px-4 py-3 text-sm font-semibold" style={ON_PAGE_STYLE}>
          The meals database can&apos;t be reached, so this can&apos;t be saved right now.
        </p>
      ) : null}

      {/* --- The basics ------------------------------------------------ */}
      <section className="app-card flex flex-col gap-3 p-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} style={FIELD_STYLE} maxLength={100} required />
        </Field>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Feeds">
            <input value={feedsText} onChange={(e) => setFeedsText(e.target.value)} inputMode="decimal" className={FIELD_CLASS} style={FIELD_STYLE} />
          </Field>
          <Field label="Hands-on min">
            <input value={activeText} onChange={(e) => setActiveText(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={FIELD_CLASS} style={FIELD_STYLE} />
          </Field>
          <Field label="Total min">
            <input value={totalText} onChange={(e) => setTotalText(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={FIELD_CLASS} style={FIELD_STYLE} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <select value={type} onChange={(e) => setType(e.target.value as MealType)} className={FIELD_CLASS} style={FIELD_STYLE}>
              {MEAL_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="A version of">
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={FIELD_CLASS} style={FIELD_STYLE}>
              <option value="">— its own meal —</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset>
          <legend className="text-xs font-bold" style={MUTED_TEXT}>
            When it&apos;s eaten
          </legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {MEAL_TIMES.map((time) => {
              const on = mealTimes.includes(time.id);
              return (
                <button
                  key={time.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setMealTimes(on ? mealTimes.filter((t) => t !== time.id) : [...mealTimes, time.id])
                  }
                  className="rounded-full px-3 py-1 text-xs font-bold"
                  style={on ? PRIMARY_STYLE : QUIET_STYLE}
                >
                  {time.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-bold" style={MUTED_TEXT}>
            Tags <span className="font-normal">(cost, time and nutrition tags are added automatically)</span>
          </legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {allTagChoices.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(tag)}
                  className="rounded-full px-2.5 py-1 text-xs font-bold"
                  style={on ? PRIMARY_STYLE : QUIET_STYLE}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTypedTag();
                }
              }}
              placeholder="Another tag"
              maxLength={30}
              className={FIELD_CLASS}
              style={FIELD_STYLE}
            />
            <button type="button" onClick={addTypedTag} className="shrink-0 rounded-xl px-3 text-sm font-bold" style={QUIET_STYLE}>
              Add
            </button>
          </div>
        </fieldset>
      </section>

      {/* --- Ingredients ----------------------------------------------- */}
      <section className="app-card flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-extrabold">Ingredients</h2>
          <span className="text-xs" style={MUTED_TEXT}>
            Amounts like 1½, 3/4 or 0.5
          </span>
        </div>

        <datalist id="meal-ingredient-names">
          {ingredients.map((ingredient) => (
            <option key={ingredient.id} value={ingredient.name} />
          ))}
        </datalist>

        <ul className="flex flex-col gap-3">
          {lines.map((line, index) => {
            const ingredient = line.ingredientId ? byId.get(line.ingredientId) : undefined;
            const units = ingredient ? unitChoices(ingredient.unit) : [];
            const unknown = line.search.trim() !== "" && !ingredient;
            return (
              <li key={line.key} className="rounded-2xl p-2.5" style={QUIET_STYLE}>
                <div className="flex gap-2">
                  <input
                    list="meal-ingredient-names"
                    value={line.search}
                    onChange={(e) => chooseIngredient(line.key, e.target.value)}
                    placeholder="Ingredient"
                    aria-label={`Ingredient ${index + 1}`}
                    className={FIELD_CLASS}
                    style={{ ...FIELD_STYLE, ...(unknown ? { borderColor: WARNING_COLOR } : {}) }}
                  />
                  <button
                    type="button"
                    aria-label="Remove this line"
                    onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                    className="shrink-0 rounded-xl px-2.5 text-sm font-bold"
                    style={{ backgroundColor: "var(--color-surface)", color: WARNING_COLOR }}
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={line.qtyText}
                    onChange={(e) => updateLine(line.key, { qtyText: e.target.value })}
                    placeholder="Amount"
                    aria-label={`Amount of ingredient ${index + 1}`}
                    inputMode="decimal"
                    className={`${FIELD_CLASS} w-24`}
                    style={FIELD_STYLE}
                  />
                  {units.length > 1 ? (
                    <select
                      value={line.unit}
                      onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                      aria-label={`Unit for ingredient ${index + 1}`}
                      className={`${FIELD_CLASS} w-24`}
                      style={FIELD_STYLE}
                    >
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex w-24 shrink-0 items-center text-sm" style={MUTED_TEXT}>
                      {ingredient ? pluralUnit(ingredient.unit, parseQuantity(line.qtyText) ?? 1) : ""}
                    </span>
                  )}
                  <input
                    value={line.note}
                    onChange={(e) => updateLine(line.key, { note: e.target.value })}
                    placeholder="Note (diced…)"
                    aria-label={`Note for ingredient ${index + 1}`}
                    maxLength={80}
                    className={FIELD_CLASS}
                    style={FIELD_STYLE}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                  {unknown ? (
                    <>
                      <span style={{ color: WARNING_COLOR }}>Not an ingredient yet.</span>
                      <button
                        type="button"
                        onClick={() => setQuickAddFor(line.key)}
                        className="rounded-full px-2.5 py-0.5 font-bold"
                        style={PRIMARY_STYLE}
                      >
                        New ingredient…
                      </button>
                    </>
                  ) : ingredient ? (
                    <span style={MUTED_TEXT}>
                      {preview.lines.find((l) => l.ingredientId === ingredient.id)?.cost != null
                        ? `${formatMoney(preview.lines.find((l) => l.ingredientId === ingredient.id)?.cost ?? null)} · `
                        : ""}
                      {ingredient.packLabel}
                    </span>
                  ) : null}
                  <span className="ml-auto flex gap-1">
                    <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveLine(line.key, -1)} className="rounded-full px-2 font-bold disabled:opacity-30" style={{ backgroundColor: "var(--color-surface)" }}>
                      ↑
                    </button>
                    <button type="button" aria-label="Move down" disabled={index === lines.length - 1} onClick={() => moveLine(line.key, 1)} className="rounded-full px-2 font-bold disabled:opacity-30" style={{ backgroundColor: "var(--color-surface)" }}>
                      ↓
                    </button>
                  </span>
                </div>
                {quickAddFor === line.key ? (
                  <QuickIngredient
                    initialName={line.search}
                    onCancel={() => setQuickAddFor(null)}
                    onCreated={(created) => {
                      setIngredients((current) => [...current, created]);
                      updateLine(line.key, {
                        ingredientId: created.id,
                        search: created.name,
                        unit: created.unit,
                      });
                      setQuickAddFor(null);
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setLines([...lines, blankLine()])} className="rounded-full px-3.5 py-1.5 text-sm font-bold" style={QUIET_STYLE}>
            + Add a line
          </button>
          <span className="ml-auto flex items-center gap-1.5 text-sm">
            <input
              value={scaleText}
              onChange={(e) => setScaleText(e.target.value)}
              placeholder="×2, ½…"
              aria-label="Scale factor"
              inputMode="decimal"
              className="w-20 rounded-full border px-3 py-1.5 text-sm"
              style={FIELD_STYLE}
            />
            <button type="button" onClick={applyScale} disabled={!scaleText.trim()} className="rounded-full px-3 py-1.5 text-sm font-bold disabled:opacity-40" style={QUIET_STYLE}>
              Scale
            </button>
          </span>
        </div>
      </section>

      {/* --- Cost preview --------------------------------------------- */}
      <section className="app-card p-4" aria-live="polite">
        <h2 className="font-extrabold">What it costs</h2>
        {resolvedLines.length === 0 ? (
          <p className="mt-1 text-sm" style={MUTED_TEXT}>
            Add ingredients to see the cost.
          </p>
        ) : feeds === null ? (
          <p className="mt-1 text-sm" style={MUTED_TEXT}>
            Enter how many this feeds to see the cost.
          </p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <StatTile
                label="Recipe total"
                value={preview.priced ? formatDollars(preview.total) : "—"}
                detail={`with ${Math.round(SALES_TAX_RATE * 100)}% tax`}
              />
              <StatTile label="Per person" value={formatMoney(preview.perPerson)} />
              <StatTile label={`For ${FAMILY_SIZE}`} value={formatMoney(preview.family)} />
            </div>
            {preview.nutrition ? (
              <p className="mt-2 text-xs" style={MUTED_TEXT}>
                About {Math.round(preview.nutrition.calories)} kcal, {Math.round(preview.nutrition.protein)} g
                protein per person.
                {preview.autoTags.length > 0 ? ` Earns: ${preview.autoTags.join(", ")}.` : ""}
              </p>
            ) : null}
            {preview.unpriced.length > 0 ? (
              <p className="mt-2 text-xs font-semibold" style={{ color: WARNING_COLOR }}>
                Cost shows once every ingredient has a price. Missing: {preview.unpriced.join(", ")}.
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* --- Method ---------------------------------------------------- */}
      <section className="app-card flex flex-col gap-3 p-4">
        <Field label="Method — one step per line">
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={7} maxLength={10_000} className={FIELD_CLASS} style={FIELD_STYLE} />
        </Field>
        <Field label="Link to the original (optional)">
          <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" inputMode="url" placeholder="https://" className={FIELD_CLASS} style={FIELD_STYLE} />
        </Field>
      </section>

      {/* --- Photo ----------------------------------------------------- */}
      <section className="app-card flex flex-col gap-3 p-4">
        <h2 className="font-extrabold">Photo</h2>
        {shownPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview or a private versioned photo
          <img src={shownPhoto} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-bold" style={QUIET_STYLE}>
            {shownPhoto ? "Replace photo" : "Take or choose photo"}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => choosePhoto(e.target.files?.[0])} />
          </label>
          {shownPhoto ? (
            <button
              type="button"
              onClick={() => setPhoto(initial?.photoUrl && recipeId ? { kind: "remove" } : { kind: "keep" })}
              className="rounded-full px-3.5 py-1.5 text-sm font-bold"
              style={{ ...QUIET_STYLE, color: WARNING_COLOR }}
            >
              Remove photo
            </button>
          ) : null}
          {photo.kind !== "keep" ? (
            <span className="text-xs" style={MUTED_TEXT}>
              {photo.kind === "new" ? "Photo will upload when you save." : "Photo will be removed when you save."}
            </span>
          ) : null}
        </div>
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
          {busy ? "Saving…" : recipeId ? "Save recipe" : "Add recipe"}
        </button>
        <Link
          href={backHref}
          onClick={confirmLeave}
          className="flex items-center rounded-full px-4 py-2.5 text-sm font-bold"
          style={QUIET_STYLE}
        >
          Cancel
        </Link>
        {recipeId ? (
          <button type="button" disabled={busy || readOnly} onClick={onDelete} className="rounded-full px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ ...QUIET_STYLE, color: WARNING_COLOR }}>
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

/** Add a missing ingredient without leaving the recipe. */
function QuickIngredient({
  initialName,
  onCreated,
  onCancel,
}: {
  initialName: string;
  onCreated: (ingredient: IngredientView) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName.trim());
  const [unit, setUnit] = useState("cup");
  const [packLabel, setPackLabel] = useState("");
  const [packUnitsText, setPackUnitsText] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const packUnits = parseQuantity(packUnitsText);
    if (!name.trim() || !unit.trim()) return setError("It needs a name and a unit.");
    if (packUnits === null) return setError(`How many ${pluralUnit(unit, 2)} are in one pack?`);
    const priceList = MAIN_STORES.flatMap((store) => {
      const value = Number((prices[store] ?? "").replace(/^\$/, ""));
      return prices[store]?.trim() && Number.isFinite(value) && value > 0
        ? [{ store, price: Math.round(value * 100) / 100 }]
        : [];
    });

    setBusy(true);
    const result = await saveIngredient({
      name: name.trim(),
      unit: unit.trim(),
      packLabel: packLabel.trim(),
      packUnits,
      prices: priceList,
      nutrition: null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);

    onCreated({
      id: result.id,
      name: name.trim(),
      unit: unit.trim(),
      packLabel: packLabel.trim(),
      packUnits,
      prices: priceList.map((p) => ({ ...p, checkedAt: Date.now(), estimated: false })),
      nutrition: null,
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl p-3" style={{ backgroundColor: "var(--color-surface)" }}>
      <p className="text-xs font-bold">New ingredient</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="New ingredient name" className={FIELD_CLASS} style={FIELD_STYLE} />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} list="meal-units" placeholder="Unit (cup, lb, each)" aria-label="Unit recipes measure it in" className={FIELD_CLASS} style={FIELD_STYLE} />
        <input value={packLabel} onChange={(e) => setPackLabel(e.target.value)} placeholder="Pack (16 oz bag)" aria-label="Pack description" className={FIELD_CLASS} style={FIELD_STYLE} />
        <input value={packUnitsText} onChange={(e) => setPackUnitsText(e.target.value)} inputMode="decimal" placeholder={`${pluralUnit(unit || "unit", 2)} per pack`} aria-label="Units in one pack" className={FIELD_CLASS} style={FIELD_STYLE} />
        {MAIN_STORES.map((store) => (
          <input
            key={store}
            value={prices[store] ?? ""}
            onChange={(e) => setPrices({ ...prices, [store]: e.target.value })}
            inputMode="decimal"
            placeholder={`${store} $`}
            aria-label={`${store} price for one pack`}
            className={FIELD_CLASS}
            style={FIELD_STYLE}
          />
        ))}
      </div>
      <UnitSuggestions />
      {error ? (
        <p className="text-xs font-semibold" style={{ color: WARNING_COLOR }}>
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={create} className="rounded-full px-3.5 py-1.5 text-xs font-extrabold disabled:opacity-50" style={PRIMARY_STYLE}>
          {busy ? "Adding…" : "Add ingredient"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full px-3.5 py-1.5 text-xs font-bold" style={QUIET_STYLE}>
          Cancel
        </button>
      </div>
    </div>
  );
}
