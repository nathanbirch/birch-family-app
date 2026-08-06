import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BORED_PALETTE } from "@/components/bored/BoredArt";
import { IdeaCard } from "@/components/bored/IdeaCard";
import { findBoredCategory } from "@/config/bored";
import { requireUser } from "@/lib/auth/dal";

type PageProps = {
  /** Async in this version of Next — it must be awaited before it is read. */
  params: Promise<{ category: string }>;
};

/*
 * No `generateStaticParams`, for the same reason as the health sections: the
 * three ids are known at build time, but `requireUser()` reads the session
 * cookie, so this route is server-rendered per request regardless. The content
 * is compiled in, so the render is a lookup in an array.
 */

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category } = await params;
  const match = findBoredCategory(category);
  return { title: match ? match.title : "Bored" };
}

/**
 * One category's ideas, as a grid of pictures.
 *
 * ---------------------------------------------------------------------------
 * A GRID, NOT A LIST
 * ---------------------------------------------------------------------------
 * A list would be a column of words with small pictures beside them, and the
 * words would do the work. A grid puts twelve drawings on one screen at a size
 * a four-year-old can actually read, and turns "what could I do" into a glance
 * instead of a scroll. Two columns on a phone, three from `sm` up.
 *
 * Money is the same grid with a price on each tile. Deliberately not a
 * different layout: it is the third option on the same page, not a separate
 * feature, and a child who has learned the grid should not have to learn a
 * table as well.
 *
 * The back link says "Bored?" rather than "Back" because it is going to the
 * page called Bored? — and because a child who cannot read either word can use
 * the arrow.
 *
 * An unknown id 404s rather than falling back to Inside. A mistyped URL should
 * say so rather than quietly showing the wrong thing.
 */
export default async function BoredCategoryPage({ params }: PageProps) {
  await requireUser();

  const { category: id } = await params;
  const category = findBoredCategory(id);
  if (!category) notFound();

  const palette = BORED_PALETTE[category.id];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <Link
        href="/bored"
        className="animate-soft-fade mb-4 inline-flex items-center gap-1.5 text-sm font-bold"
        style={{ color: "var(--color-primary)" }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 5-7 7 7 7" />
        </svg>
        Bored?
      </Link>

      <h1 className="animate-soft-fade mb-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
        {category.title}
      </h1>

      <ul className="animate-soft-rise grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {category.ideas.map((idea) => (
          <li key={idea.id}>
            <IdeaCard idea={idea} palette={palette} />
          </li>
        ))}
      </ul>
    </main>
  );
}
