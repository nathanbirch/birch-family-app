"use client";

import { useState } from "react";

import type { AdminRewardItemView, RewardTier } from "@/lib/rewards/view";

export type RewardFormValues = {
  tier: RewardTier;
  name: string;
  description: string;
  cost: number;
  requiresApproval: boolean;
  isFamilyOuting: boolean;
  redemptionLimit: { count: number; periodDays: number } | null;
};

/** Add or edit one catalogue entry. Shared by "new" and "edit" — same fields
 * either way, just a different starting point and a different button label. */
export function RewardEditorForm({
  tier,
  initial,
  onSave,
  onCancel,
  busy,
}: {
  tier: RewardTier;
  initial?: AdminRewardItemView;
  onSave: (values: RewardFormValues) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [cost, setCost] = useState(String(initial?.cost ?? ""));
  const [requiresApproval, setRequiresApproval] = useState(
    initial?.requiresApproval ?? false,
  );
  const [isFamilyOuting, setIsFamilyOuting] = useState(
    initial?.isFamilyOuting ?? false,
  );
  const [limited, setLimited] = useState(initial?.redemptionLimit !== null);
  const [limitCount, setLimitCount] = useState(
    String(initial?.redemptionLimit?.count ?? 1),
  );
  const [limitDays, setLimitDays] = useState(
    String(initial?.redemptionLimit?.periodDays ?? 7),
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsedCost = Number.parseInt(cost, 10);
    if (name.trim().length === 0 || !Number.isFinite(parsedCost) || parsedCost <= 0) {
      return;
    }

    onSave({
      tier,
      name: name.trim(),
      description: description.trim(),
      cost: parsedCost,
      requiresApproval,
      isFamilyOuting,
      redemptionLimit: limited
        ? {
            count: Math.max(1, Number.parseInt(limitCount, 10) || 1),
            periodDays: Math.max(1, Number.parseInt(limitDays, 10) || 1),
          }
        : null,
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-2xl p-3"
      style={{ backgroundColor: "var(--color-surface-muted)" }}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        className="rounded-lg border px-3 py-1.5 text-sm"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
      />
      <input
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description (optional)"
        className="rounded-lg border px-3 py-1.5 text-sm"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
      />
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>
          Cost
        </label>
        <input
          type="number"
          min={1}
          value={cost}
          onChange={(event) => setCost(event.target.value)}
          className="w-20 rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
        />
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={requiresApproval}
          onChange={(event) => setRequiresApproval(event.target.checked)}
        />
        Requires approval
      </label>
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={isFamilyOuting}
          onChange={(event) => setIsFamilyOuting(event.target.checked)}
        />
        Family outing badge
      </label>
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={limited}
          onChange={(event) => setLimited(event.target.checked)}
        />
        Limit how often
      </label>
      {limited ? (
        <div className="flex items-center gap-2 pl-6 text-xs">
          <input
            type="number"
            min={1}
            value={limitCount}
            onChange={(event) => setLimitCount(event.target.value)}
            className="w-14 rounded-lg border px-2 py-1"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
          />
          <span>times per</span>
          <input
            type="number"
            min={1}
            value={limitDays}
            onChange={(event) => setLimitDays(event.target.value)}
            className="w-14 rounded-lg border px-2 py-1"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
          />
          <span>days</span>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full px-3 py-1.5 text-xs font-extrabold disabled:opacity-50"
          style={{ backgroundColor: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          {busy ? "Saving…" : initial ? "Save" : "Add"}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-3 py-1.5 text-xs font-extrabold"
            style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-muted)" }}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
