import type { Metadata } from "next";

import { MealsBoard, type MealsTab } from "@/components/meals/MealsBoard";
import { requireUser } from "@/lib/auth/dal";
import { hasParentPinUnlock } from "@/lib/auth/parent-pin";
import { toIsoDate } from "@/lib/dates";
import { readCatalog, readFamilyState } from "@/lib/meals/store";
import { isItemId } from "@/lib/shopping/list";

export const metadata: Metadata = {
  title: "Meals",
};

/**
 * The Meals page: what to make, what it costs, and the week's plan.
 *
 * The whole catalog — a few hundred small documents — is read here and handed
 * to the board, which does every search, filter, sort and price in the
 * browser. That keeps a filter tap free of round trips, and means the first
 * paint already shows real prices. See [Meals](../../../../docs/meals.md).
 *
 * The first time this page is opened against an empty database it seeds the
 * starter catalog itself (see `ensureMealsSeeded`), so there is no setup step
 * between deploying it and using it.
 */
export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireUser();

  const params = await searchParams;
  const [catalog, state, unlocked] = await Promise.all([
    readCatalog(),
    readFamilyState(),
    hasParentPinUnlock(),
  ]);

  const tabParam = typeof params.tab === "string" ? params.tab : "";
  const initialTab: MealsTab = tabParam === "plan" || tabParam === "prices" ? tabParam : "meals";
  const mealParam = typeof params.meal === "string" ? params.meal : null;
  const initialMealId = mealParam && isItemId(mealParam) ? mealParam : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <MealsBoard
        catalog={catalog}
        state={state}
        unlocked={unlocked}
        initialTab={initialTab}
        initialMealId={initialMealId}
        initialDateIso={toIsoDate(new Date())}
      />
    </main>
  );
}
