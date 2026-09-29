import type { Metadata } from "next";

import { MealsAdminBoard } from "@/components/meals/admin/MealsAdminBoard";
import { PinGate } from "@/components/shop/admin/PinGate";
import { requireUser } from "@/lib/auth/dal";
import { hasParentPinUnlock } from "@/lib/auth/parent-pin";
import { toIsoDate } from "@/lib/dates";
import { readCatalog } from "@/lib/meals/store";

export const metadata: Metadata = {
  title: "Manage Meals",
};

/**
 * The parent-only half of the Meals page: every recipe and ingredient, and
 * the way into their editors.
 *
 * Gated exactly as `/shop/admin` is — a render decision, not a redirect, with
 * the real boundary in `requireParentPin()` at the top of every action in
 * `lib/meals/admin-actions.ts`. It is the same PIN and the same cookie.
 */
export default async function MealsAdminPage() {
  await requireUser();

  if (!(await hasParentPinUnlock())) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
        <PinGate description="Enter the PIN to add recipes and change prices." />
      </main>
    );
  }

  const catalog = await readCatalog();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <MealsAdminBoard catalog={catalog} initialDateIso={toIsoDate(new Date())} />
    </main>
  );
}
