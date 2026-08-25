/**
 * Seeds the reward catalogue and opens the first Ultimate-tier pool.
 *
 *   npm run db:seed-rewards
 *
 * Safe to run more than once: each item is upserted on `(tier, name)`, so a
 * second run corrects a description or a cost typo rather than adding a
 * duplicate row, and it never touches an item's `position` once one exists —
 * reordering from `/shop/admin` must survive a re-seed. The Ultimate pool is
 * only ever created if none exists yet; re-running this must never reset a
 * family's progress toward the goal.
 *
 * Run this once after `npm run db:seed`, and again if the catalogue below
 * changes and you want the database to catch up without hand-editing it.
 */

import { MongoClient, ObjectId } from "mongodb";

import { COLLECTIONS, DB_NAME } from "../src/config/db";

type SeedItem = {
  tier: "quick" | "special" | "epic" | "ultimate";
  name: string;
  description: string;
  cost: number;
  redemptionLimit: { count: number; periodDays: number } | null;
  requiresApproval: boolean;
  isFamilyOuting: boolean;
};

/**
 * The agreed catalogue. Order here is the *seed* order, used only the first
 * time an item is created — `position` afterwards belongs to
 * `/shop/admin`'s reorder buttons, not to this file.
 */
const ITEMS: readonly SeedItem[] = [
  // --- Quick (10-30) ------------------------------------------------------
  q("No-Veggie Pass", "Skip vegetables at one meal.", 10, weekly(1)),
  q("Double Dessert", "Two desserts tonight.", 15, weekly(1)),
  q("Reverse Bedtime Story", "You read a story to a parent instead.", 15, weekly(1)),
  q("Bedtime Immunity", "Bedtime pushed back 30 minutes.", 15, weekly(2)),
  q("Remote Control", "You pick what's on this evening.", 15, weekly(1)),
  q("Pajama Day", "Pajamas all Saturday.", 20, monthly(1)),
  q("Mystery Reward", "A surprise, picked by a parent.", 20, null),
  q("Front Seat VIP", "Front seat, next car ride.", 20, weekly(1)),
  q("Chore Shield", "Skip one chore.", 25, weekly(1)),
  q("Late-Night Snack Run", "A snack after bedtime.", 30, weekly(1)),

  // --- Special (50-100) ---------------------------------------------------
  s("Royal Treatment", '"Your Majesty" for an hour.', 50, weekly(1), false),
  s("Family Dance Party", "You DJ the whole thing.", 50, weekly(1), false),
  s("Dinner Takeover", "Pick dinner, dessert and the music.", 60, weekly(1), false),
  s("Errand Buddy — Dad", "One-on-one errands with Dad.", 70, everyDays(14), true),
  s("Errand Buddy — Mom", "One-on-one errands with Mom.", 70, everyDays(14), true),
  s(
    "Kitchen Takeover",
    "Bake something with a parent.",
    70,
    everyDays(14),
    true,
  ),
  s(
    "Living Room Sleepover",
    "All five kids camp out in the living room.",
    80,
    monthly(1),
    false,
  ),
  s("Family Yes Hour", "One hour where the answer is yes.", 90, everyDays(14), false),
  s(
    "Dad Does Your Chore",
    "Dad covers your chore for a full week (bedroom cleanup excluded).",
    100,
    monthly(1),
    false,
  ),

  // --- Epic (120-300) — all require approval ------------------------------
  e("Bowling", "An outing to go bowling.", 240, true),
  e("Trampoline Park", "An outing to the trampoline park.", 300, true),
  e("Ice Skating", "An outing to go ice skating.", 300, true),
  e("Fat Cats", "An outing to Fat Cats.", 300, true),
  e("Mom or Dad Date", "A one-on-one date with Mom or Dad.", 180, false),

  // --- Ultimate — pooled -------------------------------------------------
  {
    tier: "ultimate",
    name: "Family Overnight Adventure",
    description: "Everybody chips in. One big trip, together.",
    cost: 1000,
    redemptionLimit: null,
    requiresApproval: true,
    isFamilyOuting: true,
  },
];

function weekly(count: number) {
  return { count, periodDays: 7 };
}
function monthly(count: number) {
  return { count, periodDays: 30 };
}
function everyDays(periodDays: number) {
  return { count: 1, periodDays };
}
function q(
  name: string,
  description: string,
  cost: number,
  redemptionLimit: { count: number; periodDays: number } | null,
): SeedItem {
  return {
    tier: "quick",
    name,
    description,
    cost,
    redemptionLimit,
    requiresApproval: false,
    isFamilyOuting: false,
  };
}
function s(
  name: string,
  description: string,
  cost: number,
  redemptionLimit: { count: number; periodDays: number } | null,
  requiresApproval: boolean,
): SeedItem {
  return {
    tier: "special",
    name,
    description,
    cost,
    redemptionLimit,
    requiresApproval,
    isFamilyOuting: false,
  };
}
function e(
  name: string,
  description: string,
  cost: number,
  isFamilyOuting: boolean,
): SeedItem {
  return {
    tier: "epic",
    name,
    description,
    cost,
    redemptionLimit: null,
    requiresApproval: true,
    isFamilyOuting,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    fail(
      "MONGODB_URI is not set.\n" +
        "  This script reads .env via `node --env-file`. Check that .env exists\n" +
        "  and contains MONGODB_URI. See .env.example.",
    );
  }

  console.log("Connecting to cluster…");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  console.log(`Connected. Using database "${DB_NAME}".\n`);

  try {
    const db = client.db(DB_NAME);
    const rewardItems = db.collection(COLLECTIONS.rewardItems);
    const rewardPools = db.collection(COLLECTIONS.rewardPools);

    await rewardItems.createIndex(
      { tier: 1, position: 1 },
      { name: "tier_position" },
    );

    let created = 0;
    let updated = 0;

    for (const item of ITEMS) {
      const existing = await rewardItems.findOne({
        tier: item.tier,
        name: item.name,
      });

      if (existing) {
        await rewardItems.updateOne(
          { _id: existing._id },
          {
            $set: {
              description: item.description,
              cost: item.cost,
              redemptionLimit: item.redemptionLimit,
              requiresApproval: item.requiresApproval,
              isFamilyOuting: item.isFamilyOuting,
              updatedAt: new Date(),
            },
          },
        );
        updated += 1;
        continue;
      }

      // Position starts after whatever is already in the tier, so re-running
      // this after somebody has reordered things in the admin screen appends
      // rather than colliding.
      const alreadyInTier = await rewardItems.countDocuments({ tier: item.tier });
      const now = new Date();
      const inserted = await rewardItems.insertOne({
        _id: new ObjectId(),
        tier: item.tier,
        name: item.name,
        description: item.description,
        cost: item.cost,
        position: alreadyInTier,
        redemptionLimit: item.redemptionLimit,
        requiresApproval: item.requiresApproval,
        isFamilyOuting: item.isFamilyOuting,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;

      if (item.tier === "ultimate") {
        const activePool = await rewardPools.findOne({
          rewardId: inserted.insertedId,
          status: "active",
        });
        if (!activePool) {
          await rewardPools.insertOne({
            _id: new ObjectId(),
            rewardId: inserted.insertedId,
            status: "active",
            target: item.cost,
            contributions: [],
            createdAt: now,
          });
          console.log(`  ✓ Opened the first pool for "${item.name}".`);
        }
      }
    }

    console.log(`\nCatalogue: ${created} created, ${updated} already there (refreshed).`);
    console.log(`Total items: ${await rewardItems.countDocuments()}`);
  } finally {
    await client.close();
  }
}

function fail(message: string): never {
  console.error(`\nSeeding failed.\n\n  ${message}\n`);
  process.exit(1);
}

main().catch((error) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
