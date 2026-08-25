/**
 * Plain, JSON-safe views of the reward data, shared between the server
 * components that fetch it and the client board that renders it.
 *
 * Deliberately free of MongoDB types (`ObjectId`, `Date`) — a Server Component
 * that passed a store document straight to a Client Component would either
 * fail to serialize or silently hand over more than the reward is supposed to
 * expose, the same trap `PublicUser` exists to avoid for the login.
 */

/*
 * Copied rather than imported from `./store`: that module is `server-only`
 * and pulls in the MongoDB driver, and even a type-only import has, in the
 * past, been enough to make a bundler follow the value import beside it. A
 * duplicated four-line union is a smaller risk than a client bundle that
 * quietly grows the driver into it.
 */
export type RewardTier = "quick" | "special" | "epic" | "ultimate";
export type RedemptionStatus = "completed" | "pending" | "approved" | "denied";

export type RewardItemView = {
  id: string;
  tier: RewardTier;
  name: string;
  description: string;
  cost: number;
  redemptionLimit: { count: number; periodDays: number } | null;
  requiresApproval: boolean;
  isFamilyOuting: boolean;
};

/** The admin screen's own view — it needs `active` and `position`, which the
 * kid-facing catalogue never sees because it only ever lists active items. */
export type AdminRewardItemView = RewardItemView & {
  position: number;
  active: boolean;
};

export type RedemptionView = {
  id: string;
  childId: string;
  rewardId: string;
  nameSnapshot: string;
  costSnapshot: number;
  status: RedemptionStatus;
  note: string;
  /** Epoch milliseconds. */
  requestedAt: number;
};

/** Every redemption for `rewardId` that counts against its limit, this period. */
export function redemptionsInPeriod(
  redemptions: readonly RedemptionView[],
  rewardId: string,
  periodDays: number,
  now: number,
): RedemptionView[] {
  const since = now - periodDays * 24 * 60 * 60 * 1000;
  return redemptions.filter(
    (row) =>
      row.rewardId === rewardId &&
      row.status !== "denied" &&
      row.requestedAt >= since,
  );
}

export function hasPendingRequest(
  redemptions: readonly RedemptionView[],
  rewardId: string,
): boolean {
  return redemptions.some(
    (row) => row.rewardId === rewardId && row.status === "pending",
  );
}

export type Affordability =
  | { canBuy: true }
  | { canBuy: false; reason: string };

/** Everything that can stop a reward being bought right now, in one call. */
export function checkAffordability(
  reward: RewardItemView,
  balance: number,
  redemptions: readonly RedemptionView[],
  now: number,
): Affordability {
  if (hasPendingRequest(redemptions, reward.id)) {
    return { canBuy: false, reason: "Request pending" };
  }

  if (reward.redemptionLimit) {
    const used = redemptionsInPeriod(
      redemptions,
      reward.id,
      reward.redemptionLimit.periodDays,
      now,
    ).length;
    if (used >= reward.redemptionLimit.count) {
      return { canBuy: false, reason: "Already used" };
    }
  }

  if (balance < reward.cost) {
    const needed = reward.cost - balance;
    return {
      canBuy: false,
      reason: `${needed} more coin${needed === 1 ? "" : "s"} needed`,
    };
  }

  return { canBuy: true };
}

export const TIER_LABEL: Record<RewardTier, string> = {
  quick: "Quick",
  special: "Special",
  epic: "Epic",
  ultimate: "Ultimate",
};
