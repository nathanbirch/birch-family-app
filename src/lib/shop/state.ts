import "server-only";

import { getBalances } from "@/lib/coins/store";
import {
  getActivePool,
  getRewardItem,
  listActiveRewardItems,
  listPendingRedemptions,
  poolTotal,
} from "@/lib/rewards/store";

/**
 * Everything `/shop` and `/shop/admin` need that changes while somebody else
 * is looking at the same page: balances, the family goal's progress, and how
 * many requests are waiting on a parent.
 *
 * Read fresh on every poll of `/api/shop/stream` — see the note there for why
 * this app does not need the shopping list's cheaper "has anything changed"
 * pre-check: five balances and one pool are already the smallest query this
 * could be, so there is nothing cheaper to ask first.
 */
export type ShopState = {
  balances: Record<string, number>;
  pool: { total: number; target: number; status: "active" | "funded" } | null;
  pendingCount: number;
};

export async function readShopState(): Promise<ShopState> {
  const [balances, pendingCount, pool] = await Promise.all([
    getBalances(),
    listPendingRedemptions().then((rows) => rows.length),
    readActivePoolProgress(),
  ]);

  return { balances, pool, pendingCount };
}

/**
 * The Ultimate tier's pool progress, found via its catalogue item rather than
 * a stored id — there is exactly one active Ultimate reward at a time in the
 * seeded catalogue, and `/shop` only ever shows the first one it finds.
 */
async function readActivePoolProgress(): Promise<ShopState["pool"]> {
  const items = await listActiveRewardItems();
  const ultimate = items.find((item) => item.tier === "ultimate");
  if (!ultimate) return null;

  const pool = await getActivePool(ultimate._id);
  if (pool) {
    return { total: poolTotal(pool), target: pool.target, status: "active" };
  }

  // Between a pool being funded and a parent approving the redemption that
  // closes it out, there is no *active* pool — it is momentarily "funded"
  // instead, and the progress bar should read as full rather than as empty.
  const reward = await getRewardItem(ultimate._id.toHexString());
  return reward
    ? { total: reward.cost, target: reward.cost, status: "funded" }
    : null;
}

/** A cheap equality check for the poll loop — order-independent on balances. */
export function sameShopState(a: ShopState, b: ShopState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
