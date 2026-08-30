/**
 * Zeroes out every child's coin balance, right now.
 *
 *   npm run coins:reset
 *
 * A balance is never stored (see `lib/coins/store.ts`) — it is the sum of
 * `coinTransactions` — so "reset to zero" is not a delete. Deleting a child's
 * rows would also erase which weeks they have already converted, and the
 * unique index on `(childId, weekStart)` would then let a ceremony already
 * read out be converted a second time. Instead this posts one `adjustment`
 * transaction per child for the negative of their current balance, the same
 * way a parent's manual correction on `/shop/admin` works — the ledger stays
 * a true history of everything that ever happened, and now includes "this
 * balance was reset to zero on this date".
 *
 * Safe to run more than once: a child already at zero is left untouched.
 */

import { MongoClient } from "mongodb";

import { CHILD_IDS } from "../src/config/family";
import { COLLECTIONS, DB_NAME } from "../src/config/db";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    fail(
      "MONGODB_URI is not set.\n" +
        "  This script reads .env via `--env-file`. Check that .env exists\n" +
        "  and contains MONGODB_URI.",
    );
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();

  try {
    const db = client.db(DB_NAME);
    const coinTransactions = db.collection(COLLECTIONS.coinTransactions);

    const rows = await coinTransactions
      .aggregate<{ _id: string; total: number }>([
        { $group: { _id: "$childId", total: { $sum: "$amount" } } },
      ])
      .toArray();
    const balances = new Map(rows.map((row) => [row._id, row.total]));

    console.log(`Resetting ${CHILD_IDS.length} children's coin balances to zero…\n`);

    for (const childId of CHILD_IDS) {
      const balance = balances.get(childId) ?? 0;
      if (balance === 0) {
        console.log(`  • ${childId}: already 0 — left untouched.`);
        continue;
      }

      await coinTransactions.insertOne({
        childId,
        type: "adjustment",
        amount: -balance,
        note: "Manual reset to zero",
        createdAt: new Date(),
        createdBy: "Birch Family",
      });
      console.log(`  ✓ ${childId}: ${balance} → 0`);
    }

    console.log("\nDone.");
  } finally {
    await client.close();
  }
}

function fail(message: string): never {
  console.error(`\nFailed.\n\n  ${message}\n`);
  process.exit(1);
}

main().catch((error) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
