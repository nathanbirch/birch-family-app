import "server-only";

import { ObjectId, type Collection } from "mongodb";

import { COLLECTIONS } from "@/config/db";
import { COMPLETED_HISTORY_LIMIT } from "@/config/shopping";
import { reportDegraded } from "@/lib/data-health";
import { getCollection } from "@/lib/db";

import {
  EMPTY_LIST,
  revisionToken,
  toList,
  type ShoppingItem,
  type ShoppingList,
} from "./list";

/**
 * The `shoppingItems` collection — one document per line on the list.
 *
 * ---------------------------------------------------------------------------
 * A DOCUMENT PER ITEM, WHICH IS NOT WHAT THE STARS DO
 * ---------------------------------------------------------------------------
 * `starWeeks` keeps a document per child per week because the paper chart is a
 * week and a star is never edited on its own. A shopping list is the opposite:
 * the unit somebody adds, ticks and deletes *is* the item, two people are
 * editing different items at the same moment, and there is no natural bucket
 * that closes. So the item is the document, and the two writes that can race —
 * ticking the same thing twice, adding the same thing twice — are settled by
 * addressing rows by `_id` rather than by locking anything.
 *
 * ---------------------------------------------------------------------------
 * READS ARE FORGIVING, WRITES ARE NOT
 * ---------------------------------------------------------------------------
 * The same rule the pets and the chore pools follow. An unreachable cluster
 * gives an empty list and a console warning rather than an error page, because a
 * blank shopping list is a recoverable disappointment and a broken page is not.
 * Writes have no equivalent — there is nothing sensible to fall back to when a
 * write fails — so they report the failure and the UI says so.
 */

type ShoppingItemDocument = {
  _id: ObjectId;
  name: string;
  /** Display name of whoever added it, copied in rather than joined. */
  addedBy: string;
  createdAt: Date;
  /** `null` while it is still wanted. */
  completedAt: Date | null;
  completedBy: string | null;
  /**
   * Bumped by every write, and the reason the live stream is cheap: the whole
   * "has anything changed?" question is a count and the maximum of this field.
   */
  updatedAt: Date;
};

async function shoppingItems(): Promise<Collection<ShoppingItemDocument>> {
  return getCollection<ShoppingItemDocument>(COLLECTIONS.shoppingItems);
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The whole list: what is still wanted, and the last hundred things bought.
 *
 * One aggregation rather than three queries. `$facet` runs the two halves and
 * the revision count over a single pass of the collection, which matters because
 * this is on the critical path of the page *and* is re-read by every live
 * connection each time anything changes.
 */
export async function readShoppingList(): Promise<ShoppingList> {
  try {
    const collection = await shoppingItems();
    const [result] = await collection
      .aggregate<{
        active: ShoppingItemDocument[];
        completed: ShoppingItemDocument[];
        stats: { count: number; newest: Date | null }[];
      }>([
        {
          $facet: {
            active: [
              { $match: { completedAt: null } },
              { $sort: { createdAt: -1 } },
            ],
            completed: [
              { $match: { completedAt: { $ne: null } } },
              { $sort: { completedAt: -1 } },
              { $limit: COMPLETED_HISTORY_LIMIT },
            ],
            stats: [
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  newest: { $max: "$updatedAt" },
                },
              },
            ],
          },
        },
      ])
      .toArray();

    if (!result) return EMPTY_LIST;

    const stats = result.stats[0] ?? { count: 0, newest: null };
    return toList(
      [...result.active, ...result.completed].flatMap((document) => {
        const item = toItem(document);
        return item ? [item] : [];
      }),
      revisionToken(stats.count, stats.newest?.getTime() ?? 0),
    );
  } catch (error) {
    /*
     * Recorded as well as logged. An empty list and a list nobody has added to
     * are the same object, and the family-context API must be able to tell
     * "nothing is needed" from "we could not ask" — see `lib/data-health.ts`.
     */
    reportDegraded("shopping");
    console.warn(
      `[shopping] Could not read the list: ${describe(error)}. ` +
        `Showing an empty one.`,
    );
    return EMPTY_LIST;
  }
}

/**
 * Just the token that says whether anything has changed.
 *
 * This is the query the live stream runs on a loop, so it is deliberately the
 * smallest question that still has a complete answer: a count and a maximum,
 * with no documents crossing the wire. See `revisionToken()` for why those two
 * numbers together catch deletions as well as additions.
 *
 * `null` means "could not ask", which the stream treats as "say nothing" rather
 * than as "the list is empty" — the difference between a wobbly connection and
 * every phone in the house blanking its list.
 */
export async function readShoppingRevision(): Promise<string | null> {
  try {
    const collection = await shoppingItems();
    const [stats] = await collection
      .aggregate<{ count: number; newest: Date | null }>([
        { $group: { _id: null, count: { $sum: 1 }, newest: { $max: "$updatedAt" } } },
      ])
      .toArray();

    return revisionToken(stats?.count ?? 0, stats?.newest?.getTime() ?? 0);
  } catch (error) {
    console.warn(`[shopping] Could not check for changes: ${describe(error)}.`);
    return null;
  }
}

/**
 * Everything still wanted, for the checks the Server Actions make before a
 * write: is this already on the list, and is the list already absurdly long.
 *
 * Names have to come back to the server to be compared, because the comparison
 * is case- and accent-insensitive and lives in `findDuplicate()` — one
 * definition, in the pure module, rather than a second one written as a MongoDB
 * collation nobody would think to keep in step.
 */
export async function readActiveItems(): Promise<ShoppingItem[]> {
  const collection = await shoppingItems();
  const documents = await collection
    .find({ completedAt: null })
    .sort({ createdAt: -1 })
    .toArray();

  return documents.flatMap((document) => {
    const item = toItem(document);
    return item ? [item] : [];
  });
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/** Whether the insert added a row, or found the id already used. */
export type InsertOutcome = "added" | "already-there";

/**
 * Put something on the list, under an id the browser chose.
 *
 * A colliding `_id` is not an error worth surfacing: it means this exact add has
 * already happened, which is what a retry after a dropped connection looks like.
 * See the note on `newItemId()`.
 */
export async function insertShoppingItem(item: {
  id: string;
  name: string;
  addedBy: string;
}): Promise<InsertOutcome> {
  const collection = await shoppingItems();
  const now = new Date();

  try {
    await collection.insertOne({
      _id: new ObjectId(item.id),
      name: item.name,
      addedBy: item.addedBy,
      createdAt: now,
      completedAt: null,
      completedBy: null,
      updatedAt: now,
    });
    return "added";
  } catch (error) {
    if (isDuplicateKey(error)) return "already-there";
    throw error;
  }
}

/**
 * Tick something off, or put it back.
 *
 * Idempotent by construction — it sets a state rather than flipping one — so two
 * people tapping the same row at the same moment land on the same answer instead
 * of undoing each other. `completedBy` is overwritten each time, which is
 * correct: the question the accordion answers is who got it, and the last person
 * to tick it is who got it.
 *
 * Returns `false` when there is no such row, which is how a tick on an item
 * somebody else has just deleted is told apart from a tick that worked.
 */
export async function setShoppingItemDone(
  id: string,
  done: boolean,
  by: string,
): Promise<boolean> {
  const collection = await shoppingItems();
  const outcome = await collection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        completedAt: done ? new Date() : null,
        completedBy: done ? by : null,
        updatedAt: new Date(),
      },
    },
  );
  return outcome.matchedCount > 0;
}

/**
 * Take a row off the list for good.
 *
 * Deleting rather than flagging. This is the "that was a typo" button and the
 * "we don't need that after all" button; a tombstone would keep both of those
 * mistakes on the page forever, and there is nothing in a shopping list worth
 * auditing. Ticking something off is the other verb, and that one *is* kept.
 */
export async function deleteShoppingItem(id: string): Promise<boolean> {
  const collection = await shoppingItems();
  const outcome = await collection.deleteOne({ _id: new ObjectId(id) });
  return outcome.deletedCount > 0;
}

/* -------------------------------------------------------------------------- */

/**
 * A document into an item, or `null` if it is not one.
 *
 * Every field is checked because this is the boundary between the database and
 * the page: a row hand-edited in Atlas, or left behind by an older shape of this
 * feature, should cost one line rather than the whole list.
 */
function toItem(document: ShoppingItemDocument): ShoppingItem | null {
  if (typeof document.name !== "string" || document.name.trim() === "") {
    return null;
  }
  if (!(document.createdAt instanceof Date)) return null;

  const completedAt =
    document.completedAt instanceof Date ? document.completedAt.getTime() : null;

  return {
    id: document._id.toHexString(),
    name: document.name,
    addedBy: typeof document.addedBy === "string" ? document.addedBy : "",
    createdAt: document.createdAt.getTime(),
    completedAt,
    completedBy:
      completedAt !== null && typeof document.completedBy === "string"
        ? document.completedBy
        : null,
  };
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
