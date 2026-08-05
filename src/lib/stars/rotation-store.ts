import "server-only";

import { cache } from "react";
import type { Collection, ObjectId } from "mongodb";
import { z } from "zod";

import {
  CHORE_POOLS,
  type ChorePool,
  type ChorePoolId,
} from "@/config/chore-rotation";
import { COLLECTIONS } from "@/config/db";
import { CHILD_IDS } from "@/config/family";
import { getCollection } from "@/lib/db";

import { findChorePoolProblem } from "./rotation";

/**
 * The `choreRotations` collection — the database half of the chore rotation.
 * The maths lives in `rotation.ts` and never touches Mongo.
 *
 * One document per pool:
 *
 *   { poolId: "bigs", children: [...], chores: [...], anchorMonth: "2026-08" }
 *
 * Reading is forgiving and writing is strict, exactly as with the pets. This
 * is a page five children open every morning, so a malformed document must not
 * be able to take it down — the read falls back to the pools compiled into
 * `config/chore-rotation.ts` and says so in the log.
 *
 * Note what is *not* validated here: whether a stored pool covers every
 * rotating chore. That check needs all the pools together, so it happens once
 * at the end, against the merged set.
 */

const POOL_IDS = CHORE_POOLS.map((pool) => pool.id) as [
  ChorePoolId,
  ...ChorePoolId[],
];

const CHILD_ENUM = CHILD_IDS as unknown as [string, ...string[]];

/** The stored shape, validated on the way *out* of the database. */
const chorePoolSchema = z.object({
  poolId: z.enum(POOL_IDS),
  name: z.string().min(1),
  children: z.array(z.enum(CHILD_ENUM)).min(1),
  chores: z.array(z.string().min(1)).min(1),
  anchorMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

export type ChorePoolDocument = {
  _id: ObjectId;
  poolId: ChorePoolId;
  name: string;
  children: string[];
  chores: string[];
  anchorMonth: string;
  updatedAt: Date;
};

async function choreRotations(): Promise<Collection<ChorePoolDocument>> {
  return getCollection<ChorePoolDocument>(COLLECTIONS.choreRotations);
}

/**
 * The live pools, in the order they are listed in `config/chore-rotation.ts`.
 *
 * `cache()` memoises per render pass, so the page, the header and anything
 * else that asks during one render share a single query.
 */
export const getChorePools = cache(async (): Promise<readonly ChorePool[]> => {
  let stored: ChorePoolDocument[];
  try {
    const collection = await choreRotations();
    stored = await collection.find({}).toArray();
  } catch (error) {
    return fallback("the database could not be reached", error);
  }

  const byId = new Map<ChorePoolId, ChorePool>();
  for (const document of stored) {
    const parsed = chorePoolSchema.safeParse(document);
    if (!parsed.success) {
      console.warn(
        `[stars] Ignoring a malformed choreRotations document ` +
          `(${String(document.poolId)}): ${parsed.error.message}`,
      );
      continue;
    }
    const { poolId, ...rest } = parsed.data;
    byId.set(poolId, { id: poolId, ...rest } as ChorePool);
  }

  // Configured order, and every pool accounted for: a pool the collection has
  // no row for falls back to its compiled default rather than its children
  // silently losing all their chores.
  const pools = CHORE_POOLS.map((pool) => byId.get(pool.id) ?? pool);

  const problem = findChorePoolProblem(pools);
  if (problem) return fallback(`the stored rotation is unusable — ${problem}`);

  return pools;
});

function fallback(reason: string, error?: unknown): readonly ChorePool[] {
  console.warn(
    `[stars] Falling back to the pools compiled into ` +
      `config/chore-rotation.ts: ${reason}.` +
      `${error ? ` (${describe(error)})` : ""}`,
  );
  return CHORE_POOLS;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
