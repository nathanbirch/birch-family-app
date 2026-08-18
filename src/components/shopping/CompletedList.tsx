"use client";

import { COMPLETED_HISTORY_LIMIT } from "@/config/shopping";
import { describeCompletion, type ShoppingItem } from "@/lib/shopping/list";

import { ShoppingRow } from "./ShoppingRow";

/**
 * The bottom of the page: the last hundred things the family bought.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS NOT A `<details>`
 * ---------------------------------------------------------------------------
 * `<details>`/`<summary>` is the semantically obvious element and gives the
 * keyboard and screen-reader behaviour for free. It also snaps: the browser flips
 * `display` on the content, and there is nothing to transition. `::details-content`
 * fixes that and is too new to rely on for the phones in this house.
 *
 * So this is a button and a region, with `aria-expanded`/`aria-controls` carrying
 * exactly what `<summary>` would have — and the panel animates by transitioning
 * `grid-template-rows` from `0fr` to `1fr`, which is the one way to animate to a
 * height nobody has measured. Where that interpolation is not supported the panel
 * simply appears, which is the `<details>` behaviour anyway.
 */
export function CompletedList({
  items,
  open,
  onOpenChange,
  nowMs,
  leaving,
  onRestore,
  onRemove,
}: {
  items: readonly ShoppingItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The client's clock, or `null` before the page has mounted.
   *
   * Timestamps are deliberately not rendered on the server: it runs in UTC and
   * the family does not, so "4:12 pm" would be formatted twice with two answers
   * and React would report a hydration mismatch. See `ShoppingBoard`.
   */
  nowMs: number | null;
  leaving: ReadonlySet<string>;
  onRestore: (item: ShoppingItem) => void;
  onRemove: (item: ShoppingItem) => void;
}) {
  const empty = items.length === 0;

  return (
    <section className="mt-8" aria-labelledby="bought-heading">
      <h2 id="bought-heading" className="sr-only">
        Already bought
      </h2>

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        disabled={empty}
        aria-expanded={open}
        aria-controls="bought-panel"
        className="app-card themed-transition flex w-full items-center gap-3 p-4 text-left transition-transform duration-150 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-55"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "var(--color-surface-muted)",
            color: "var(--color-text-muted)",
          }}
        >
          <BagIcon />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-tight">Bought</span>
          <span
            className="mt-0.5 block text-xs font-medium"
            style={{ color: "var(--color-text-muted)" }}
          >
            {empty
              ? "Nothing yet — tick something off"
              : describeHistory(items.length)}
          </span>
        </span>

        <Chevron open={open} />
      </button>

      <div id="bought-panel" className="shop-collapse" data-open={open}>
        <div>
          {/*
            The list is always in the DOM, which is what the collapse animates
            against — a panel whose contents appear only once it is open has no
            height to grow towards. `aria-hidden` while shut keeps it out of a
            screen reader's way, exactly as a closed `<details>` would.
          */}
          {/*
            `inert` does the rest: a shut panel's rows must not be reachable by
            tab either, or the focus ring would vanish into a collapsed region.
            React 19 passes it through as the real attribute.
          */}
          <ul className="flex flex-col gap-2 pt-2" aria-hidden={!open} inert={!open}>
            {items.map((item) => (
              <ShoppingRow
                key={item.id}
                item={item}
                done
                subtitle={
                  nowMs !== null && item.completedAt !== null
                    ? describeCompletion(item.completedAt, nowMs)
                    : undefined
                }
                leaving={leaving.has(item.id)}
                onToggle={() => onRestore(item)}
                onRemove={() => onRemove(item)}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** "12 things" — or, at the ceiling, an honest note that it is a window. */
function describeHistory(count: number): string {
  if (count >= COMPLETED_HISTORY_LIMIT) {
    return `The last ${COMPLETED_HISTORY_LIMIT}, newest first`;
  }
  return `${count} ${count === 1 ? "thing" : "things"}, newest first`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 transition-transform duration-300"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        color: "var(--color-text-muted)",
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
      }}
      aria-hidden="true"
    >
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  );
}

/** A shopping bag with a full look to it — the things already in the boot. */
function BagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.5 8h13l-1 11.2a1.6 1.6 0 0 1-1.6 1.4H8.1a1.6 1.6 0 0 1-1.6-1.4Z" />
      <path d="M9 8V6.2a3 3 0 0 1 6 0V8" />
    </svg>
  );
}
