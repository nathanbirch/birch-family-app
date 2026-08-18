"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useClientMinute } from "@/hooks/useClientMinute";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useShoppingList } from "@/hooks/useShoppingList";
import { describeCount, type ShoppingItem, type ShoppingList } from "@/lib/shopping/list";

import { AddItemForm } from "./AddItemForm";
import { CompletedList } from "./CompletedList";
import { ShoppingRow } from "./ShoppingRow";

/**
 * The shopping list.
 *
 * A client component, and for a reason none of the app's other islands have: this
 * page is *shared*, live, in both directions. Somebody adds bread on the phone in
 * the kitchen and it appears on the phone at the shop, with no reload and nobody
 * tapping anything. Everything about how that works is in
 * `useShoppingList` and `lib/shopping/stream.ts`; this component is the part you
 * can see.
 *
 * ---------------------------------------------------------------------------
 * THE TICK TAKES 260 MILLISECONDS TO DO NOTHING
 * ---------------------------------------------------------------------------
 * The one deliberate delay on the page. Ticking something off moves it from the
 * top list into the accordion at the bottom, and doing that on the same frame as
 * the tap means the row is gone before the eye has confirmed which row was
 * tapped — which on a list of similar words is genuinely disorienting.
 *
 * So the row is marked `leaving`, the tick draws itself and the line strikes
 * through, and only then does the change go out. React cannot animate a node it
 * is about to unmount, so holding the state change *is* the exit animation.
 *
 * Under `prefers-reduced-motion` there is no wait at all — the delay exists to
 * carry an animation, and with no animation to carry it would just be lag.
 */
export function ShoppingBoard({
  initial,
  me,
}: {
  initial: ShoppingList;
  /** Display name of whoever is signed in, for optimistic rows. */
  me: string;
}) {
  const { list, live, error, flashId, addItem, setDone, removeItem } =
    useShoppingList(initial, me);
  const reducedMotion = useReducedMotion();

  const [openHistory, setOpenHistory] = useState(false);
  /** Rows mid-exit: ticked, or restored, and still on screen for the animation. */
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  /*
   * The client's own clock — `null` until the page has mounted, which is when
   * the finished rows start carrying a time. They are inside a shut accordion at
   * that point anyway. See `useClientMinute` for why the server cannot answer
   * this question.
   */
  const nowMs = useClientMinute();

  // A row's exit outlives the tap that started it, so every timer has to be
  // cancellable — otherwise leaving the page fires them into an unmounted tree.
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const afterExit = useCallback(
    (id: string, change: () => void) => {
      if (reducedMotion) {
        change();
        return;
      }

      setLeaving((current) => new Set(current).add(id));

      const timer = setTimeout(() => {
        timers.current.delete(timer);
        change();
        /*
         * Cleared in the same tick as the change. The row is about to be
         * replaced by its counterpart in the other list, and leaving the id in
         * this set would mark that new row as leaving the moment it arrived.
         */
        setLeaving((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, EXIT_MS);

      timers.current.add(timer);
    },
    [reducedMotion],
  );

  const tickOff = useCallback(
    (item: ShoppingItem) => afterExit(item.id, () => void setDone(item, true)),
    [afterExit, setDone],
  );

  const putBack = useCallback(
    (item: ShoppingItem) => afterExit(item.id, () => void setDone(item, false)),
    [afterExit, setDone],
  );

  return (
    <div className="flex flex-col">
      <header className="animate-soft-fade mb-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Shopping
          </h1>
          <LiveDot live={live} />
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {list.active.length === 0
            ? "Nothing needed. Add the first thing."
            : `${describeCount(list.active.length)} to get`}
        </p>
      </header>

      <AddItemForm onAdd={addItem} />

      {/*
        One live region for the whole page, and it says something in exactly two
        situations: a write failed, or somebody added something that is already
        on the list. Both are things the person holding the phone needs told;
        neither is worth a dialog.
      */}
      <div aria-live="polite" className="min-h-0">
        {error ? (
          <p
            className="animate-soft-rise mt-3 rounded-2xl px-4 py-2.5 text-center text-sm font-semibold"
            style={{
              backgroundColor: "color-mix(in srgb, #dc2626 12%, transparent)",
              color: "#b91c1c",
            }}
          >
            {error}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="wanted-heading" className="mt-4">
        <h2 id="wanted-heading" className="sr-only">
          Still to get
        </h2>

        {list.active.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.active.map((item) => (
              <ShoppingRow
                key={item.id}
                item={item}
                done={false}
                leaving={leaving.has(item.id)}
                flash={flashId === item.id}
                onToggle={() => tickOff(item)}
                onRemove={() => void removeItem(item)}
              />
            ))}
          </ul>
        )}
      </section>

      <CompletedList
        items={list.completed}
        open={openHistory}
        onOpenChange={setOpenHistory}
        nowMs={nowMs}
        leaving={leaving}
        onRestore={putBack}
        onRemove={(item) => void removeItem(item)}
      />
    </div>
  );
}

/**
 * How long a row is held on screen after it has been ticked.
 *
 * Matched to `shop-row-out` in globals.css. Shorter than the animation would be
 * a row that vanished mid-flight; longer would be a page that felt slow.
 */
const EXIT_MS = 260;

/**
 * The connection indicator.
 *
 * Small, and honest. When the stream is up it is a quiet pulse that says other
 * people's changes will arrive on their own; when it is down it says so, because
 * a shared list that has silently stopped being shared is the one failure this
 * page must not hide.
 */
function LiveDot({ live }: { live: boolean }) {
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-bold"
      style={{
        color: live ? "var(--color-primary)" : "var(--color-text-muted)",
      }}
    >
      <span
        className={`h-2 w-2 rounded-full ${live ? "shop-live-pulse" : ""}`}
        style={{
          backgroundColor: live
            ? "var(--color-primary)"
            : "var(--color-text-muted)",
          opacity: live ? 1 : 0.5,
        }}
        aria-hidden="true"
      />
      {live ? "Live" : "Offline"}
    </span>
  );
}

function EmptyState() {
  return (
    <div
      className="app-card animate-soft-rise flex flex-col items-center gap-2 px-6 py-10 text-center"
      style={{ borderStyle: "dashed" }}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: "var(--color-surface-muted)",
          color: "var(--color-text-muted)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3.5 6h2.2l2.3 9.6a1.6 1.6 0 0 0 1.6 1.2h7.6a1.6 1.6 0 0 0 1.55-1.2L20.5 9H7" />
          <circle cx="10" cy="20" r="1.3" />
          <circle cx="17" cy="20" r="1.3" />
        </svg>
      </span>
      <p className="text-base font-bold">The list is empty</p>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Anything anybody adds shows up here, on every phone in the house.
      </p>
    </div>
  );
}
