import "server-only";

import { ObjectId, type Collection } from "mongodb";

import { COLLECTIONS } from "@/config/db";
import { reportDegraded } from "@/lib/data-health";
import { getCollection } from "@/lib/db";

/**
 * The three collections behind the shop: the catalogue, the redemptions, and
 * the Ultimate tier's pooled goal.
 *
 * ---------------------------------------------------------------------------
 * WHY ONE FILE FOR THREE COLLECTIONS
 * ---------------------------------------------------------------------------
 * `starWeeks` and `shoppingItems` each get their own store file because each
 * is read and written on its own. These three are not: redeeming a reward
 * touches `rewardItems` to price it and `rewardRedemptions` to record it in
 * the same breath, and funding the pool touches `rewardPools` in a shape that
 * mirrors the redemption flow closely enough that splitting them would mean
 * three files constantly importing each other's types. Kept together, the
 * way `lib/stars/marks.ts` and `lib/stars/counting.ts` are kept apart instead —
 * because *those* two really are independent (pure counting vs. storage) and
 * these three are one feature's data.
 */

export type RewardTier = "quick" | "special" | "epic" | "ultimate";

export type RewardItemDocument = {
  _id: ObjectId;
  tier: RewardTier;
  name: string;
  description: string;
  /** In coins. */
  cost: number;
  /** Manual ordering within a tier — see `reorderRewardItems`. */
  position: number;
  redemptionLimit: { count: number; periodDays: number } | null;
  requiresApproval: boolean;
  /** Cosmetic badge on the card — the Epic outings, and the Ultimate goal. */
  isFamilyOuting: boolean;
  /** Soft delete. A retired item's own redemptions still resolve their name
   * and cost from the *snapshot* on the redemption, not from this document. */
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RedemptionStatus = "completed" | "pending" | "approved" | "denied";

export type RewardRedemptionDocument = {
  _id: ObjectId;
  childId: string;
  rewardId: ObjectId;
  /** The reward's own fields, copied in at the moment of purchase — see the
   * note on `rewardItems` in `config/db.ts` for why this cannot be a join. */
  nameSnapshot: string;
  costSnapshot: number;
  tierSnapshot: RewardTier;
  requiresApproval: boolean;
  status: RedemptionStatus;
  /** Chore choice, scheduling note, or why a request was denied. */
  note: string;
  requestedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
};

export type PoolContribution = {
  childId: string;
  amount: number;
  at: Date;
};

export type PoolStatus = "active" | "funded" | "redeemed";

export type RewardPoolDocument = {
  _id: ObjectId;
  rewardId: ObjectId;
  status: PoolStatus;
  target: number;
  contributions: PoolContribution[];
  createdAt: Date;
};

async function rewardItems(): Promise<Collection<RewardItemDocument>> {
  return getCollection<RewardItemDocument>(COLLECTIONS.rewardItems);
}

async function rewardRedemptions(): Promise<
  Collection<RewardRedemptionDocument>
> {
  return getCollection<RewardRedemptionDocument>(COLLECTIONS.rewardRedemptions);
}

async function rewardPools(): Promise<Collection<RewardPoolDocument>> {
  return getCollection<RewardPoolDocument>(COLLECTIONS.rewardPools);
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                   */
/* -------------------------------------------------------------------------- */

const TIER_ORDER: readonly RewardTier[] = ["quick", "special", "epic", "ultimate"];

/** Every active item, sorted the way `/shop` shows them: tier, then position. */
export async function listActiveRewardItems(): Promise<RewardItemDocument[]> {
  try {
    const collection = await rewardItems();
    const rows = await collection.find({ active: true }).toArray();
    return sortByTierAndPosition(rows);
  } catch (error) {
    reportDegraded("rewards");
    console.warn(
      `[rewards] Could not read the catalogue: ${describe(error)}. Showing nothing.`,
    );
    return [];
  }
}

/** Every item, active or not — the admin screen's own view of the catalogue. */
export async function listAllRewardItems(): Promise<RewardItemDocument[]> {
  try {
    const collection = await rewardItems();
    const rows = await collection.find({}).toArray();
    return sortByTierAndPosition(rows);
  } catch (error) {
    reportDegraded("rewards");
    console.warn(
      `[rewards] Could not read the full catalogue: ${describe(error)}.`,
    );
    return [];
  }
}

function sortByTierAndPosition(
  rows: readonly RewardItemDocument[],
): RewardItemDocument[] {
  return [...rows].sort((a, b) => {
    const tier = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    return tier !== 0 ? tier : a.position - b.position;
  });
}

export async function getRewardItem(
  id: string,
): Promise<RewardItemDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = await rewardItems();
  return collection.findOne({ _id: new ObjectId(id) });
}

export async function insertRewardItem(input: {
  tier: RewardTier;
  name: string;
  description: string;
  cost: number;
  redemptionLimit: { count: number; periodDays: number } | null;
  requiresApproval: boolean;
  isFamilyOuting: boolean;
}): Promise<RewardItemDocument> {
  const collection = await rewardItems();
  // New items go to the end of their tier, which is a `count` rather than a
  // `max` + 1: an empty tier has no rows to take a maximum of, and a `count`
  // is correct there without a special case.
  const position = await collection.countDocuments({ tier: input.tier });

  const now = new Date();
  const doc: RewardItemDocument = {
    _id: new ObjectId(),
    tier: input.tier,
    name: input.name,
    description: input.description,
    cost: input.cost,
    position,
    redemptionLimit: input.redemptionLimit,
    requiresApproval: input.requiresApproval,
    isFamilyOuting: input.isFamilyOuting,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateRewardItem(
  id: string,
  patch: Partial<{
    tier: RewardTier;
    name: string;
    description: string;
    cost: number;
    redemptionLimit: { count: number; periodDays: number } | null;
    requiresApproval: boolean;
    isFamilyOuting: boolean;
    active: boolean;
  }>,
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const collection = await rewardItems();
  const outcome = await collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
  );
  return outcome.matchedCount > 0;
}

/** Soft delete: a retired item never appears on `/shop` again, but its past
 * redemptions still have a name and cost to show. */
export async function deactivateRewardItem(id: string): Promise<boolean> {
  return updateRewardItem(id, { active: false });
}

/**
 * Renumber one tier's `position` fields to match the order given.
 *
 * `orderedIds` must be every active id in that tier, so this is one `bulkWrite`
 * rather than a shuffle of neighbouring positions — up/down in the admin UI is
 * "take the full order, move one id, send the whole thing back".
 */
export async function reorderRewardItems(
  tier: RewardTier,
  orderedIds: readonly string[],
): Promise<void> {
  const collection = await rewardItems();
  const operations = orderedIds
    .filter((id) => ObjectId.isValid(id))
    .map((id, position) => ({
      updateOne: {
        filter: { _id: new ObjectId(id), tier },
        update: { $set: { position, updatedAt: new Date() } },
      },
    }));
  if (operations.length === 0) return;
  await collection.bulkWrite(operations);
}

/* -------------------------------------------------------------------------- */
/* Redemptions                                                                 */
/* -------------------------------------------------------------------------- */

export async function insertRedemption(input: {
  childId: string;
  rewardId: ObjectId;
  nameSnapshot: string;
  costSnapshot: number;
  tierSnapshot: RewardTier;
  requiresApproval: boolean;
  status: RedemptionStatus;
  note: string;
}): Promise<RewardRedemptionDocument> {
  const collection = await rewardRedemptions();
  const now = new Date();
  const resolvedNow = input.status === "completed";
  const doc: RewardRedemptionDocument = {
    _id: new ObjectId(),
    childId: input.childId,
    rewardId: input.rewardId,
    nameSnapshot: input.nameSnapshot,
    costSnapshot: input.costSnapshot,
    tierSnapshot: input.tierSnapshot,
    requiresApproval: input.requiresApproval,
    status: input.status,
    note: input.note,
    requestedAt: now,
    resolvedAt: resolvedNow ? now : null,
    resolvedBy: resolvedNow ? "system" : null,
  };
  await collection.insertOne(doc);
  return doc;
}

/**
 * How many times `childId` has redeemed `rewardId` in the last `periodDays`
 * days, counting only rows that were or still could be honoured.
 *
 * `"denied"` is excluded on purpose: a request a parent turned down never
 * happened as far as the limit is concerned, which is what lets a child ask
 * again the same week after a "not tonight".
 */
export async function countRecentRedemptions(
  childId: string,
  rewardId: ObjectId,
  periodDays: number,
): Promise<number> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const collection = await rewardRedemptions();
  return collection.countDocuments({
    childId,
    rewardId,
    status: { $in: ["completed", "pending", "approved"] },
    requestedAt: { $gte: since },
  });
}

export async function listRedemptionsForChild(
  childId: string,
): Promise<RewardRedemptionDocument[]> {
  try {
    const collection = await rewardRedemptions();
    return await collection
      .find({ childId })
      .sort({ requestedAt: -1 })
      .toArray();
  } catch (error) {
    reportDegraded("rewards");
    console.warn(
      `[rewards] Could not read ${childId}'s redemptions: ${describe(error)}.`,
    );
    return [];
  }
}

/** Every request still awaiting a parent's decision, oldest first. */
/**
 * How many times each reward has ever been redeemed, in total and broken
 * down by child — the admin screen's "redeemed 14× · Hannah 3, James 2" line.
 *
 * One aggregation over the whole ledger rather than a query per reward: the
 * catalogue is small (dozens of rows, not thousands), so grouping everything
 * once and letting the caller look up by id is cheaper than N round trips,
 * and it is the same collection `countRecentRedemptions` already reads — no
 * second way of counting a redemption exists anywhere in this file.
 *
 * `"denied"` is excluded, for the same reason it is excluded from the
 * redemption-limit count: a request a parent turned down was never honoured.
 */
export async function getRedemptionUsage(): Promise<
  Record<string, { total: number; byChild: Record<string, number> }>
> {
  const usage: Record<string, { total: number; byChild: Record<string, number> }> = {};
  try {
    const collection = await rewardRedemptions();
    const rows = await collection
      .aggregate<{ _id: { rewardId: ObjectId; childId: string }; count: number }>([
        { $match: { status: { $ne: "denied" } } },
        { $group: { _id: { rewardId: "$rewardId", childId: "$childId" }, count: { $sum: 1 } } },
      ])
      .toArray();

    for (const row of rows) {
      const key = row._id.rewardId.toHexString();
      const entry = usage[key] ?? { total: 0, byChild: {} };
      entry.total += row.count;
      entry.byChild[row._id.childId] = (entry.byChild[row._id.childId] ?? 0) + row.count;
      usage[key] = entry;
    }
  } catch (error) {
    reportDegraded("rewards");
    console.warn(`[rewards] Could not read redemption usage: ${describe(error)}.`);
  }
  return usage;
}

export async function listPendingRedemptions(): Promise<
  RewardRedemptionDocument[]
> {
  try {
    const collection = await rewardRedemptions();
    return await collection
      .find({ status: "pending" })
      .sort({ requestedAt: 1 })
      .toArray();
  } catch (error) {
    reportDegraded("rewards");
    console.warn(`[rewards] Could not read pending requests: ${describe(error)}.`);
    return [];
  }
}

export async function getRedemption(
  id: string,
): Promise<RewardRedemptionDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = await rewardRedemptions();
  return collection.findOne({ _id: new ObjectId(id) });
}

export async function resolveRedemptionStatus(
  id: ObjectId,
  status: "approved" | "denied",
  note: string,
  resolvedBy: string,
): Promise<boolean> {
  const collection = await rewardRedemptions();
  const outcome = await collection.updateOne(
    { _id: id, status: "pending" },
    { $set: { status, note, resolvedAt: new Date(), resolvedBy } },
  );
  return outcome.matchedCount > 0;
}

/* -------------------------------------------------------------------------- */
/* The Ultimate pool                                                           */
/* -------------------------------------------------------------------------- */

/** The pool currently taking contributions for `rewardId`, if any. */
export async function getActivePool(
  rewardId: ObjectId,
): Promise<RewardPoolDocument | null> {
  try {
    const collection = await rewardPools();
    return await collection.findOne({ rewardId, status: "active" });
  } catch (error) {
    reportDegraded("rewards");
    console.warn(`[rewards] Could not read the family goal: ${describe(error)}.`);
    return null;
  }
}

/**
 * The pool waiting to be scheduled and closed out — `"funded"` rather than
 * `"active"`. This is what `resolveRedemption` looks up when an approved
 * request turns out to be the Ultimate tier's: there is no `poolId` on the
 * redemption itself (a redemption is about coins spent, and a pool
 * contribution already debited each contributor at the time it was made), so
 * the pool is found by the same `rewardId` instead.
 */
export async function getFundedPool(
  rewardId: ObjectId,
): Promise<RewardPoolDocument | null> {
  const collection = await rewardPools();
  return collection.findOne({ rewardId, status: "funded" });
}

export async function insertPool(
  rewardId: ObjectId,
  target: number,
): Promise<RewardPoolDocument> {
  const collection = await rewardPools();
  const doc: RewardPoolDocument = {
    _id: new ObjectId(),
    rewardId,
    status: "active",
    target,
    contributions: [],
    createdAt: new Date(),
  };
  await collection.insertOne(doc);
  return doc;
}

export type ContributeOutcome = {
  pool: RewardPoolDocument;
  /** Whether *this* contribution is what crossed the target. */
  justFunded: boolean;
};

/**
 * Add one contribution to the active pool, atomically, and flip it to
 * `"funded"` in the same write if it just crossed `target`.
 *
 * A single aggregation-pipeline update rather than a push followed by a
 * separate check-and-set — the same reason `setStarMark` rebuilds the whole
 * row in one pipeline: two children contributing within the same second must
 * not have the second one's "did we cross the target" read run against a
 * document the first one's write has not landed in yet.
 */
export async function contributeToPool(
  poolId: ObjectId,
  childId: string,
  amount: number,
): Promise<ContributeOutcome | null> {
  const collection = await rewardPools();

  const before = await collection.findOne({ _id: poolId });
  if (!before || before.status !== "active") return null;

  const after = await collection.findOneAndUpdate(
    { _id: poolId, status: "active" },
    [
      {
        $set: {
          contributions: {
            $concatArrays: [
              "$contributions",
              [{ childId, amount, at: "$$NOW" }],
            ],
          },
        },
      },
      {
        $set: {
          status: {
            $cond: [
              {
                $gte: [
                  { $sum: "$contributions.amount" },
                  "$target",
                ],
              },
              "funded",
              "$status",
            ],
          },
        },
      },
    ],
    { returnDocument: "after" },
  );

  if (!after) return null;
  return { pool: after, justFunded: after.status === "funded" };
}

export async function markPoolRedeemed(poolId: ObjectId): Promise<boolean> {
  const collection = await rewardPools();
  const outcome = await collection.updateOne(
    { _id: poolId, status: "funded" },
    { $set: { status: "redeemed" } },
  );
  return outcome.matchedCount > 0;
}

/** Total contributed so far, summed from the ledger of contributions. */
export function poolTotal(pool: RewardPoolDocument): number {
  return pool.contributions.reduce((total, entry) => total + entry.amount, 0);
}

/** Indexes these collections need. Idempotent; the seed script calls it. */
export async function ensureRewardIndexes(): Promise<void> {
  const items = await rewardItems();
  await items.createIndex({ tier: 1, position: 1 }, { name: "tier_position" });

  const redemptions = await rewardRedemptions();
  await redemptions.createIndex({ childId: 1, rewardId: 1 }, { name: "by_child_reward" });
  await redemptions.createIndex({ status: 1 }, { name: "by_status" });

  const pools = await rewardPools();
  await pools.createIndex(
    { rewardId: 1, status: 1 },
    { name: "reward_status" },
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
