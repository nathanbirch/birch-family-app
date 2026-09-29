/**
 * Makes, lists or revokes keys for the Meals price API.
 *
 *   npm run meals:api-key -- --label "scheduled price check"   # make one
 *   npm run meals:api-key -- --list                            # see them
 *   npm run meals:api-key -- --revoke-all                      # revoke every key
 *
 * A new key is printed **once**. Only its SHA-256 is stored, in the
 * `mealApiKeys` collection, so it cannot be shown again — lose it and make
 * another. Reads `.env` for `MONGODB_URI`, so it writes to whichever database
 * that points at; for production, that is the production cluster.
 *
 * See docs/meals.md#the-price-api.
 */

import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

import { COLLECTIONS, DB_NAME } from "../src/config/db";
import { API_KEY_LENGTH, hashApiKey } from "../src/lib/meals/price-api-shape";

type KeyDoc = { _id: string; label: string; createdAt: Date; lastUsedAt: Date | null };

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. See .env.example.");

  const args = process.argv.slice(2);
  const labelIndex = args.indexOf("--label");
  const label = labelIndex >= 0 ? (args[labelIndex + 1] ?? "").trim() : "price check";

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  try {
    const keys = client.db(DB_NAME).collection<KeyDoc>(COLLECTIONS.mealApiKeys);

    if (args.includes("--list")) {
      const all = await keys.find({}).sort({ createdAt: 1 }).toArray();
      if (all.length === 0) console.log("No Meals API keys.");
      for (const key of all) {
        console.log(
          `${key._id.slice(0, 12)}…  "${key.label}"  made ${key.createdAt.toISOString()}  ` +
            `last used ${key.lastUsedAt ? key.lastUsedAt.toISOString() : "never"}`,
        );
      }
      return;
    }

    if (args.includes("--revoke-all")) {
      const { deletedCount } = await keys.deleteMany({});
      console.log(`Revoked ${deletedCount} key(s). The API now accepts nothing.`);
      return;
    }

    const key = randomBytes(32).toString("base64url");
    if (key.length !== API_KEY_LENGTH) throw new Error("Unexpected key length.");
    await keys.insertOne({
      _id: hashApiKey(key),
      label: label || "price check",
      createdAt: new Date(),
      lastUsedAt: null,
    });

    console.log(`\nNew Meals API key ("${label}"). It is shown this once — store it somewhere safe:\n`);
    console.log(`  ${key}\n`);
    console.log("Send it as:  Authorization: Bearer <key>");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
