"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { CountUp } from "@/components/report/CountUp";
import { Confetti } from "@/components/stars/Confetti";
import { getChildren, getPerson, type ChildId } from "@/config/family";
import { useClientMinute } from "@/hooks/useClientMinute";
import { useShopStream } from "@/hooks/useShopStream";
import { contributeToPool, redeemReward } from "@/lib/rewards/actions";
import { checkAffordability, TIER_LABEL, type RedemptionView, type RewardItemView, type RewardTier } from "@/lib/rewards/view";
import type { ShopState } from "@/lib/shop/state";
import { playCheer } from "@/lib/stars/cheer";

import { FamilyGoalCard } from "./FamilyGoalCard";
import { RewardCard } from "./RewardCard";

const TIERS: readonly RewardTier[] = ["quick", "special", "epic"];

export function ShopBoard({
  items,
  redemptionsByChild,
  initialState,
  pool,
  ultimateName,
  parentUnlocked,
}: {
  items: readonly RewardItemView[];
  redemptionsByChild: Record<ChildId, RedemptionView[]>;
  initialState: ShopState;
  pool: {
    id: string;
    rewardId: string;
    target: number;
    total: number;
    contributions: readonly { childId: string; amount: number }[];
  } | null;
  ultimateName: string | null;
  parentUnlocked: boolean;
}) {
  const children = getChildren();
  const [selected, setSelected] = useState<ChildId>(
    children[0]?.id as ChildId,
  );
  const [tab, setTab] = useState<"rewards" | "goal">("rewards");
  const { state, setState } = useShopStream(initialState);

  const [redemptions, setRedemptions] = useState(redemptionsByChild);
  const [busyRewardId, setBusyRewardId] = useState<string | null>(null);
  const [poolOverride, setPoolOverride] = useState(pool);
  const [poolBusy, setPoolBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);

  const balance = state.balances[selected] ?? 0;

  /*
   * `Date.now()` cannot be called during render — React's purity rule, and
   * rightly so, since two renders of the same props would then disagree.
   * `useClientMinute` is this codebase's sanctioned way to get a clock into a
   * component (see `useShoppingList` and `useClientMinute` itself): `null`
   * on the very first render, standing in for "the redemption window is
   * still running" until the real clock arrives a paint later — the Server
   * Action re-checks the same limit for real before anything is spent.
   */
  const now = useClientMinute() ?? 0;

  const grouped = useMemo(() => {
    const byTier = new Map<RewardTier, RewardItemView[]>();
    for (const tier of TIERS) byTier.set(tier, []);
    for (const item of items) {
      if (item.tier === "ultimate") continue;
      byTier.get(item.tier)?.push(item);
    }
    return byTier;
  }, [items]);

  async function onRedeem(reward: RewardItemView) {
    setBusyRewardId(reward.id);
    setMessage(null);

    const result = await redeemReward({ childId: selected, rewardId: reward.id });
    setBusyRewardId(null);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setRedemptions((current) => ({
      ...current,
      [selected]: [
        {
          id: `local-${Date.now()}`,
          childId: selected,
          rewardId: reward.id,
          nameSnapshot: reward.name,
          costSnapshot: reward.cost,
          status: result.status,
          note: "",
          requestedAt: Date.now(),
        },
        ...(current[selected] ?? []),
      ],
    }));

    if (result.status === "completed") {
      setState({
        ...state,
        balances: { ...state.balances, [selected]: balance - reward.cost },
      });
      setCelebrate((value) => value + 1);
      playCheer(0.5);
      setMessage(`Enjoy: ${reward.name}!`);
    } else {
      setMessage(`Sent to a parent for approval: ${reward.name}.`);
    }
  }

  async function onContribute(amount: number) {
    if (!poolOverride) return;
    setPoolBusy(true);
    setMessage(null);

    const result = await contributeToPool({
      childId: selected,
      poolId: poolOverride.id,
      amount,
    });
    setPoolBusy(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setState({
      ...state,
      balances: { ...state.balances, [selected]: balance - amount },
    });
    setPoolOverride({
      ...poolOverride,
      total: result.total,
      contributions: [
        ...poolOverride.contributions,
        { childId: selected, amount },
      ],
    });
    setCelebrate((value) => value + 1);
    playCheer(0.5);
    setMessage(
      result.justFunded
        ? "That did it! The family goal is funded — a parent will schedule it."
        : "Added to the family goal.",
    );
  }

  const person = getPerson(selected);

  return (
    <>
      <header className="animate-soft-fade mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          The Shop
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Coins from stars, and what they can become.
        </p>
      </header>

      {/* Whose shop — same face-first pattern as `/stars`' `ChildTabs`, with a
          coin pill instead of a star one, since a star total means nothing
          here. */}
      <div
        role="tablist"
        aria-label="Whose coins"
        className="mb-5 flex items-start justify-between gap-1 sm:gap-3"
      >
        {children.map((child) => {
          const isSelected = child.id === selected;
          return (
            <button
              key={child.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelected(child.id as ChildId)}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl p-1 transition-transform active:scale-95"
              style={{
                transform: isSelected ? "scale(1.08)" : "scale(1)",
                transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <span
                className="themed-transition block w-full max-w-[4.5rem] rounded-full"
                style={{
                  padding: "0.2rem",
                  backgroundColor: isSelected ? child.avatarColor : "transparent",
                  opacity: isSelected ? 1 : 0.45,
                }}
              >
                <Avatar member={child} showName={false} />
              </span>
              <span
                className="block truncate text-xs font-bold"
                style={{
                  color: isSelected ? "var(--color-text)" : "var(--color-text-muted)",
                }}
              >
                {child.name}
              </span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums"
                style={{
                  backgroundColor: isSelected
                    ? "color-mix(in srgb, var(--color-star) 24%, transparent)"
                    : "transparent",
                  color: isSelected ? "var(--color-star-ink)" : "var(--color-text-muted)",
                }}
              >
                {state.balances[child.id as ChildId] ?? 0} 🪙
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="app-card themed-transition relative mb-5 flex items-center justify-center gap-2 overflow-hidden p-5 text-center"
        style={{ backgroundColor: person.avatarColor, color: "#fff" }}
      >
        {celebrate > 0 ? (
          <Confetti key={celebrate} scope="section" colors={[person.avatarColor, "#f5b301", "#ffffff"]} />
        ) : null}
        <span className="text-4xl font-extrabold tabular-nums">
          <CountUp target={balance} durationMs={700} />
        </span>
        <span className="text-lg font-bold opacity-90">coins</span>
      </div>

      {message ? (
        <p
          role="status"
          className="animate-soft-fade mb-4 rounded-2xl px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)" }}
        >
          {message}
        </p>
      ) : null}

      <div className="mb-4 flex gap-2">
        <TabButton active={tab === "rewards"} onClick={() => setTab("rewards")}>
          Rewards
        </TabButton>
        <TabButton active={tab === "goal"} onClick={() => setTab("goal")}>
          Family Goal
        </TabButton>
      </div>

      {tab === "rewards" ? (
        <div className="flex flex-col gap-6">
          {TIERS.map((tier) => {
            const tierItems = grouped.get(tier) ?? [];
            if (tierItems.length === 0) return null;
            return (
              <section key={tier}>
                <h2
                  className="mb-2 px-1 text-xs font-bold uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {TIER_LABEL[tier]}
                </h2>
                <ul className="flex flex-col gap-3">
                  {tierItems.map((item) => (
                    <RewardCard
                      key={item.id}
                      reward={item}
                      affordability={checkAffordability(
                        item,
                        balance,
                        redemptions[selected] ?? [],
                        now,
                      )}
                      busy={busyRewardId === item.id}
                      onRedeem={() => onRedeem(item)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : poolOverride && ultimateName ? (
        <FamilyGoalCard
          name={ultimateName}
          total={poolOverride.total}
          target={poolOverride.target}
          contributions={poolOverride.contributions}
          balance={balance}
          onContribute={onContribute}
          busy={poolBusy}
          funded={poolOverride.total >= poolOverride.target}
        />
      ) : (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          There is no family goal open right now.
        </p>
      )}

      <p className="mt-8 text-center text-xs">
        <Link href="/shop/admin" style={{ color: "var(--color-text-muted)" }}>
          {parentUnlocked ? "Parent admin" : "Parent admin (PIN required)"}
        </Link>
      </p>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-full py-2 text-sm font-extrabold transition-colors"
      style={{
        backgroundColor: active ? "var(--color-primary)" : "var(--color-surface-muted)",
        color: active ? "var(--color-on-primary)" : "var(--color-text-muted)",
      }}
    >
      {children}
    </button>
  );
}
