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

export type TierMeta = {
  label: string;
  /** Short, kid-facing line under the tier's label — the shop is meant to
   * read as a shelf of distinct games, not a price list. */
  tagline: string;
  /** Theme-invariant identity colour, declared in `globals.css` the same
   * way `--color-star` is — a tier looks the same whatever theme is active. */
  color: string;
  /** Readable shade for text/labels placed on that colour, same
   * `color-mix`-with-text-colour trick as `--color-star-ink`. */
  colorInk: string;
};

/** One source of truth for tier identity, shared by `/shop` and `/shop/admin`. */
export const TIER_META: Record<RewardTier, TierMeta> = {
  quick: {
    label: "Quick",
    tagline: "Little things, earned and spent often.",
    color: "var(--color-tier-quick)",
    colorInk: "var(--color-tier-quick-ink)",
  },
  special: {
    label: "Special",
    tagline: "Worth saving up a few days for.",
    color: "var(--color-tier-special)",
    colorInk: "var(--color-tier-special-ink)",
  },
  epic: {
    label: "Epic",
    tagline: "The big stuff — save up for something amazing.",
    color: "var(--color-tier-epic)",
    colorInk: "var(--color-tier-epic-ink)",
  },
  ultimate: {
    label: "Ultimate",
    tagline: "One massive family goal. Everybody chips in.",
    color: "var(--color-tier-ultimate)",
    colorInk: "var(--color-tier-ultimate-ink)",
  },
};

export const TIER_LABEL: Record<RewardTier, string> = {
  quick: TIER_META.quick.label,
  special: TIER_META.special.label,
  epic: TIER_META.epic.label,
  ultimate: TIER_META.ultimate.label,
};
