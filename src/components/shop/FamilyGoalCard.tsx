"use client";

import { useState } from "react";

import { getPerson, type ChildId } from "@/config/family";
import { TIER_META } from "@/lib/rewards/view";

import { CoinAmount } from "./CoinAmount";

/**
 * The Ultimate tier's pooled goal — everybody's coins toward one big reward.
 *
 * Contributions are shown per child rather than just as a total, because the
 * point of a family goal is seeing your own dent in it: five bars in one
 * track read as "we did this together" in a way one number cannot.
 */
export function FamilyGoalCard({
  name,
  total,
  target,
  contributions,
  balance,
  onContribute,
  busy,
  funded,
}: {
  name: string;
  total: number;
  target: number;
  contributions: readonly { childId: string; amount: number }[];
  /** The selected child's own balance, so the input can be capped. */
  balance: number;
  onContribute: (amount: number) => void;
  busy: boolean;
  /** Funded but not yet approved/scheduled — contributions are closed. */
  funded: boolean;
}) {
  const [amount, setAmount] = useState("");
  const share = target > 0 ? Math.min(1, total / target) : 0;

  const byChild = new Map<string, number>();
  for (const entry of contributions) {
    byChild.set(entry.childId, (byChild.get(entry.childId) ?? 0) + entry.amount);
  }

  const parsed = Number.parseInt(amount, 10);
  const validAmount = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const capped = validAmount !== null && validAmount <= balance && !funded;
  const tier = TIER_META.ultimate;

  return (
    <div
      className="app-card themed-transition flex flex-col gap-4 p-4"
      style={{
        borderLeft: `0.28rem solid ${tier.color}`,
        backgroundColor: `color-mix(in srgb, ${tier.color} 6%, var(--color-surface))`,
      }}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: tier.colorInk }}>
          {tier.label}
        </p>
        <p className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>
          {tier.tagline}
        </p>
        <p className="mt-2 font-bold">{name}</p>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          <CoinAmount amount={total} /> of <CoinAmount amount={target} />
        </p>
      </div>

      <div
        className="h-3 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--color-surface-muted)" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.round(share * 100)}%`,
            backgroundColor: tier.color,
          }}
        />
      </div>

      <ul className="flex items-start justify-between gap-1">
        {[...byChild.entries()].map(([childId, sum]) => {
          const person = getPerson(childId as ChildId);
          return (
            <li key={childId} className="flex flex-col items-center gap-1 text-center">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold"
                style={{ backgroundColor: person.avatarColor, color: "#fff" }}
              >
                {person.name.charAt(0)}
              </span>
              <CoinAmount amount={sum} className="text-xs font-bold" glyphClassName="h-3.5 w-3.5" />
            </li>
          );
        })}
        {byChild.size === 0 ? (
          <li className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Nobody has contributed yet.
          </li>
        ) : null}
      </ul>

      {funded ? (
        <p className="text-sm font-semibold" style={{ color: tier.colorInk }}>
          Funded! Waiting on a parent to schedule it.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={balance}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={`Up to ${balance}`}
            className="w-24 rounded-full border px-3 py-1.5 text-sm font-bold"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
            }}
          />
          <button
            type="button"
            disabled={!capped || busy}
            onClick={() => validAmount !== null && onContribute(validAmount)}
            className="rounded-full px-4 py-1.5 text-sm font-extrabold transition-transform active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-primary)",
              color: "var(--color-on-primary)",
            }}
          >
            {busy ? "Sending…" : "Contribute"}
          </button>
        </div>
      )}
    </div>
  );
}
