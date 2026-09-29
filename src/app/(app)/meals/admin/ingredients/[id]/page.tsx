import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IngredientEditor } from "@/components/meals/admin/IngredientEditor";
import { PinGate } from "@/components/shop/admin/PinGate";
import { requireUser } from "@/lib/auth/dal";
import { hasParentPinUnlock } from "@/lib/auth/parent-pin";
import { toIsoDate } from "@/lib/dates";
import { ingredientUsage } from "@/lib/meals/costing";
import { readCatalog } from "@/lib/meals/store";
import { isItemId } from "@/lib/shopping/list";

export const metadata: Metadata = {
  title: "Edit Ingredient",
};

/** One ingredient's editor — `/meals/admin/ingredients/new` for a new one. */
export default async function IngredientEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();

  if (!(await hasParentPinUnlock())) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
        <PinGate description="Enter the PIN to change ingredients and prices." />
      </main>
    );
  }

  const { id } = await params;
  const catalog = await readCatalog();

  let initial = null;
  if (id !== "new") {
    if (!isItemId(id)) notFound();
    initial = catalog.ingredients.find((ingredient) => ingredient.id === id) ?? null;
    if (!initial) notFound();
  }

  const usedBy = initial ? (ingredientUsage(catalog.recipes).get(initial.id) ?? []) : [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <IngredientEditor
        initial={initial}
        usedBy={usedBy}
        existingNames={catalog.ingredients
          .filter((ingredient) => ingredient.id !== initial?.id)
          .map((ingredient) => ingredient.name)}
        readOnly={catalog.source !== "database"}
        initialDateIso={toIsoDate(new Date())}
      />
    </main>
  );
}
