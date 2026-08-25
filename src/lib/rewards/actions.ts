"use server";

import { ObjectId } from "mongodb";
import { z } from "zod";

import { CHILD_IDS, type ChildId } from "@/config/family";
import { requireUser } from "@/lib/auth/dal";
import { getBalance, insertTransaction } from "@/lib/coins/store";

import type {
  ContributeActionResult,
  RedeemActionResult,
} from "./action-result";
import {
  contributeToPool as contributeToPoolInStore,
  countRecentRedemptions,
  getActivePool,
  getRewardItem,
  insertPool,
  insertRedemption,
  poolTotal,
} from "./store";

/**
 * Spending coins: buying a reward, and chipping in on the family goal.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE MAY ONLY EXPORT ASYNC FUNCTIONS
 * ---------------------------------------------------------------------------
 * `"use server"` turns every export into a POST endpoint reachable by anyone
 * who can reach the site, whether or not they went through `/shop`. So both
 * actions re-fetch and re-check everything the page already showed —
 * `active`, the balance, the redemption limit — against the database rather
 * than trusting a number the client sent along. See `lib/shopping/actions.ts`
 * for the same rule stated at length.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO OWNERSHIP CHECK BEYOND "WHICH CHILD"
 * ---------------------------------------------------------------------------
 * One shared family login (see `docs/authentication.md`), so anybody signed
 * in can spend on behalf of any child — a parent redeeming on a child's
 * behalf, or a child on the shared kitchen tablet, both look the same to this
 * action. `childId` is who the coins come from and whose limit is checked; it
 * is not an identity being asserted.
 */

const ChildIdSchema = z.enum(CHILD_IDS as unknown as [ChildId, ...ChildId[]]);

const RedeemSchema = z.object({
  childId: ChildIdSchema,
  rewardId: z.string(),
  note: z.string().max(500).optional(),
});

/**
 * Buy a reward.
 *
 * Everything that decides whether this is allowed is re-read here: the item
 * might have been retired since the page rendered, the balance is the ledger's
 * sum rather than whatever the page displayed a moment ago, and the
 * redemption limit is counted from `rewardRedemptions` rather than trusted
 * from a client that could simply not send the tenth request.
 */
export async function redeemReward(input: {
  childId: string;
  rewardId: string;
  note?: string;
}): Promise<RedeemActionResult> {
  const user = await requireUser();

  const parsed = RedeemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be redeemed." };
  }
  const { childId, note } = parsed.data;

  try {
    const reward = await getRewardItem(parsed.data.rewardId);
    if (!reward || !reward.active) {
      return { ok: false, message: "That reward is no longer available." };
    }
    if (reward.tier === "ultimate") {
      return {
        ok: false,
        message: "The family goal is bought with contributions, not coins.",
      };
    }

    const balance = await getBalance(childId);
    if (balance < reward.cost) {
      return {
        ok: false,
        message: `${reward.cost - balance} more coin${
          reward.cost - balance === 1 ? "" : "s"
        } needed.`,
      };
    }

    if (reward.redemptionLimit) {
      const used = await countRecentRedemptions(
        childId,
        reward._id,
        reward.redemptionLimit.periodDays,
      );
      if (used >= reward.redemptionLimit.count) {
        return {
          ok: false,
          message: "Already used up for this period.",
        };
      }
    }

    const status = reward.requiresApproval ? "pending" : "completed";

    const redemption = await insertRedemption({
      childId,
      rewardId: reward._id,
      nameSnapshot: reward.name,
      costSnapshot: reward.cost,
      tierSnapshot: reward.tier,
      requiresApproval: reward.requiresApproval,
      status,
      note: note ?? "",
    });

    // Coins leave the balance the moment the reward is *decided*, not the
    // moment it is asked for — a pending request holds nothing back, which is
    // deliberate: a child should be able to ask for several approval-only
    // rewards without one silently reserving coins the others also need. The
    // debit for an approved request is posted by `resolveRedemption` instead.
    if (status === "completed") {
      await insertTransaction({
        childId,
        type: "redemption",
        amount: -reward.cost,
        redemptionId: redemption._id,
        note: `Redeemed: ${reward.name}`,
        createdBy: user.displayName,
      });
    }

    return { ok: true, status };
  } catch (error) {
    console.error(`[rewards] Could not redeem ${parsed.data.rewardId}:`, error);
    return { ok: false, message: "That could not be redeemed. Try again." };
  }
}

const ContributeSchema = z.object({
  childId: ChildIdSchema,
  poolId: z.string(),
  amount: z.number().int().positive(),
});

/**
 * Chip in on the family goal.
 *
 * `contributeToPoolInStore` does the atomic push-and-maybe-fund; this wraps it
 * with the same balance re-check every spend gets, and — when a contribution
 * is the one that crosses the target — opens a pending request so a parent
 * sees "the family goal is funded" on the admin screen's request list rather
 * than the pool simply changing colour with nobody told to act on it.
 */
export async function contributeToPool(input: {
  childId: string;
  poolId: string;
  amount: number;
}): Promise<ContributeActionResult> {
  const user = await requireUser();

  const parsed = ContributeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That could not be sent." };
  }
  const { childId, amount } = parsed.data;

  if (!ObjectId.isValid(parsed.data.poolId)) {
    return { ok: false, message: "That goal could not be found." };
  }
  const poolId = new ObjectId(parsed.data.poolId);

  try {
    const balance = await getBalance(childId);
    if (balance < amount) {
      return { ok: false, message: "That is more than the balance." };
    }

    const outcome = await contributeToPoolInStore(poolId, childId, amount);
    if (!outcome) {
      return { ok: false, message: "That goal is no longer taking coins." };
    }

    await insertTransaction({
      childId,
      type: "pool_contribution",
      amount: -amount,
      poolId,
      note: "Contributed to the family goal",
      createdBy: user.displayName,
    });

    if (outcome.justFunded) {
      // Nobody "redeems" a pool by tapping a button — the reward it stands
      // for is the thing being asked for, so funding it opens exactly the
      // kind of request `/shop/admin` already shows: a pending row, sitting
      // beside every other reward waiting on a decision. `resolveRedemption`
      // recognises this one by its reward's tier and closes the pool out —
      // see the note there.
      await insertRedemption({
        childId,
        rewardId: outcome.pool.rewardId,
        nameSnapshot: "Family Goal — funded",
        costSnapshot: outcome.pool.target,
        tierSnapshot: "ultimate",
        requiresApproval: true,
        status: "pending",
        note: "The family goal reached its target. Schedule it, then approve.",
      });
    }

    return {
      ok: true,
      total: poolTotal(outcome.pool),
      target: outcome.pool.target,
      justFunded: outcome.justFunded,
    };
  } catch (error) {
    console.error(`[rewards] Could not contribute for ${childId}:`, error);
    return { ok: false, message: "That could not be sent. Try again." };
  }
}

/** Opens the first pool for a freshly-created Ultimate reward, if it has none. */
export async function ensurePoolFor(
  rewardId: ObjectId,
  target: number,
): Promise<void> {
  const existing = await getActivePool(rewardId);
  if (!existing) await insertPool(rewardId, target);
}
