import type { Metadata } from "next";
import { ObjectId } from "mongodb";

import { ShopBoard } from "@/components/shop/ShopBoard";
import { CHILD_IDS, type ChildId } from "@/config/family";
import { requireUser } from "@/lib/auth/dal";
import { hasParentPinUnlock } from "@/lib/auth/parent-pin";
import { readShopState } from "@/lib/shop/state";
import {
  getActivePool,
  listActiveRewardItems,
  listRedemptionsForChild,
} from "@/lib/rewards/store";
import type { RedemptionView, RewardItemView } from "@/lib/rewards/view";

export const metadata: Metadata = {
  title: "The Shop",
};

/**
 * The kid-facing shop: a balance, the reward catalogue, and the family goal.
 *
 * Everything is read once here for the first paint, then kept current by
 * `/api/shop/stream` — the same split `/shopping` uses, for the same reason:
 * somebody spending coins in the kitchen should update the balance on the
 * phone upstairs without either of them refreshing.
 */
export default async function ShopPage() {
  await requireUser();

  const [itemDocs, state, parentUnlocked] = await Promise.all([
    listActiveRewardItems(),
    readShopState(),
    hasParentPinUnlock(),
  ]);

  const items: RewardItemView[] = itemDocs.map((doc) => ({
    id: doc._id.toHexString(),
    tier: doc.tier,
    name: doc.name,
    description: doc.description,
    cost: doc.cost,
    redemptionLimit: doc.redemptionLimit,
    requiresApproval: doc.requiresApproval,
    isFamilyOuting: doc.isFamilyOuting,
  }));

  const redemptionsByChild = Object.fromEntries(
    await Promise.all(
      CHILD_IDS.map(async (childId) => {
        const rows = await listRedemptionsForChild(childId);
        const views: RedemptionView[] = rows.map((row) => ({
          id: row._id.toHexString(),
          childId: row.childId,
          rewardId: row.rewardId.toHexString(),
          nameSnapshot: row.nameSnapshot,
          costSnapshot: row.costSnapshot,
          status: row.status,
          note: row.note,
          requestedAt: row.requestedAt.getTime(),
        }));
        return [childId, views] as const;
      }),
    ),
  ) as Record<ChildId, RedemptionView[]>;

  const ultimate = items.find((item) => item.tier === "ultimate") ?? null;
  const pool = ultimate
    ? await getActivePool(new ObjectId(ultimate.id)).then((doc) =>
        doc
          ? {
              id: doc._id.toHexString(),
              rewardId: ultimate.id,
              target: doc.target,
              total: doc.contributions.reduce((sum, c) => sum + c.amount, 0),
              contributions: doc.contributions.map((c) => ({
                childId: c.childId,
                amount: c.amount,
              })),
            }
          : null,
      )
    : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <ShopBoard
        items={items}
        redemptionsByChild={redemptionsByChild}
        initialState={state}
        pool={pool}
        ultimateName={ultimate?.name ?? null}
        parentUnlocked={parentUnlocked}
      />
    </main>
  );
}
