import "server-only";

import { ObjectId, type Collection } from "mongodb";

import { COLLECTIONS } from "@/config/db";
import { CHILD_IDS, type ChildId } from "@/config/family";
import { reportDegraded } from "@/lib/data-health";
import { getCollection } from "@/lib/db";

/**
 * The `coinTransactions` collection — every coin anybody has ever earned or
 * spent, as an append-only ledger.
 *
 * ---------------------------------------------------------------------------
 * A BALANCE IS NEVER STORED, ONLY EARNED FROM THIS
 * ---------------------------------------------------------------------------
 * Same principle as `starWeeks`: a document per event rather than a running
 * total, because a running total is a second place the truth can drift from
 * the events that produced it. `getBalance`/`getBalances` sum this collection
 * every time they are asked, which is the only way a balance can never
 * disagree with the ledger a parent is looking at in `/shop/admin`.
 *
 * `amount` is signed — positive for a ceremony conversion or a correction in
 * the family's favour, negative for a redemption or a pool contribution — so
 * the balance is one `$sum` rather than a subtraction of two collections.
 *
 * ---------------------------------------------------------------------------
 * WHY `(childId, weekStart)` IS UNIQUE, BUT ONLY FOR CONVERSIONS
 * ---------------------------------------------------------------------------
 * A ceremony can be rewatched — dragged back through, or opened again days
 * later — and it must not be possible to mint the same week's coins twice by
 * doing so. The index below is a *partial* unique index, scoped to
 * `type: "ceremony_conversion"`, because nothing about a redemption or an
 * adjustment is unique per week: a child can buy the same reward twice in one
 * week, and a parent can correct a balance more than once.
 */

export type CoinTransactionType =
  | "ceremony_conversion"
  | "redemption"
  | "pool_contribution"
  | "adjustment";

export type CoinTransactionDocument = {
  _id: ObjectId;
  childId: string;
  type: CoinTransactionType;
  /** Signed: earned is positive, spent is negative. */
  amount: number;
  /** Set only on `"ceremony_conversion"` rows. `YYYY-MM-DD`, the week's Monday. */
  weekStart?: string;
  /** Set only on `"redemption"` rows. */
  redemptionId?: ObjectId;
  /** Set only on `"pool_contribution"` rows. */
  poolId?: ObjectId;
  /** Free text — which reward, or why a correction was made. */
  note: string;
  createdAt: Date;
  /** Display name of whoever caused the write — a parent for an adjustment. */
  createdBy: string;
};

async function coinTransactions(): Promise<Collection<CoinTransactionDocument>> {
  return getCollection<CoinTransactionDocument>(COLLECTIONS.coinTransactions);
}

/** Every child's balance, `0` for a child with no transactions at all. */
export async function getBalances(): Promise<Record<ChildId, number>> {
  const balances = Object.fromEntries(
    CHILD_IDS.map((id) => [id, 0]),
  ) as Record<ChildId, number>;

  try {
    const collection = await coinTransactions();
    const rows = await collection
      .aggregate<{ _id: string; total: number }>([
        { $group: { _id: "$childId", total: { $sum: "$amount" } } },
      ])
      .toArray();

    for (const row of rows) {
      if (isChildId(row._id)) balances[row._id] = row.total;
    }
  } catch (error) {
    reportDegraded("coins");
    console.warn(
      `[coins] Could not read balances: ${describe(error)}. Showing zero for everyone.`,
    );
  }

  return balances;
}

/** One child's balance. A thin wrapper over `getBalances` for a single read. */
export async function getBalance(childId: ChildId): Promise<number> {
  const balances = await getBalances();
  return balances[childId] ?? 0;
}

/**
 * The conversion already recorded for this child and week, if any.
 *
 * Read before offering the "convert to coins" choice on a ceremony slide, so
 * a rewatch shows what happened rather than asking again.
 */
export async function getConversionForWeek(
  childId: ChildId,
  weekStart: string,
): Promise<CoinTransactionDocument | null> {
  try {
    const collection = await coinTransactions();
    return await collection.findOne({
      childId,
      type: "ceremony_conversion",
      weekStart,
    });
  } catch (error) {
    reportDegraded("coins");
    console.warn(
      `[coins] Could not check the conversion for ${childId}, week of ${weekStart}: ` +
        `${describe(error)}. Offering the choice as though nothing had been converted.`,
    );
    return null;
  }
}

/** Every conversion already recorded, keyed by `${childId}:${weekStart}`. */
export async function getConversionsForWeeks(
  weekStarts: readonly string[],
): Promise<Map<string, CoinTransactionDocument>> {
  const map = new Map<string, CoinTransactionDocument>();
  if (weekStarts.length === 0) return map;

  try {
    const collection = await coinTransactions();
    const rows = await collection
      .find({
        type: "ceremony_conversion",
        weekStart: { $in: [...weekStarts] },
      })
      .toArray();
    for (const row of rows) {
      if (row.weekStart) map.set(`${row.childId}:${row.weekStart}`, row);
    }
  } catch (error) {
    reportDegraded("coins");
    console.warn(
      `[coins] Could not check conversions for ${weekStarts.length} week(s): ` +
        `${describe(error)}.`,
    );
  }
  return map;
}

export type ConvertOutcome =
  | { outcome: "converted"; amount: number }
  | { outcome: "already-converted"; amount: number };

/**
 * Record a week's stars as coins, once.
 *
 * The unique index on `(childId, weekStart)` — scoped to this type, see the
 * note at the top — is what makes a rewatch safe: a second attempt collides on
 * it rather than minting a second pile of coins, and that collision is read
 * back as the amount that was recorded the first time rather than surfaced as
 * an error. Same shape as `setStarMark`'s upsert-with-retry, except here the
 * retry is a *read*, because the row this write collided with already has the
 * answer.
 */
export async function insertConversion(input: {
  childId: ChildId;
  weekStart: string;
  amount: number;
  createdBy: string;
}): Promise<ConvertOutcome> {
  const collection = await coinTransactions();

  try {
    await collection.insertOne({
      _id: new ObjectId(),
      childId: input.childId,
      type: "ceremony_conversion",
      amount: input.amount,
      weekStart: input.weekStart,
      note: `Ceremony conversion, week of ${input.weekStart}`,
      createdAt: new Date(),
      createdBy: input.createdBy,
    });
    return { outcome: "converted", amount: input.amount };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const existing = await collection.findOne({
      childId: input.childId,
      type: "ceremony_conversion",
      weekStart: input.weekStart,
    });
    // The row we just collided with must exist — but a fallback of the amount
    // we were trying to write keeps this from throwing in front of a ceremony
    // in the one-in-a-million case a concurrent delete beat us to it.
    return {
      outcome: "already-converted",
      amount: existing?.amount ?? input.amount,
    };
  }
}

/** A debit or credit that is not a ceremony conversion. */
export async function insertTransaction(input: {
  childId: ChildId;
  type: Exclude<CoinTransactionType, "ceremony_conversion">;
  amount: number;
  redemptionId?: ObjectId;
  poolId?: ObjectId;
  note: string;
  createdBy: string;
}): Promise<void> {
  const collection = await coinTransactions();
  await collection.insertOne({
    _id: new ObjectId(),
    childId: input.childId,
    type: input.type,
    amount: input.amount,
    redemptionId: input.redemptionId,
    poolId: input.poolId,
    note: input.note,
    createdAt: new Date(),
    createdBy: input.createdBy,
  });
}

/** The most recent transactions, newest first — the admin ledger. */
export async function listRecentTransactions(
  limit: number,
): Promise<CoinTransactionDocument[]> {
  try {
    const collection = await coinTransactions();
    return await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  } catch (error) {
    reportDegraded("coins");
    console.warn(`[coins] Could not read the ledger: ${describe(error)}.`);
    return [];
  }
}

/** Indexes this collection needs. Idempotent; the seed script calls it. */
export async function ensureCoinIndexes(): Promise<void> {
  const collection = await coinTransactions();
  await collection.createIndex(
    { childId: 1, weekStart: 1 },
    {
      unique: true,
      name: "conversion_unique",
      partialFilterExpression: { type: "ceremony_conversion" },
    },
  );
  await collection.createIndex({ childId: 1 }, { name: "by_child" });
}

function isChildId(value: string): value is ChildId {
  return (CHILD_IDS as readonly string[]).includes(value);
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
