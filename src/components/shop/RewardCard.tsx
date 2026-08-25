"use client";

import { TIER_LABEL, type RewardItemView } from "@/lib/rewards/view";
import type { Affordability } from "@/lib/rewards/view";

/**
 * One thing coins can buy.
 *
 * The card never decides for itself whether the reward is affordable — that
 * answer, and the "N more coins needed" / "request pending" / "already used"
 * wording, is computed once by `checkAffordability` and handed in, so the
 * card and the Server Action that re-checks the same thing on redemption can
 * never disagree about the words used to explain a refusal.
 */
export function RewardCard({
  reward,
  affordability,
  onRedeem,
  busy,
}: {
  reward: RewardItemView;
  affordability: Affordability;
  onRedeem: () => void;
  busy: boolean;
}) {
  const disabled = !affordability.canBuy || busy;

  return (
    <li className="app-card themed-transition flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 font-bold leading-tight">
            {reward.name}
            {reward.isFamilyOuting ? (
              <span
                className="rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide"
                style={{
                  backgroundColor: "var(--color-surface-muted)",
                  color: "var(--color-text-muted)",
                }}
              >
                Family outing
              </span>
            ) : null}
            {reward.requiresApproval ? (
              <span
                className="rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide"
                style={{
                  backgroundColor: "var(--color-surface-muted)",
                  color: "var(--color-text-muted)",
                }}
              >
                Needs approval
              </span>
            ) : null}
          </p>
          {reward.description ? (
            <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
              {reward.description}
            </p>
          ) : null}
          {reward.redemptionLimit ? (
            <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
              {reward.redemptionLimit.count}× every {reward.redemptionLimit.periodDays}{" "}
              day{reward.redemptionLimit.periodDays === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>

        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-sm font-extrabold tabular-nums"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-star) 24%, transparent)",
            color: "var(--color-star-ink)",
          }}
        >
          {reward.cost}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
          {TIER_LABEL[reward.tier]}
        </span>
        <button
          type="button"
          onClick={onRedeem}
          disabled={disabled}
          className="rounded-full px-4 py-1.5 text-sm font-extrabold transition-transform active:scale-95 disabled:opacity-50"
          style={{
            backgroundColor: disabled
              ? "var(--color-surface-muted)"
              : "var(--color-primary)",
            color: disabled ? "var(--color-text-muted)" : "var(--color-on-primary)",
          }}
        >
          {affordability.canBuy
            ? busy
              ? "Redeeming…"
              : "Redeem"
            : affordability.reason}
        </button>
      </div>
    </li>
  );
}
