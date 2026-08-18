/**
 * Sets up the database: creates indexes and seeds the first login account.
 *
 *   npm run db:seed
 *
 * Safe to run as many times as you like. It never overwrites an existing
 * account, so re-running it after you have changed the password does not reset
 * it. Index creation is idempotent by definition.
 *
 * Run this once after cloning, and again whenever a new collection is added.
 */

import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

import { BORED_CATEGORIES } from "../src/config/bored";
import { CHORE_POOLS } from "../src/config/chore-rotation";
import { COLLECTIONS, DB_NAME } from "../src/config/db";
import { DEFAULT_PET_ROTATIONS } from "../src/config/pets";
import { compiledItems } from "../src/lib/bored/ideas";
import { findSharedNightProblem } from "../src/lib/pets/rotation";
import { findChorePoolProblem } from "../src/lib/stars/rotation";

/* -------------------------------------------------------------------------- */
/* The seed account                                                            */
/* -------------------------------------------------------------------------- */

/*
 * The starter login. Deliberately trivial because this is a private family app
 * behind a URL nobody else has — but see docs/authentication.md for how to
 * change it, which you should do before the app holds anything you would mind
 * a stranger reading.
 */
const SEED_USER = {
  email: "birchfam",
  password: "birchfam",
  displayName: "Birch Family",
};

/* -------------------------------------------------------------------------- */

const BCRYPT_COST = 12;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    fail(
      "MONGODB_URI is not set.\n" +
        "  This script reads .env via `node --env-file`. Check that .env exists\n" +
        "  and contains MONGODB_URI. See .env.example.",
    );
  }

  console.log(`Connecting to cluster…`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });

  try {
    await client.connect();
  } catch (error) {
    fail(explainConnectionFailure(error));
  }

  console.log(`Connected. Using database "${DB_NAME}".\n`);

  try {
    const db = client.db(DB_NAME);

    /* --- Indexes ------------------------------------------------------- */

    const users = db.collection(COLLECTIONS.users);
    const sessions = db.collection(COLLECTIONS.sessions);

    await users.createIndex({ email: 1 }, { unique: true, name: "email_unique" });
    console.log(`  ✓ ${COLLECTIONS.users}.email_unique      (unique)`);

    await sessions.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "session_ttl" },
    );
    console.log(`  ✓ ${COLLECTIONS.sessions}.session_ttl      (TTL, auto-deletes expired)`);

    await sessions.createIndex({ userId: 1 }, { name: "by_user" });
    console.log(`  ✓ ${COLLECTIONS.sessions}.by_user`);

    const petRotations = db.collection(COLLECTIONS.petRotations);
    await petRotations.createIndex(
      { petId: 1 },
      { unique: true, name: "pet_unique" },
    );
    console.log(`  ✓ ${COLLECTIONS.petRotations}.pet_unique   (unique)`);

    const choreRotations = db.collection(COLLECTIONS.choreRotations);
    await choreRotations.createIndex(
      { poolId: 1 },
      { unique: true, name: "pool_unique" },
    );
    console.log(`  ✓ ${COLLECTIONS.choreRotations}.pool_unique (unique)`);

    /*
     * The star charts are read a week at a time, and written one star at a
     * time by an upsert keyed on exactly this pair — so the unique index is
     * not only the query's index, it is what stops two simultaneous taps from
     * creating two documents for the same child and week.
     */
    const starWeeks = db.collection(COLLECTIONS.starWeeks);
    await starWeeks.createIndex(
      { childId: 1, weekStart: 1 },
      { unique: true, name: "child_week_unique" },
    );
    console.log(`  ✓ ${COLLECTIONS.starWeeks}.child_week_unique (unique)`);

    await starWeeks.createIndex({ weekStart: 1 }, { name: "by_week" });
    console.log(`  ✓ ${COLLECTIONS.starWeeks}.by_week`);

    /*
     * The Bored Page's ideas.
     *
     * `idea_unique` is on `(categoryId, ideaId)` rather than on `ideaId` alone,
     * which is also the index every read uses — a category's whole grid is a
     * prefix scan of it. The pair rather than the id because ids are only ever
     * *used* within a category (they key the drawings per category's list), and a
     * global unique index would be a promise this app does not need to keep.
     *
     * It is what makes the seed below idempotent, and what turns a replayed add —
     * a retry after a dropped connection — into a duplicate-key error the action
     * treats as success rather than into a second copy of the same idea.
     */
    const boredIdeas = db.collection(COLLECTIONS.boredIdeas);
    await boredIdeas.createIndex(
      { categoryId: 1, ideaId: 1 },
      { unique: true, name: "idea_unique" },
    );
    console.log(`  ✓ ${COLLECTIONS.boredIdeas}.idea_unique  (unique)`);

    /*
     * The shopping list.
     *
     * Two indexes, and between them they cover every query the feature makes:
     *
     *   `by_wanted` — the top half of the page, and the duplicate check every
     *   add runs. `completedAt` first because it is the equality term (`null`),
     *   `createdAt` after it because that is the sort — which is the order a
     *   compound index has to be declared in for MongoDB to use it for both.
     *
     *   `by_bought` — the accordion: the hundred most recently ticked off.
     *
     * The live stream's "has anything changed?" poll is deliberately not given
     * one. It is a count and a maximum over the whole (tiny) collection, and an
     * index on `updatedAt` would let MongoDB answer the maximum from the index
     * while still scanning for the count — a second index to maintain on every
     * write, in exchange for half of one cheap query. If this list ever grows to
     * a size where that is wrong, the fix is an index on `updatedAt` here.
     */
    const shoppingItems = db.collection(COLLECTIONS.shoppingItems);
    await shoppingItems.createIndex(
      { completedAt: 1, createdAt: -1 },
      { name: "by_wanted" },
    );
    console.log(`  ✓ ${COLLECTIONS.shoppingItems}.by_wanted`);

    await shoppingItems.createIndex({ completedAt: -1 }, { name: "by_bought" });
    console.log(`  ✓ ${COLLECTIONS.shoppingItems}.by_bought`);

    /*
     * The ChatGPT API's daily counters.
     *
     * Documents are addressed by `_id` — `credential:v-current:2026-08-05` —
     * so the primary key is the only index the reads and writes need. What
     * this adds is the TTL, which is what stops a limiter's bookkeeping from
     * becoming a collection that grows forever: every counter deletes itself
     * two days after the day it counted.
     *
     * `expireAfterSeconds: 0` means "expire at the instant in `expiresAt`",
     * which is set by `src/lib/family-api/usage.ts` when the document is created.
     */
    const familyApiUsage = db.collection(COLLECTIONS.familyApiUsage);
    await familyApiUsage.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "usage_ttl" },
    );
    console.log(
      `  ✓ ${COLLECTIONS.familyApiUsage}.usage_ttl     (TTL, auto-deletes counters)`,
    );

    /* --- Seed user ----------------------------------------------------- */

    const email = SEED_USER.email.trim().toLowerCase();
    const existing = await users.findOne({ email });

    if (existing) {
      console.log(`\n  • User "${email}" already exists — left untouched.`);
    } else {
      const now = new Date();
      await users.insertOne({
        _id: new ObjectId(),
        email,
        passwordHash: await bcrypt.hash(SEED_USER.password, BCRYPT_COST),
        displayName: SEED_USER.displayName,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`\n  ✓ Created user "${email}".`);
    }

    /* --- Pet rotation --------------------------------------------------- */

    /*
     * One row per animal, written only if it is missing. Once the family has
     * re-anchored Bella in the database, re-running the seed must not quietly
     * drag her back to the anchor compiled into `src/config/pets.ts`.
     *
     * The safety check is the same function the app uses, so "nobody gets both
     * animals on the same night" has one definition rather than two.
     */
    const unsafe = findSharedNightProblem(DEFAULT_PET_ROTATIONS);
    if (unsafe) {
      fail(`Refusing to seed an unsafe pet rotation.\n\n  ${unsafe}`);
    }

    console.log();
    for (const config of DEFAULT_PET_ROTATIONS) {
      const outcome = await petRotations.updateOne(
        { petId: config.petId },
        {
          $setOnInsert: {
            petId: config.petId,
            order: [...config.order],
            anchorDate: config.anchorDate,
            anchorChildId: config.anchorChildId,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );

      console.log(
        outcome.upsertedCount > 0
          ? `  ✓ Pet rotation for "${config.petId}" seeded ` +
              `(${config.anchorChildId} on ${config.anchorDate}).`
          : `  • Pet rotation for "${config.petId}" already exists — left untouched.`,
      );
    }

    /* --- Chore rotation -------------------------------------------------- */

    /*
     * One row per pool, written only if it is missing — same rule as the pets.
     * Once the family has re-anchored or reordered a pool in the database,
     * re-running the seed must not drag it back to what is compiled into
     * `src/config/chore-rotation.ts`.
     *
     * The validity check is the function the app itself uses, so "a usable
     * rotation" has one definition rather than two.
     */
    const badPools = findChorePoolProblem(CHORE_POOLS);
    if (badPools) {
      fail(`Refusing to seed an unusable chore rotation.\n\n  ${badPools}`);
    }

    console.log();
    for (const pool of CHORE_POOLS) {
      const outcome = await choreRotations.updateOne(
        { poolId: pool.id },
        {
          $setOnInsert: {
            poolId: pool.id,
            name: pool.name,
            children: [...pool.children],
            chores: [...pool.chores],
            anchorWeek: pool.anchorWeek,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );

      console.log(
        outcome.upsertedCount > 0
          ? `  ✓ Chore pool "${pool.id}" seeded ` +
              `(${pool.chores.length} chores, anchored on ${pool.anchorWeek}).`
          : `  • Chore pool "${pool.id}" already exists — left untouched.`,
      );
    }

    /*
     * Pools that no longer exist. The app ignores a document whose `poolId` is
     * not a pool any more — it simply logs and falls back — but an ignored
     * document is a trap: it reads like the live rotation and is not one. The
     * monthly `bigs`/`littles` pair became the weekly `elder-pair` and
     * `younger-pair` on 10 August 2026, and their old rows are what this
     * clears. Nothing a child earned lives here; the stars are in `starWeeks`.
     */
    const known = CHORE_POOLS.map((pool) => pool.id);
    const orphans = await choreRotations
      .find({ poolId: { $nin: known } })
      .toArray();
    for (const orphan of orphans) {
      await choreRotations.deleteOne({ _id: orphan._id });
      console.log(
        `  ✓ Removed the retired chore pool "${String(orphan.poolId)}", ` +
          `which is no longer in src/config/chore-rotation.ts.`,
      );
    }

    /* --- The Bored Page's built-in ideas --------------------------------- */

    /*
     * The forty-three ideas compiled into `src/config/bored.ts`, written only if
     * they are missing — the pets' and chore pools' rule, and it matters in one
     * specific way here worth stating out loud:
     *
     *   **Changing a price in the config does not change it in the database.**
     *
     * `$setOnInsert` is what makes re-running this safe after the family has
     * added their own ideas, and it is also what makes a re-price a no-op. That
     * is the right trade — a seed that overwrote labels and prices would undo
     * anything ever edited in Atlas — but it is a trap if you expected otherwise.
     * `docs/bored.md` says how to re-price a job properly.
     *
     * Family-added ideas are never touched: they carry `custom: true` and there
     * is nothing in the config to match them against. And nothing is *deleted*
     * for having left the config — unlike the chore pools, a retired idea's row
     * is harmless, because an id with no drawing simply falls back to its emoji
     * and a built-in has none to fall back to. Take a retired one out by hand if
     * it is still on a grid.
     */
    console.log();
    let seededIdeas = 0;
    const compiled = compiledItems();
    for (const category of BORED_CATEGORIES) {
      for (const item of compiled[category.id]) {
        const outcome = await boredIdeas.updateOne(
          { categoryId: category.id, ideaId: item.id },
          {
            $setOnInsert: {
              categoryId: category.id,
              ideaId: item.id,
              label: item.label,
              price: item.price,
              emoji: null,
              custom: false,
              addedBy: "",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        );
        if (outcome.upsertedCount > 0) seededIdeas += 1;
      }
    }

    const customIdeas = await boredIdeas.countDocuments({ custom: true });
    console.log(
      seededIdeas > 0
        ? `  ✓ Seeded ${seededIdeas} built-in bored idea(s).`
        : `  • All built-in bored ideas already exist — left untouched.`,
    );
    if (customIdeas > 0) {
      console.log(
        `  • Left ${customIdeas} idea(s) the family added in the app alone.`,
      );
    }

    /* --- Summary ------------------------------------------------------- */

    const collections = await db.listCollections().toArray();
    console.log(
      `\nDatabase "${DB_NAME}" now has: ` +
        collections.map((c) => c.name).sort().join(", "),
    );
    console.log(`Users: ${await users.countDocuments()}`);
    console.log(`\nDone. Sign in at /login with ${SEED_USER.email} / ${SEED_USER.password}`);
  } finally {
    await client.close();
  }
}

/** Atlas's connection failures are famously opaque. Translate them. */
function explainConnectionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("tlsv1 alert internal error") ||
    message.includes("SSL alert number 80")
  ) {
    return (
      "MongoDB refused the TLS handshake.\n\n" +
      "  This is almost always an Atlas Network Access problem, not a code or\n" +
      "  credentials problem: Atlas rejects non-allowlisted IPs during the TLS\n" +
      "  handshake, before it ever looks at your username and password.\n\n" +
      "  Fix: https://cloud.mongodb.com → your project → Network Access →\n" +
      "  'Add IP Address' → 'Add Current IP Address'.\n\n" +
      "  For the deployed app on Vercel you will need 0.0.0.0/0, because\n" +
      "  Vercel's outbound IPs are not fixed. See docs/database.md.\n\n" +
      `  Original error: ${message}`
    );
  }

  if (message.includes("Authentication failed")) {
    return (
      "MongoDB rejected the credentials in MONGODB_URI.\n" +
      "  Check the username and password in .env.\n\n" +
      `  Original error: ${message}`
    );
  }

  if (message.includes("Server selection timed out")) {
    return (
      "Could not reach the cluster within 15s.\n" +
      "  Check the cluster is not paused in Atlas, and that outbound port\n" +
      "  27017 is not blocked by a firewall or VPN.\n\n" +
      `  Original error: ${message}`
    );
  }

  return `Could not connect to MongoDB.\n\n  ${message}`;
}

function fail(message: string): never {
  console.error(`\nSeeding failed.\n\n  ${message}\n`);
  process.exit(1);
}

main().catch((error) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
