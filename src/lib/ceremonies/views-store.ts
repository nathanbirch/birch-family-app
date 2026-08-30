import "server-only";

import { ObjectId, type Collection } from "mongodb";

import { COLLECTIONS } from "@/config/db";
import { getCollection } from "@/lib/db";

/**
 * The `ceremonyViews` collection — one row per ceremony ever opened.
 *
 * ---------------------------------------------------------------------------
 * WHY A BARE "HAS THIS BEEN OPENED" ROW, AND NOTHING RICHER
 * ---------------------------------------------------------------------------
 * The parent PIN in front of a ceremony's first opening (see the ceremony
 * page) is a ritual gate, not a security boundary — the same family login
 * everyone already shares. All it needs to remember is whether the moment has
 * already happened, so a rewatch does not ask again. Nothing about *who*
 * opened it or *when* matters to that question, so nothing else is stored.
 */

type CeremonyViewDocument = {
  _id: ObjectId;
  key: string;
  firstViewedAt: Date;
};

async function ceremonyViews(): Promise<Collection<CeremonyViewDocument>> {
  return getCollection<CeremonyViewDocument>(COLLECTIONS.ceremonyViews);
}

/** Whether this ceremony has ever been opened before. */
export async function hasBeenViewed(key: string): Promise<boolean> {
  const collection = await ceremonyViews();
  return (await collection.findOne({ key })) !== null;
}

/**
 * Marks a ceremony opened, and says whether *this* call is the one that did
 * it.
 *
 * Only ever call this once the PIN gate has already been satisfied — this
 * function does not check it. `findOneAndUpdate` with `$setOnInsert` is
 * atomic, so two requests racing to open the same ceremony for the first time
 * can never both be told they were first.
 */
export async function recordFirstView(key: string): Promise<boolean> {
  const collection = await ceremonyViews();
  const before = await collection.findOneAndUpdate(
    { key },
    { $setOnInsert: { _id: new ObjectId(), key, firstViewedAt: new Date() } },
    { upsert: true, returnDocument: "before" },
  );
  return before === null;
}

/** Indexes this collection needs. Idempotent; the seed script calls it. */
export async function ensureCeremonyViewIndexes(): Promise<void> {
  const collection = await ceremonyViews();
  await collection.createIndex({ key: 1 }, { unique: true, name: "key_unique" });
}
