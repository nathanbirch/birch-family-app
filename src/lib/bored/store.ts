import "server-only";

import { cache } from "react";
import { ObjectId, type Collection } from "mongodb";

import {
  BORED_CATEGORIES,
  findBoredCategory,
  isBoredEmoji,
  type BoredCategoryId,
} from "@/config/bored";
import { COLLECTIONS } from "@/config/db";
import { reportDegraded } from "@/lib/data-health";
import { getCollection } from "@/lib/db";

import {
  compiledItems,
  emptyByCategory,
  isCustomIdeaId,
  sortCategoryItems,
  type BoredItem,
} from "./ideas";

/**
 * The `boredIdeas` collection — one document per idea on the Bored Page.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS COLLECTION EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * For most of this page's life there was nothing to store. The ideas were
 * compiled in, nothing was ticked or remembered, and `config/bored.ts` said so
 * at length. Letting the family *add* an idea from inside the app ended that: a
 * thing somebody types on a phone has to outlive the phone, appear on every
 * other one, and survive a deploy.
 *
 * ---------------------------------------------------------------------------
 * READS ARE FORGIVING, AND FALL BACK TO THE COMPILED LIST
 * ---------------------------------------------------------------------------
 * Exactly the pets' bargain, and for a sharper reason here: this is the page a
 * child opens when they are *already* fed up, so an error message is the worst
 * possible answer. An unreachable cluster — or a category with no *built-in* rows
 * in it yet — gives the thirty-nine ideas compiled into `config/bored.ts`, which
 * is also what makes the deploy order not matter. The page is complete before the
 * seed has ever run, and the family can add to it before the seed has ever run.
 *
 * The consequence worth knowing: deleting the built-in rows by hand in Atlas does
 * not empty a category, it resets it. Same as the pet rotation, and for the same
 * reason — there is no way to tell "deliberately empty" from "not seeded yet"
 * without storing a third thing to say which it is. Family-added rows are
 * unaffected either way; see the note where the two are separated below.
 */

type BoredIdeaDocument = {
  _id: ObjectId;
  categoryId: string;
  /** The stable id. Unique with `categoryId`, and the key into the drawings. */
  ideaId: string;
  label: string;
  /** Money only. Absent or null elsewhere. */
  price: number | null;
  /** `null` for a built-in, which is drawn instead. */
  emoji: string | null;
  /** Added from inside the app. Only these can be removed from inside it. */
  custom: boolean;
  /** Display name of whoever added it. Empty for the seeded built-ins. */
  addedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

async function boredIdeas(): Promise<Collection<BoredIdeaDocument>> {
  return getCollection<BoredIdeaDocument>(COLLECTIONS.boredIdeas);
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every category's ideas, keyed by category id.
 *
 * The whole collection in one query rather than one query per category. It is
 * fifty-odd small documents, so filtering server-side would buy nothing and cost
 * the ability to answer "is this category empty, or is it unseeded?" for all
 * three at once.
 *
 * `cache()` memoises it per render pass, which is what makes the Server Action's
 * two checks — the category's size and whether the label clashes — a single round
 * trip rather than two.
 */
export const readAllBoredItems = cache(
  async (): Promise<Record<BoredCategoryId, BoredItem[]>> => {
    const fallback = compiledItems();

    let documents: BoredIdeaDocument[];
    try {
      const collection = await boredIdeas();
      documents = await collection.find({}).sort({ createdAt: 1 }).toArray();
    } catch (error) {
      // A fed-up child gets the list, not an explanation. Recorded as well as
      // logged so an API can tell a fallback from a real answer — see
      // `lib/data-health.ts`.
      reportDegraded("bored");
      console.warn(
        `[bored] Could not read the ideas: ${describe(error)}. ` +
          `Showing the built-in list.`,
      );
      return fallback;
    }

    const found = emptyByCategory();
    for (const document of documents) {
      const item = toItem(document);
      if (!item) continue;
      found[document.categoryId as BoredCategoryId]?.push(item);
    }

    const result = emptyByCategory();
    for (const category of BORED_CATEGORIES) {
      /*
       * The fallback is decided on the *built-ins* alone, not on whether the
       * category has any rows at all.
       *
       * That distinction is load-bearing and was a bug before it was a rule.
       * Deciding it on the row count meant that adding one idea to a category the
       * seed had never run against left exactly one tile on the page: the
       * category was no longer empty, so the twelve compiled ideas stopped being
       * offered. Splitting the two means a family-added idea always shows, and the
       * built-in list is only ever *replaced* by built-in rows.
       *
       * Per category rather than for the collection as a whole, so adding a
       * fourth category later needs no migration to become visible.
       */
      const stored = found[category.id];
      const builtIn = stored.filter((item) => !item.custom);
      const custom = stored.filter((item) => item.custom);
      result[category.id] = sortCategoryItems(category.id, [
        ...(builtIn.length > 0 ? builtIn : fallback[category.id]),
        ...custom,
      ]);
    }
    return result;
  },
);

/** One category's ideas, in the order the grid draws them. */
export async function readBoredItems(
  categoryId: BoredCategoryId,
): Promise<BoredItem[]> {
  return (await readAllBoredItems())[categoryId];
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/** Whether the insert added a row, or found that id already used. */
export type InsertOutcome = "added" | "already-there";

export async function insertBoredIdea(idea: {
  categoryId: BoredCategoryId;
  ideaId: string;
  label: string;
  price: number | null;
  emoji: string;
  addedBy: string;
}): Promise<InsertOutcome> {
  const collection = await boredIdeas();
  const now = new Date();

  try {
    await collection.insertOne({
      _id: new ObjectId(),
      categoryId: idea.categoryId,
      ideaId: idea.ideaId,
      label: idea.label,
      price: idea.price,
      emoji: idea.emoji,
      custom: true,
      addedBy: idea.addedBy,
      createdAt: now,
      updatedAt: now,
    });
    return "added";
  } catch (error) {
    // The unique index caught a replay of this exact add — a retry after a
    // dropped connection, which has already succeeded. Not a failure.
    if (isDuplicateKey(error)) return "already-there";
    throw error;
  }
}

/**
 * Take a family-added idea off the page.
 *
 * `custom: true` is in the filter rather than checked beforehand, which makes it
 * part of the same atomic operation: there is no instant at which this could
 * delete a built-in, and no second query to forget. A built-in is removed by
 * editing `config/bored.ts` and reseeding, which is the right amount of friction
 * for something five children can reach.
 */
export async function deleteBoredIdea(
  categoryId: BoredCategoryId,
  ideaId: string,
): Promise<boolean> {
  const collection = await boredIdeas();
  const outcome = await collection.deleteOne({
    categoryId,
    ideaId,
    custom: true,
  });
  return outcome.deletedCount > 0;
}

/** Is this label already on that category's grid? Case- and space-insensitive. */
export async function findBoredLabelClash(
  categoryId: BoredCategoryId,
  label: string,
): Promise<BoredItem | null> {
  const items = await readBoredItems(categoryId);
  const wanted = comparable(label);
  return items.find((item) => comparable(item.label) === wanted) ?? null;
}

/* -------------------------------------------------------------------------- */

/**
 * A document into an item, or `null` if it is not one.
 *
 * Every field is checked, because this is the boundary between the database and
 * a page whose entire premise is that the picture is readable. A row hand-edited
 * in Atlas should cost one tile rather than the grid — and an emoji that is not
 * one the picker offers is dropped rather than rendered, so a hand-edited row
 * cannot put arbitrary text where a picture goes.
 */
function toItem(document: BoredIdeaDocument): BoredItem | null {
  if (!findBoredCategory(String(document.categoryId))) return null;
  if (typeof document.ideaId !== "string" || document.ideaId === "") return null;
  if (typeof document.label !== "string" || document.label.trim() === "") {
    return null;
  }

  const custom = document.custom === true;
  /*
   * A custom idea must have a picture, and a built-in must not need one: the
   * tile prefers a drawing and falls back to the emoji, so a custom row whose
   * emoji failed this check would render as an empty square.
   */
  const emoji =
    typeof document.emoji === "string" && isBoredEmoji(document.emoji)
      ? document.emoji
      : null;
  if (custom && !emoji) return null;
  if (custom && !isCustomIdeaId(document.ideaId)) return null;

  return {
    id: document.ideaId,
    label: document.label,
    price:
      typeof document.price === "number" && Number.isFinite(document.price)
        ? document.price
        : null,
    emoji,
    custom,
  };
}

function comparable(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLocaleLowerCase();
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
