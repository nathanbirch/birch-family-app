import type { Metadata } from "next";

import { ShoppingBoard } from "@/components/shopping/ShoppingBoard";
import { requireUser } from "@/lib/auth/dal";
import { readShoppingList } from "@/lib/shopping/store";

export const metadata: Metadata = {
  title: "Shopping",
};

/**
 * The family shopping list.
 *
 * The first page in the app where two people are expected to be *editing* at the
 * same time, and the only one that keeps a connection open to say so. See
 * [the shopping list](../../../../docs/shopping.md).
 *
 * The whole list is read here and handed to the island, so the very first paint
 * already shows real rows — somebody opening the app in a supermarket should not
 * watch a spinner. From that point on the page updates itself through
 * `/api/shopping/stream` rather than through this render.
 */
export default async function ShoppingPage() {
  const user = await requireUser();
  const list = await readShoppingList();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <ShoppingBoard initial={list} me={user.displayName} />
    </main>
  );
}
