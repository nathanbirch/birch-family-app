import type { Metadata } from "next";

import { BoredCategoryCard } from "@/components/bored/BoredCategoryCard";
import { BORED_CATEGORIES } from "@/config/bored";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Bored",
};

/**
 * Three pictures. That is the whole page.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT HERE
 * ---------------------------------------------------------------------------
 * No blurb under the heading, no encouragement, no "here are some ideas!", no
 * empty state, no counts. Every other index page in this app carries a line of
 * explanation and every one of them earns it; this one would not. A child who
 * has opened a page called "Bored?" does not need to be told what it is for,
 * and the one most likely to be here cannot read the sentence anyway.
 *
 * The heading is a question with a question mark because that is the sentence
 * the child just said out loud. It is also the only text on the screen bar
 * three one-word labels.
 *
 * A Server Component with nothing dynamic on it — no clock, no database, no
 * fetch. Everything is compiled in from `config/bored.ts`, so the page works
 * offline once it has been opened once.
 */
export default async function BoredPage() {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <h1 className="animate-soft-fade mb-6 text-3xl font-extrabold tracking-tight sm:mb-8 sm:text-4xl">
        Bored?
      </h1>

      {/*
        One column on a phone, three from `sm` up.
        ---------------------------------------------------------------------
        Three across on a 390px screen gave three ~110px cards huddled at the
        top of an otherwise empty page — the drawings ended up smaller than the
        word underneath them, which inverts the whole point. Stacked, each card
        is the full width and the three of them fill the screen without
        scrolling, so every option is visible at once *and* big enough for the
        child who is navigating by picture.
      */}
      <ul className="animate-soft-rise grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {BORED_CATEGORIES.map((category) => (
          <li key={category.id}>
            <BoredCategoryCard category={category} />
          </li>
        ))}
      </ul>
    </main>
  );
}
