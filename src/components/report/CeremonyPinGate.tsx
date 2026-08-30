"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { unlockParentPin } from "@/lib/auth/parent-pin-actions";

/**
 * The parent-only lock in front of a ceremony's *first* opening.
 *
 * Same shape as `shop/admin`'s `PinGate` — a PIN typed on a family tablet, not
 * a login — and it sets the same cookie, so a parent who already unlocked the
 * shop today walks straight into a ceremony too. `router.refresh()` re-runs
 * the ceremony page, which records the opening and swaps this for the real
 * ceremony in the same request. See `gateCeremony` on the ceremony page.
 */
export function CeremonyPinGate() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await unlockParentPin({ pin });
    setBusy(false);

    if (!result.ok) {
      setError(result.message ?? "That is not the right PIN.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="app-card mx-auto mt-10 flex max-w-sm flex-col gap-4 p-6 text-center">
      <div>
        <h1 className="text-xl font-extrabold">Parent PIN</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          This ceremony hasn&apos;t been opened yet. Enter the PIN to start it —
          you won&apos;t need it to watch again.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className="rounded-full border px-4 py-2 text-center text-lg font-bold tracking-widest"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
          }}
        />
        {error ? (
          <p className="text-sm font-semibold" style={{ color: "#c0392b" }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || pin.length === 0}
          className="rounded-full py-2 text-sm font-extrabold disabled:opacity-50"
          style={{ backgroundColor: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
