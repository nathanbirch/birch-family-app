"use client";

import type { ShoppingItem } from "@/lib/shopping/list";

/**
 * One line on the list, wanted or bought.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WHOLE LINE IS THE TICK
 * ---------------------------------------------------------------------------
 * The obvious build is a small checkbox with the name beside it. That is a 24px
 * target held one-handed in a supermarket, and the name — the largest, most
 * obvious thing on the row — does nothing when tapped, which is exactly the
 * thing a thumb will try. So the tick and the name are one button spanning the
 * row, and the only separate control is the bin, kept small and at the far edge
 * because it is the one action nobody wants to hit by accident.
 *
 * `role="checkbox"` rather than `aria-pressed`, because that is what this is: a
 * thing with two states that somebody is ticking off. A real `<input>` would have
 * meant fighting the browser for the tick's appearance and animation for no gain
 * — the role and `aria-checked` say the same thing to a screen reader.
 */
export function ShoppingRow({
  item,
  done,
  subtitle,
  leaving,
  flash,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem;
  done: boolean;
  /** Shown small and muted under the name. Used for "when it was bought". */
  subtitle?: string;
  /** Ticked, and on its way out of this list. */
  leaving?: boolean;
  /** Somebody just tried to add this again. Draw attention to it. */
  flash?: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <li
      /*
       * The entrance animation is unconditional, and that is the whole
       * mechanism: a CSS animation runs when an element is *mounted*, and the
       * only rows React mounts are the ones that were not there a moment ago.
       * Rows that merely re-render — because somebody else ticked something
       * three lines up — keep their element and do not replay it.
       *
       * So there is no "is this row new?" bookkeeping anywhere, which is worth
       * more than it sounds: the obvious version of that bookkeeping is a ref
       * read during render, and it goes subtly wrong in development, where React
       * renders every component twice on purpose.
       */
      className={`themed-transition flex items-center gap-1 rounded-2xl ${
        leaving ? "shop-row-out" : "shop-row-in"
      }`}
      /*
       * The "already on the list" highlight is a *transition*, not an animation,
       * and deliberately so. Two animations on one element share the single
       * `animation` property, so a flash class would replace the entrance
       * animation while it was on — and replaying it when it came off. A colour
       * change carried by `themed-transition` cannot collide with anything, and
       * under reduced motion it simply happens at once rather than being lost.
       */
      style={{
        backgroundColor: flash
          ? "color-mix(in srgb, var(--color-primary) 16%, var(--color-surface))"
          : "var(--color-surface)",
        border: `1px solid ${flash ? "var(--color-primary)" : "var(--color-border)"}`,
        boxShadow: "0 1px 2px var(--color-shadow)",
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-3 text-left transition-transform duration-150 active:scale-[0.99]"
      >
        <Tick done={done} />

        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-base font-semibold transition-all duration-300"
            style={
              done
                ? {
                    color: "var(--color-text-muted)",
                    textDecoration: "line-through",
                  }
                : undefined
            }
          >
            {item.name}
          </span>
          {subtitle ? (
            <span
              className="mt-0.5 block truncate text-xs font-medium"
              style={{ color: "var(--color-text-muted)" }}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.name}`}
        className="mr-1 shrink-0 rounded-xl p-2.5 opacity-45 transition-all duration-150 hover:opacity-100 active:scale-[0.92]"
        style={{ color: "var(--color-text-muted)" }}
      >
        <BinIcon />
      </button>
    </li>
  );
}

/**
 * The circle that fills in.
 *
 * Two layers rather than a swap: the ring is always drawn, and the filled disc
 * grows out of the middle of it. That is what makes the tick feel like something
 * landing rather than one icon being replaced by another — and because both
 * layers exist in both states, nothing reflows when it changes.
 */
function Tick({ done }: { done: boolean }) {
  return (
    <span
      className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-200"
      style={{
        border: `2px solid ${done ? "var(--color-primary)" : "var(--color-border)"}`,
        backgroundColor: done ? "var(--color-primary)" : "transparent",
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke={done ? "var(--color-on-primary)" : "transparent"}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/*
          Keyed on the state so the stroke redraws itself each time it is ticked
          — a remount is what restarts a `both`-filled animation, and here it is
          also what stops the check from being drawn again when some *other* row
          changes.
        */}
        <path key={done ? "on" : "off"} className={done ? "shop-tick-draw" : ""} d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function BinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4.5 w-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 7h15M9.5 7V5.4a1.4 1.4 0 0 1 1.4-1.4h2.2a1.4 1.4 0 0 1 1.4 1.4V7" />
      <path d="M6.5 7l.9 12.2A1.6 1.6 0 0 0 9 20.7h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </svg>
  );
}
