"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CHILD_IDS, type ChildId } from "@/config/family";
import { requireUser } from "@/lib/auth/dal";
import { requireParentPin } from "@/lib/auth/parent-pin";
import { insertTransaction } from "@/lib/coins/store";

import type { RewardAdminActionResult } from "./action-result";
import { ensurePoolFor } from "./actions";
import {
  deactivateRewardItem,
  getFundedPool,
  getRedemption,
  insertPool,
  insertRewardItem,
  markPoolRedeemed,
  reorderRewardItems as reorderRewardItemsInStore,
  resolveRedemptionStatus,
  updateRewardItem as updateRewardItemInStore,
  type RewardTier,
} from "./store";

/**
 * The parent-only half of the shop: the catalogue, the pending requests, and
 * manual corrections.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE MAY ONLY EXPORT ASYNC FUNCTIONS
 * ---------------------------------------------------------------------------
 * Same rule as every other `"use server"` file in the app — but here it
 * matters twice over. `/shop/admin` gates itself on the PIN before it ever
 * draws the catalogue editor, but that gate is cosmetic if these functions do
 * not check for themselves: anybody who can read this file's name can call
 * `createRewardItem` directly, PIN prompt or no PIN prompt. So `requireParentPin()`
 * is the *first* line of every export below, before `requireUser()` even —
 * consistent with the house rule that every check lives inside the action.
 */

const TierSchema = z.enum(["quick", "special", "epic", "ultimate"]);

const RedemptionLimitSchema = z
  .object({
    count: z.number().int().positive(),
    periodDays: z.number().int().positive(),
  })
  .nullable();

const RewardItemSchema = z.object({
  tier: TierSchema,
  name: z.string().min(1).max(120),
  description: z.string().max(500),
  cost: z.number().int().positive(),
  redemptionLimit: RedemptionLimitSchema,
  requiresApproval: z.boolean(),
  isFamilyOuting: z.boolean(),
});

export async function createRewardItem(
  input: z.infer<typeof RewardItemSchema>,
): Promise<RewardAdminActionResult> {
  await requireParentPin();
  await requireUser();

  const parsed = RewardItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be added." };
  }

  try {
    const item = await insertRewardItem(parsed.data);
    // The Ultimate tier is bought from a pool, not a balance — the moment one
    // is added to the catalogue it needs somewhere to collect contributions.
    if (item.tier === "ultimate") {
      await ensurePoolFor(item._id, item.cost);
    }
  } catch (error) {
    console.error(`[rewards] Could not create "${parsed.data.name}":`, error);
    return { ok: false, message: "That could not be added. Try again." };
  }

  revalidate();
  return { ok: true };
}

const UpdateSchema = RewardItemSchema.partial().extend({
  id: z.string(),
  active: z.boolean().optional(),
});

export async function updateRewardItem(
  input: z.infer<typeof UpdateSchema>,
): Promise<RewardAdminActionResult> {
  await requireParentPin();
  await requireUser();

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be saved." };
  }
  const { id, ...patch } = parsed.data;

  try {
    const found = await updateRewardItemInStore(id, patch);
    if (!found) return { ok: false, message: "That reward no longer exists." };
  } catch (error) {
    console.error(`[rewards] Could not update ${id}:`, error);
    return { ok: false, message: "That could not be saved. Try again." };
  }

  revalidate();
  return { ok: true };
}

const IdSchema = z.object({ id: z.string() });

/** Soft delete — see `deactivateRewardItem`. */
export async function deleteRewardItem(
  input: z.infer<typeof IdSchema>,
): Promise<RewardAdminActionResult> {
  await requireParentPin();
  await requireUser();

  const parsed = IdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be removed." };
  }

  try {
    await deactivateRewardItem(parsed.data.id);
  } catch (error) {
    console.error(`[rewards] Could not remove ${parsed.data.id}:`, error);
    return { ok: false, message: "That could not be removed. Try again." };
  }

  revalidate();
  return { ok: true };
}

const ReorderSchema = z.object({
  tier: TierSchema,
  orderedIds: z.array(z.string()).min(1),
});

/** Up/down controls send the whole tier's new order in one call. */
export async function reorderRewardItems(
  input: z.infer<typeof ReorderSchema>,
): Promise<RewardAdminActionResult> {
  await requireParentPin();
  await requireUser();

  const parsed = ReorderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be reordered." };
  }

  try {
    await reorderRewardItemsInStore(
      parsed.data.tier as RewardTier,
      parsed.data.orderedIds,
    );
  } catch (error) {
    console.error(`[rewards] Could not reorder ${parsed.data.tier}:`, error);
    return { ok: false, message: "That could not be reordered. Try again." };
  }

  revalidate();
  return { ok: true };
}

const ResolveSchema = z.object({
  redemptionId: z.string(),
  decision: z.enum(["approved", "denied"]),
  note: z.string().max(500).optional(),
});

/**
 * Approve or deny a request that needed a parent's say — an Epic outing, a
 * scheduled Errand Buddy, or the family goal once it is funded.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE COINS ACTUALLY LEAVE THE BALANCE
 * ---------------------------------------------------------------------------
 * `redeemReward` never debits a request that needs approval — see the note
 * there. So an **approval** is the moment the debit is finally posted, and a
 * **denial** costs the child nothing at all: the coins were never taken.
 *
 * The one exception is the Ultimate tier. Its "request" is not a purchase —
 * each contributor already paid as they contributed (see
 * `contributeToPool`) — so approving it posts no debit; it closes the funded
 * pool and opens a fresh one so the family can start saving for the next one
 * straight away, which is the behaviour `config/db.ts` describes for
 * `rewardPools`.
 */
export async function resolveRedemption(
  input: z.infer<typeof ResolveSchema>,
): Promise<RewardAdminActionResult> {
  await requireParentPin();
  const user = await requireUser();

  const parsed = ResolveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be resolved." };
  }
  if (!ObjectId.isValid(parsed.data.redemptionId)) {
    return { ok: false, message: "That request could not be found." };
  }

  try {
    const redemption = await getRedemption(parsed.data.redemptionId);
    if (!redemption || redemption.status !== "pending") {
      return { ok: false, message: "That request has already been resolved." };
    }

    const updated = await resolveRedemptionStatus(
      redemption._id,
      parsed.data.decision,
      parsed.data.note ?? "",
      user.displayName,
    );
    if (!updated) {
      return { ok: false, message: "That request has already been resolved." };
    }

    if (parsed.data.decision === "approved") {
      if (redemption.tierSnapshot === "ultimate") {
        const pool = await getFundedPool(redemption.rewardId);
        if (pool) {
          await markPoolRedeemed(pool._id);
          await insertPool(pool.rewardId, pool.target);
        }
      } else {
        await insertTransaction({
          // Validated as a `ChildId` when the redemption was created — see
          // `redeemReward` — so this cast merely restates that; the
          // document itself only ever stores it as a plain `string`.
          childId: redemption.childId as ChildId,
          type: "redemption",
          amount: -redemption.costSnapshot,
          redemptionId: redemption._id,
          note: `Redeemed (approved): ${redemption.nameSnapshot}`,
          createdBy: user.displayName,
        });
      }
    }
  } catch (error) {
    console.error(
      `[rewards] Could not resolve ${parsed.data.redemptionId}:`,
      error,
    );
    return { ok: false, message: "That could not be resolved. Try again." };
  }

  revalidate();
  return { ok: true };
}

const AdjustSchema = z.object({
  childId: z.enum(CHILD_IDS as unknown as [ChildId, ...ChildId[]]),
  amount: z.number().int().refine((value) => value !== 0, "Enter an amount."),
  note: z.string().min(1).max(200),
});

/** A manual correction — a bonus, or fixing a mistake. Always shows a note. */
export async function adjustCoins(
  input: z.infer<typeof AdjustSchema>,
): Promise<RewardAdminActionResult> {
  await requireParentPin();
  const user = await requireUser();

  const parsed = AdjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be recorded." };
  }

  try {
    await insertTransaction({
      childId: parsed.data.childId,
      type: "adjustment",
      amount: parsed.data.amount,
      note: parsed.data.note,
      createdBy: user.displayName,
    });
  } catch (error) {
    console.error(`[rewards] Could not adjust ${parsed.data.childId}:`, error);
    return { ok: false, message: "That could not be recorded. Try again." };
  }

  revalidate();
  return { ok: true };
}

/**
 * `/shop` and `/shop/admin` both. Unlike the shopping list, this page has no
 * live stream feeding the *admin* board's own render — the SSE route only
 * carries balances, pool progress and the pending count — so an edit here
 * needs a real revalidation to show up in another admin tab.
 */
function revalidate(): void {
  revalidatePath("/shop");
  revalidatePath("/shop/admin");
}
