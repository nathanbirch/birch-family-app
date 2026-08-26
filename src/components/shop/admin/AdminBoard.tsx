"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { CHILD_IDS, getPerson, type ChildId } from "@/config/family";
import { lockParentPin } from "@/lib/auth/parent-pin-actions";
import {
  adjustCoins,
  createRewardItem,
  deleteRewardItem,
  reorderRewardItems,
  resolveRedemption,
  updateRewardItem,
} from "@/lib/rewards/admin-actions";
import {
  TIER_META,
  type AdminRewardItemView,
  type RedemptionView,
  type RewardTier,
} from "@/lib/rewards/view";

import { CoinAmount } from "../CoinAmount";
import { RewardEditorForm, type RewardFormValues } from "./RewardEditorForm";

const TIERS: readonly RewardTier[] = ["quick", "special", "epic", "ultimate"];

export function AdminBoard({
  items,
  pending,
  balances,
  usage,
}: {
  items: readonly AdminRewardItemView[];
  pending: readonly RedemptionView[];
  balances: Record<ChildId, number>;
  /** Keyed by reward id — see `getRedemptionUsage`. */
  usage: Record<string, { total: number; byChild: Record<string, number> }>;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingTier, setAddingTier] = useState<RewardTier | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const byTier = useMemo(() => {
    const map = new Map<RewardTier, AdminRewardItemView[]>();
    for (const tier of TIERS) map.set(tier, []);
    for (const item of items) {
      if (!item.active) continue;
      map.get(item.tier)?.push(item);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [items]);

  const inactive = items.filter((item) => !item.active);

  async function refresh() {
    router.refresh();
  }

  async function onCreate(tier: RewardTier, values: RewardFormValues) {
    setBusyId("new");
    const result = await createRewardItem(values);
    setBusyId(null);
    setAddingTier(null);
    setMessage(result.ok ? null : result.message);
    if (result.ok) await refresh();
  }

  async function onUpdate(id: string, values: RewardFormValues) {
    setBusyId(id);
    const result = await updateRewardItem({ id, ...values });
    setBusyId(null);
    setEditingId(null);
    setMessage(result.ok ? null : result.message);
    if (result.ok) await refresh();
  }

  async function onDelete(id: string) {
    setBusyId(id);
    const result = await deleteRewardItem({ id });
    setBusyId(null);
    setMessage(result.ok ? null : result.message);
    if (result.ok) await refresh();
  }

  async function onRestore(item: AdminRewardItemView) {
    setBusyId(item.id);
    const result = await updateRewardItem({ id: item.id, active: true });
    setBusyId(null);
    setMessage(result.ok ? null : result.message);
    if (result.ok) await refresh();
  }

  async function onMove(tier: RewardTier, id: string, direction: -1 | 1) {
    const list = byTier.get(tier) ?? [];
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= list.length) return;

    const orderedIds = list.map((item) => item.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];

    setBusyId(id);
    const result = await reorderRewardItems({ tier, orderedIds });
    setBusyId(null);
    setMessage(result.ok ? null : result.message);
    if (result.ok) await refresh();
  }

  async function onResolve(
    redemptionId: string,
    decision: "approved" | "denied",
  ) {
    setBusyId(redemptionId);
    const result = await resolveRedemption({ redemptionId, decision });
    setBusyId(null);
    setMessage(result.ok ? null : result.message);
    if (result.ok) await refresh();
  }

  async function onLock() {
    await lockParentPin();
    router.push("/shop");
    router.refresh();
  }

  return (
    <>
      <header className="animate-soft-fade mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Shop Admin</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Catalogue, requests, and corrections.
          </p>
        </div>
        <button
          type="button"
          onClick={onLock}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold"
          style={{ backgroundColor: "var(--color-surface-muted)", color: "var(--color-text-muted)" }}
        >
          Lock
        </button>
      </header>

      {message ? (
        <p
          role="status"
          className="mb-4 rounded-2xl px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)" }}
        >
          {message}
        </p>
      ) : null}

      <PendingSection pending={pending} busyId={busyId} onResolve={onResolve} />

      <AdjustSection balances={balances} onDone={refresh} setMessage={setMessage} />

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold">Catalogue</h2>
        {TIERS.map((tier) => {
          const list = byTier.get(tier) ?? [];
          const meta = TIER_META[tier];
          return (
            <div
              key={tier}
              className="app-card themed-transition mb-4 flex flex-col gap-3 p-4"
              style={{
                borderLeft: `0.28rem solid ${meta.color}`,
                backgroundColor: `color-mix(in srgb, ${meta.color} 5%, var(--color-surface))`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="font-bold" style={{ color: meta.colorInk }}>
                    {meta.label}
                  </h3>
                  <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                    {meta.tagline}
                  </p>
                </div>
                {tier !== "ultimate" || list.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setAddingTier(tier)}
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-extrabold"
                    style={{ backgroundColor: "var(--color-primary)", color: "var(--color-on-primary)" }}
                  >
                    + Add
                  </button>
                ) : null}
              </div>

              <ul className="flex flex-col gap-2">
                {list.map((item, index) => (
                  <li key={item.id}>
                    {editingId === item.id ? (
                      <RewardEditorForm
                        tier={tier}
                        initial={item}
                        busy={busyId === item.id}
                        onSave={(values) => onUpdate(item.id, values)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <div className="flex items-center justify-between gap-2 rounded-2xl px-3 py-2" style={{ backgroundColor: "var(--color-surface-muted)" }}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{item.name}</p>
                          <p
                            className="flex items-center gap-1 text-xs"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            <CoinAmount amount={item.cost} glyphClassName="h-3 w-3" />
                            {item.requiresApproval ? " · approval" : ""}
                            {item.redemptionLimit
                              ? ` · ${item.redemptionLimit.count}/${item.redemptionLimit.periodDays}d`
                              : ""}
                          </p>
                          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {formatUsage(usage[item.id])}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {tier !== "ultimate" ? (
                            <>
                              <IconButton
                                label="Move up"
                                disabled={index === 0 || busyId === item.id}
                                onClick={() => onMove(tier, item.id, -1)}
                              >
                                ↑
                              </IconButton>
                              <IconButton
                                label="Move down"
                                disabled={index === list.length - 1 || busyId === item.id}
                                onClick={() => onMove(tier, item.id, 1)}
                              >
                                ↓
                              </IconButton>
                            </>
                          ) : null}
                          <IconButton label="Edit" onClick={() => setEditingId(item.id)}>
                            ✎
                          </IconButton>
                          {tier !== "ultimate" ? (
                            <IconButton
                              label="Remove"
                              disabled={busyId === item.id}
                              onClick={() => onDelete(item.id)}
                            >
                              ✕
                            </IconButton>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {addingTier === tier ? (
                <RewardEditorForm
                  tier={tier}
                  busy={busyId === "new"}
                  onSave={(values) => onCreate(tier, values)}
                  onCancel={() => setAddingTier(null)}
                />
              ) : null}
            </div>
          );
        })}
      </section>

      {inactive.length > 0 ? (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold" style={{ color: "var(--color-text-muted)" }}>
            Retired
          </h2>
          <ul className="flex flex-col gap-2">
            {inactive.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-2xl px-3 py-2 text-sm"
                style={{ backgroundColor: "var(--color-surface-muted)" }}
              >
                <span className="truncate opacity-70">{item.name}</span>
                <button
                  type="button"
                  onClick={() => onRestore(item)}
                  disabled={busyId === item.id}
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-extrabold"
                  style={{ backgroundColor: "var(--color-primary)", color: "var(--color-on-primary)" }}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** "Redeemed 14× · Hannah 3, James 2" — never counted, never bought. */
function formatUsage(entry: { total: number; byChild: Record<string, number> } | undefined): string {
  if (!entry || entry.total === 0) return "Never redeemed.";
  const byChild = Object.entries(entry.byChild)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${getPerson(id as ChildId).name} ${count}`)
    .join(", ");
  return `Redeemed ${entry.total}× · ${byChild}`;
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold disabled:opacity-40"
      style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-muted)" }}
    >
      {children}
    </button>
  );
}

function PendingSection({
  pending,
  busyId,
  onResolve,
}: {
  pending: readonly RedemptionView[];
  busyId: string | null;
  onResolve: (id: string, decision: "approved" | "denied") => void;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-bold">
        Pending requests{pending.length > 0 ? ` (${pending.length})` : ""}
      </h2>
      {pending.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Nothing waiting.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pending.map((row) => {
            const person = getPerson(row.childId as ChildId);
            return (
              <li
                key={row.id}
                className="app-card themed-transition flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {person.name} — {row.nameSnapshot}
                  </p>
                  <p
                    className="flex items-center gap-1 text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    <CoinAmount amount={row.costSnapshot} glyphClassName="h-3 w-3" />
                    {row.note ? ` · ${row.note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => onResolve(row.id, "approved")}
                    className="rounded-full px-3 py-1 text-xs font-extrabold"
                    style={{ backgroundColor: "var(--color-primary)", color: "var(--color-on-primary)" }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => onResolve(row.id, "denied")}
                    className="rounded-full px-3 py-1 text-xs font-extrabold"
                    style={{ backgroundColor: "var(--color-surface-muted)", color: "var(--color-text-muted)" }}
                  >
                    Deny
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AdjustSection({
  balances,
  onDone,
  setMessage,
}: {
  balances: Record<ChildId, number>;
  onDone: () => void;
  setMessage: (message: string | null) => void;
}) {
  const [childId, setChildId] = useState<ChildId>(CHILD_IDS[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number.parseInt(amount, 10);
    if (!Number.isFinite(parsed) || parsed === 0 || note.trim().length === 0) {
      return;
    }

    setBusy(true);
    const result = await adjustCoins({ childId, amount: parsed, note: note.trim() });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setAmount("");
    setNote("");
    setMessage(null);
    onDone();
  }

  return (
    <section className="app-card themed-transition mb-6 flex flex-col gap-3 p-4">
      <h2 className="text-lg font-bold">Adjust a balance</h2>
      <p
        className="flex items-center gap-1 text-sm"
        style={{ color: "var(--color-text-muted)" }}
      >
        {getPerson(childId).name} currently has <CoinAmount amount={balances[childId] ?? 0} />
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <select
            value={childId}
            onChange={(event) => setChildId(event.target.value as ChildId)}
            className="rounded-full border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
          >
            {CHILD_IDS.map((id) => (
              <option key={id} value={id}>
                {getPerson(id).name} ({balances[id] ?? 0})
              </option>
            ))}
          </select>
          <input
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="+/- coins"
            className="w-28 rounded-full border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
          />
        </div>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why (required)"
          className="rounded-full border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
        />
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-full px-4 py-1.5 text-sm font-extrabold disabled:opacity-50"
          style={{ backgroundColor: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          {busy ? "Saving…" : "Apply"}
        </button>
      </form>
    </section>
  );
}
