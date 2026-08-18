"use server";

import { z } from "zod";

import { ACTIVE_ITEM_LIMIT, ITEM_NAME_MAX_LENGTH } from "@/config/shopping";
import { requireUser } from "@/lib/auth/dal";

import type { ShoppingActionResult } from "./action-result";
import { findDuplicate, isItemId, normaliseItemName } from "./list";
import {
  deleteShoppingItem,
  insertShoppingItem,
  readActiveItems,
  setShoppingItemDone,
} from "./store";

/**
 * The three things anybody can do to the shopping list.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE MAY ONLY EXPORT ASYNC FUNCTIONS
 * ---------------------------------------------------------------------------
 * `"use server"` turns every export into a POST endpoint reachable by anyone who
 * can reach the site, whether or not they went through the page. So every check
 * lives *inside* the action: `requireUser()` first, then the parser, then the
 * rules. The result type lives in `action-result.ts` because exporting it from
 * here would make Next.js reject the whole module.
 *
 * ---------------------------------------------------------------------------
 * WHY NOTHING HERE CALLS `revalidatePath`
 * ---------------------------------------------------------------------------
 * Every other mutation in the app ends with one. These deliberately do not, and
 * that is the one thing to understand before editing them.
 *
 * The page is a live one: an open browser is already being told about every
 * change through `/api/shopping/stream`, and the device that made the change
 * drew it before the write even left. Revalidating would spend a full server
 * render re-deriving a list that both parties already have, on every tap, for a
 * page somebody is holding in a supermarket aisle. The stream is the update
 * channel; the initial render is only the first frame.
 *
 * Nothing goes stale as a result, because the page is uncached — a fresh
 * navigation queries MongoDB again on its own.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO OWNERSHIP CHECK
 * ---------------------------------------------------------------------------
 * There is one login for the whole family (see docs/authentication.md), and a
 * shopping list is a shared object by nature: whoever is at the shop ticks off
 * whatever is on it, including the things they did not add. `addedBy` is
 * recorded because it is *useful* — "who wanted this?" is a real question — not
 * because it grants anybody anything.
 */

const AddSchema = z.object({
  /** Chosen by the browser. See `newItemId()` in `list.ts`. */
  id: z.string().refine(isItemId, "That is not an item id."),
  name: z.string().min(1).max(ITEM_NAME_MAX_LENGTH * 4),
});

const IdSchema = z.object({
  id: z.string().refine(isItemId, "That is not an item id."),
});

const DoneSchema = IdSchema.extend({ done: z.boolean() });

/**
 * Put something on the list.
 *
 * The name is trimmed rather than rejected for being long — see
 * `normaliseItemName()` — so the parser's own ceiling is deliberately generous;
 * it is there to stop a megabyte of paste, not to police a sentence.
 */
export async function addShoppingItem(input: {
  id: string;
  name: string;
}): Promise<ShoppingActionResult> {
  const user = await requireUser();

  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be added." };
  }

  const name = normaliseItemName(parsed.data.name);
  if (name.length === 0) {
    return { ok: false, message: "Type something to add first." };
  }

  try {
    const active = await readActiveItems();

    /*
     * Two people both remembering the milk is the normal case in a family, so
     * this is a friendly answer rather than a failure: the page flashes the line
     * that is already there. Checked here and not only in the browser, because
     * the two phones that both add milk are not looking at each other's screens.
     */
    const duplicate = findDuplicate(active, name);
    if (duplicate) {
      return {
        ok: false,
        message: `${duplicate.name} is already on the list.`,
        duplicateId: duplicate.id,
      };
    }

    if (active.length >= ACTIVE_ITEM_LIMIT) {
      return {
        ok: false,
        message: `The list is full at ${ACTIVE_ITEM_LIMIT} things. Tick some off first.`,
      };
    }

    await insertShoppingItem({
      id: parsed.data.id,
      name,
      addedBy: user.displayName,
    });
  } catch (error) {
    console.error(`[shopping] Could not add "${name}":`, error);
    return { ok: false, message: "That could not be added. Try again." };
  }

  return { ok: true };
}

/** Tick something off, or put it back on the list. */
export async function setShoppingItemComplete(input: {
  id: string;
  done: boolean;
}): Promise<ShoppingActionResult> {
  const user = await requireUser();

  const parsed = DoneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be saved." };
  }

  try {
    const found = await setShoppingItemDone(
      parsed.data.id,
      parsed.data.done,
      user.displayName,
    );
    if (!found) {
      // Somebody deleted it while this phone was looking at it. Saying so is
      // better than a silent success that leaves a ghost row on screen.
      return { ok: false, message: "That item is no longer on the list." };
    }
  } catch (error) {
    console.error(`[shopping] Could not update ${parsed.data.id}:`, error);
    return { ok: false, message: "That could not be saved. Try again." };
  }

  return { ok: true };
}

/** Take something off the list for good. */
export async function removeShoppingItem(input: {
  id: string;
}): Promise<ShoppingActionResult> {
  await requireUser();

  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be removed." };
  }

  try {
    // A row that is already gone is not a failure — two taps on the same bin,
    // or a delete racing somebody else's, both end where the tapper wanted.
    await deleteShoppingItem(parsed.data.id);
  } catch (error) {
    console.error(`[shopping] Could not remove ${parsed.data.id}:`, error);
    return { ok: false, message: "That could not be removed. Try again." };
  }

  return { ok: true };
}
