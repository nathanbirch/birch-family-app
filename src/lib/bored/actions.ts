"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  BORED_CATEGORIES,
  IDEA_LABEL_MAX_LENGTH,
  IDEA_PRICE_MAX,
  IDEA_PRICE_MIN,
  isBoredEmoji,
  type BoredCategoryId,
} from "@/config/bored";
import { requireUser } from "@/lib/auth/dal";

import type { BoredActionResult } from "./action-result";
import { isCustomIdeaId, normaliseLabel, normalisePrice } from "./ideas";
import {
  deleteBoredIdea,
  findBoredLabelClash,
  insertBoredIdea,
  readBoredItems,
} from "./store";

/**
 * Adding and removing an idea.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE MAY ONLY EXPORT ASYNC FUNCTIONS
 * ---------------------------------------------------------------------------
 * `"use server"` turns every export into a POST endpoint reachable by anyone who
 * can reach the site, whether or not they went through the page. So every check
 * is *inside* the action: the session first, then the parser, then the rules. The
 * result type lives in `action-result.ts` because exporting it from here would
 * make Next.js reject the whole module.
 *
 * ---------------------------------------------------------------------------
 * THE EMOJI IS CHECKED AGAINST THE PICKER, NOT AGAINST UNICODE
 * ---------------------------------------------------------------------------
 * "Is this string an emoji?" is a genuinely hard question — grapheme clusters,
 * joiners, variation selectors, and a different answer on every platform — and it
 * is not one worth answering here. `BORED_EMOJI` is a fixed list of what the
 * picker offers, so the check is membership. Anything else is refused, which is
 * what stops this endpoint from being a way to put arbitrary text where the page
 * promises a picture.
 *
 * ---------------------------------------------------------------------------
 * HOW MANY IDEAS ONE CATEGORY MAY HOLD
 * ---------------------------------------------------------------------------
 * `CATEGORY_LIMIT` is not about storage. It is about a child with a thumb on the
 * Add button, and about the grid staying a thing you take in at a glance: past
 * about forty tiles the page has stopped being an answer to "I'm bored" and
 * become a list to read, which is the one thing this page must never be.
 */

const CATEGORY_LIMIT = 40;

const CategorySchema = z.enum(
  BORED_CATEGORIES.map((category) => category.id) as [string, ...string[]],
);

const AddSchema = z.object({
  categoryId: CategorySchema,
  /**
   * Chosen by the browser, so the tile drawn before the write lands has the same
   * identity as the row that comes back — and so a retry after a dropped
   * connection collides with its own first attempt on the unique index instead of
   * adding the idea twice. Same trick, and the same reasoning, as the shopping
   * list's item ids.
   */
  ideaId: z.string().refine(isCustomIdeaId, "That is not an idea id."),
  // Generous, because the label is *trimmed* rather than refused for being long.
  // This ceiling only keeps a paste of a whole document out of the parser.
  label: z.string().min(1).max(IDEA_LABEL_MAX_LENGTH * 8),
  emoji: z.string().refine(isBoredEmoji, "That is not one of the pictures."),
  price: z.number().int().min(IDEA_PRICE_MIN).max(IDEA_PRICE_MAX).nullable(),
});

const RemoveSchema = z.object({
  categoryId: CategorySchema,
  ideaId: z.string().refine(isCustomIdeaId, "That is not an idea you can remove."),
});

/**
 * Put a new idea on one of the three grids.
 *
 * The category comes from the page it was added on, so an idea can only ever
 * land where somebody was standing when they added it — which is the whole
 * behaviour asked for, and it means there is no category chooser to get wrong.
 */
export async function addBoredIdea(input: {
  categoryId: string;
  ideaId: string;
  label: string;
  emoji: string;
  price: number | null;
}): Promise<BoredActionResult> {
  const user = await requireUser();

  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be added." };
  }

  const categoryId = parsed.data.categoryId as BoredCategoryId;
  const label = normaliseLabel(parsed.data.label);
  if (label.length === 0) {
    return { ok: false, message: "Type something first." };
  }

  /*
   * A money job needs a price, and nothing else may have one. `normalisePrice`
   * returns null for a category that takes none, so this catches both a Money
   * idea with no price and a price attached to an Inside one.
   */
  const price = normalisePrice(categoryId, parsed.data.price);
  if (categoryId === "money" && price === null) {
    return { ok: false, message: "Pick how much it pays." };
  }

  try {
    const existing = await readBoredItems(categoryId);
    if (existing.length >= CATEGORY_LIMIT) {
      return { ok: false, message: "That page is full. Take one off first." };
    }

    const clash = await findBoredLabelClash(categoryId, label);
    if (clash) {
      return { ok: false, message: `“${clash.label}” is already here.` };
    }

    await insertBoredIdea({
      categoryId,
      ideaId: parsed.data.ideaId,
      label,
      price,
      emoji: parsed.data.emoji,
      addedBy: user.displayName,
    });
  } catch (error) {
    console.error(`[bored] Could not add "${label}" to ${categoryId}:`, error);
    return { ok: false, message: "That could not be added. Try again." };
  }

  revalidate(categoryId);
  return { ok: true };
}

/**
 * Take a family-added idea back off.
 *
 * Only the family's own: the parser refuses any id that is not one this app
 * issued for a custom idea, and the delete filters on `custom: true` as well. Two
 * checks for one rule, deliberately — the built-in list is the page's content,
 * and five children can reach this button.
 */
export async function removeBoredIdea(input: {
  categoryId: string;
  ideaId: string;
}): Promise<BoredActionResult> {
  await requireUser();

  const parsed = RemoveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That one cannot be taken off." };
  }

  const categoryId = parsed.data.categoryId as BoredCategoryId;

  try {
    // An idea already gone is not a failure — two taps on the same tile, or two
    // phones removing it at once, both end where the tapper wanted.
    await deleteBoredIdea(categoryId, parsed.data.ideaId);
  } catch (error) {
    console.error(`[bored] Could not remove ${parsed.data.ideaId}:`, error);
    return { ok: false, message: "That could not be taken off. Try again." };
  }

  revalidate(categoryId);
  return { ok: true };
}

/**
 * The one page that changed, and only that one.
 *
 * Not `/bored` as well, and that is worth stating rather than looking like an
 * oversight: the index is three cards with a picture and a one-word title, and it
 * deliberately shows **no counts** — see docs/bored.md, where the absence of
 * counts is one of the page's rules rather than a gap. So nothing on it can go
 * stale when an idea is added. Give it a count one day and this needs a second
 * line.
 *
 * Unlike the shopping list, this page *does* revalidate at all: it holds no live
 * connection, so a server render is the only thing that will ever tell the other
 * phones in the house. And it costs nothing worth counting, because ideas are
 * added a handful of times ever rather than a handful of times a day.
 */
function revalidate(categoryId: BoredCategoryId): void {
  revalidatePath(`/bored/${categoryId}`);
}
