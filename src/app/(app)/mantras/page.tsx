import type { Metadata } from "next";

import { MantraCard } from "@/components/mantras/MantraCard";
import { MantraOfDay } from "@/components/mantras/MantraOfDay";
import { MANTRAS } from "@/config/mantras";
import { requireUser } from "@/lib/auth/dal";
import { toIsoDate } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Family Mantras",
};

/**
 * The things this family says to each other, and where they came from.
 *
 * A Server Component that renders every mantra, with one client island at the
 * top for today's — the only part that depends on the device's clock.
 *
 * The whole list is rendered, not paginated or collapsed. There are fifteen of
 * them; a child scrolling the page should be able to read the lot without
 * hunting for a "show more" button.
 */
export default async function MantrasPage() {
  await requireUser();
  const initialDateIso = toIsoDate(new Date());

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <header className="animate-soft-fade mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Family Mantras
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--color-text-muted)" }}
        >
          What we say to each other, and the words that gave them to us. Every
          quote is exactly as it was spoken — tap the talk to go and read the
          whole thing.
        </p>
      </header>

      <MantraOfDay initialDateIso={initialDateIso} />

      <section aria-labelledby="all-heading" className="mt-8">
        <h2
          id="all-heading"
          className="mb-3 px-1 text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          All of them
        </h2>
        <ul className="animate-soft-rise flex flex-col gap-3">
          {MANTRAS.map((mantra) => (
            <li key={mantra.id}>
              <MantraCard mantra={mantra} />
            </li>
          ))}
        </ul>
      </section>

      <p
        className="mt-8 text-center text-xs leading-relaxed"
        style={{ color: "var(--color-text-muted)" }}
      >
        A new one on top every morning.
      </p>
    </main>
  );
}
