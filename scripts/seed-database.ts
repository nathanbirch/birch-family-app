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

import { COLLECTIONS, DB_NAME } from "../src/config/db";
import { DEFAULT_PET_ROTATIONS } from "../src/config/pets";
import { findSharedNightProblem } from "../src/lib/pets/rotation";

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
