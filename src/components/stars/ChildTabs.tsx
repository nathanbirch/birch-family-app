"use client";

import { getChildren, type ChildId } from "@/config/family";

import { Avatar } from "../Avatar";

/**
 * Whose chart you are looking at.
 *
 * Faces rather than names: the youngest child on this chart is four, and he
 * finds himself by his photograph long before he finds himself by a word. The
 * selected face wears a ring in that child's own identifying colour — the same
 * colour their column is printed in on the fridge.
 *
 * All five fit across a phone at this size, so it does not scroll and nobody
 * is hidden off the edge.
 */
export function ChildTabs({
  selected,
  totals,
  onSelect,
}: {
  selected: ChildId;
  /** Stars earned so far this week, per child, for the pill under each face. */
  totals: Record<ChildId, number>;
  onSelect: (childId: ChildId) => void;
}) {
  const children = getChildren();

  return (
    <div
      role="tablist"
      aria-label="Whose chart"
      className="flex items-start justify-between gap-1 sm:gap-3"
    >
      {children.map((child) => {
        const isSelected = child.id === selected;
        return (
          <button
            key={child.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(child.id as ChildId)}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl p-1 transition-transform active:scale-95"
          >
            <span
              className="themed-transition block w-full max-w-[4.5rem] rounded-full"
              style={{
                // The ring is drawn with padding + background rather than an
                // outline so the unselected faces do not jump when one is
                // picked — the space is always there, just transparent.
                padding: "0.2rem",
                backgroundColor: isSelected
                  ? child.avatarColor
                  : "transparent",
                opacity: isSelected ? 1 : 0.62,
              }}
            >
              <Avatar member={child} showName={false} arriving />
            </span>
            <span
              className="block truncate text-xs font-bold"
              style={{
                color: isSelected
                  ? "var(--color-text)"
                  : "var(--color-text-muted)",
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
                color: isSelected
                  ? "var(--color-star-ink)"
                  : "var(--color-text-muted)",
              }}
            >
              {totals[child.id as ChildId] ?? 0} ⭐
            </span>
          </button>
        );
      })}
    </div>
  );
}
