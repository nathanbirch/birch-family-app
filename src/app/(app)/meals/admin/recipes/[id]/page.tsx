import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RecipeEditor } from "@/components/meals/admin/RecipeEditor";
import { PinGate } from "@/components/shop/admin/PinGate";
import { requireUser } from "@/lib/auth/dal";
import { hasParentPinUnlock } from "@/lib/auth/parent-pin";
import { groupVersions } from "@/lib/meals/browse";
import { readCatalog } from "@/lib/meals/store";
import type { RecipeView } from "@/lib/meals/types";
import { isItemId } from "@/lib/shopping/list";

export const metadata: Metadata = {
  title: "Edit Recipe",
};

/**
 * One recipe's editor, or a new one's.
 *
 * `/meals/admin/recipes/new` starts blank; `?copy=<id>` starts from a copy of
 * that recipe ("New meal (copy)"), and `&version=1` makes the copy another
 * version of the original rather than a meal of its own.
 */
export default async function RecipeEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireUser();

  if (!(await hasParentPinUnlock())) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
        <PinGate description="Enter the PIN to add or change recipes." />
      </main>
    );
  }

  const { id } = await params;
  const query = await searchParams;
  const catalog = await readCatalog();
  const byId = new Map(catalog.recipes.map((recipe) => [recipe.id, recipe]));

  let initial: RecipeView | null = null;
  let isNew = true;

  if (id === "new") {
    const copyId = typeof query.copy === "string" ? query.copy : null;
    const source = copyId && isItemId(copyId) ? byId.get(copyId) : undefined;
    if (source) {
      const asVersion = query.version === "1";
      initial = {
        ...source,
        id: "",
        name: asVersion ? `${source.name} (another version)` : `${source.name} (copy)`,
        variantOf: asVersion ? (source.variantOf ?? source.id) : null,
        photoUrl: null,
      };
    }
  } else {
    if (!isItemId(id)) notFound();
    initial = byId.get(id) ?? null;
    if (!initial) notFound();
    isNew = false;
  }

  // The meals a recipe can be another version of: the head of every group
  // except its own.
  const parents = groupVersions(catalog.recipes)
    .map((group) => group.primary)
    .filter((recipe) => isNew || recipe.id !== id)
    .map((recipe) => ({ id: recipe.id, name: recipe.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <RecipeEditor
        recipeId={isNew ? null : id}
        initial={initial}
        ingredients={catalog.ingredients}
        parents={parents}
        readOnly={catalog.source !== "database"}
      />
    </main>
  );
}
