import type { Metadata } from "next";

import { AdminBoard } from "@/components/shop/admin/AdminBoard";
import { PinGate } from "@/components/shop/admin/PinGate";
import { CHILD_IDS, type ChildId } from "@/config/family";
import { requireUser } from "@/lib/auth/dal";
import { hasParentPinUnlock } from "@/lib/auth/parent-pin";
import { getBalances } from "@/lib/coins/store";
import {
  getRedemptionUsage,
  listAllRewardItems,
  listPendingRedemptions,
} from "@/lib/rewards/store";
import type { AdminRewardItemView, RedemptionView } from "@/lib/rewards/view";

export const metadata: Metadata = {
  title: "Shop Admin",
};

/**
 * The parent-only half of the shop.
 *
 * ---------------------------------------------------------------------------
 * THE GATE IS A RENDER DECISION, NOT A REDIRECT
 * ---------------------------------------------------------------------------
 * `/shop/admin` *is* the admin route — there is nowhere else to send a
 * visitor who has not entered the PIN, so this page draws `<PinGate>` in
 * place of the board rather than bouncing anywhere. The real boundary is not
 * this `if`: it is `requireParentPin()`, called first by every export in
 * `lib/rewards/admin-actions.ts`, so a request built by hand against one of
 * those actions is refused even if this check were somehow skipped.
 */
export default async function ShopAdminPage() {
  await requireUser();

  const unlocked = await hasParentPinUnlock();
  if (!unlocked) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
        <PinGate />
      </main>
    );
  }

  const [itemDocs, pendingDocs, balances, usage] = await Promise.all([
    listAllRewardItems(),
    listPendingRedemptions(),
    getBalances(),
    getRedemptionUsage(),
  ]);

  const items: AdminRewardItemView[] = itemDocs.map((doc) => ({
    id: doc._id.toHexString(),
    tier: doc.tier,
    name: doc.name,
    description: doc.description,
    cost: doc.cost,
    redemptionLimit: doc.redemptionLimit,
    requiresApproval: doc.requiresApproval,
    isFamilyOuting: doc.isFamilyOuting,
    position: doc.position,
    active: doc.active,
  }));

  const pending: RedemptionView[] = pendingDocs.map((row) => ({
    id: row._id.toHexString(),
    childId: row.childId,
    rewardId: row.rewardId.toHexString(),
    nameSnapshot: row.nameSnapshot,
    costSnapshot: row.costSnapshot,
    status: row.status,
    note: row.note,
    requestedAt: row.requestedAt.getTime(),
  }));

  const typedBalances = Object.fromEntries(
    CHILD_IDS.map((id) => [id, balances[id] ?? 0]),
  ) as Record<ChildId, number>;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <AdminBoard items={items} pending={pending} balances={typedBalances} usage={usage} />
    </main>
  );
}
