import Link from "next/link";

import type { BoredCategory } from "@/config/bored";

import { BORED_PALETTE, BoredCategoryArt } from "./BoredArt";

/**
 * One of the three cards on the front of the Bored Page.
 *
 * Big, square-ish, and almost entirely picture. Three of these fill a phone
 * screen with no scrolling, which is the point: a bored child should see every
 * option at once rather than discovering the third one by scrolling.
 *
 * The whole card is the link rather than the word underneath it, so a small
 * child jabbing at the drawing — which is what they will aim for — hits the
 * target every time.
 */
export function BoredCategoryCard({ category }: { category: BoredCategory }) {
  const palette = BORED_PALETTE[category.id];

  return (
    <Link
      href={`/bored/${category.id}`}
      className="app-card themed-transition flex h-full items-center gap-4 p-4 transition-transform active:scale-[0.97] sm:flex-col sm:justify-center sm:gap-3 sm:p-6"
      style={{
        backgroundColor: `color-mix(in srgb, ${palette.soft} 42%, var(--color-surface))`,
      }}
    >
      {/*
        Side by side on a phone, stacked on a tablet. On a phone the row keeps
        each card a comfortable height while still giving the drawing 5rem —
        larger than it ever was in the old three-across grid.
      */}
      <span
        className="flex aspect-square w-20 shrink-0 items-center justify-center rounded-3xl sm:w-full sm:max-w-32"
        style={{ backgroundColor: palette.soft }}
      >
        <BoredCategoryArt id={category.id} className="h-4/5 w-4/5" />
      </span>

      <span className="text-2xl font-extrabold tracking-tight">
        {category.title}
      </span>
    </Link>
  );
}
