import type { Metadata } from "next";

import { HealthSectionCard } from "@/components/health/HealthSectionCard";
import { HEALTH_ITEM_COUNT, HEALTH_SECTIONS } from "@/config/health";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Healthy",
};

/**
 * The five lists off the wall, one card each.
 *
 * A Server Component with nothing dynamic on it at all — no clock, no
 * database, no fetch. The content is compiled in from `config/health.ts`, the
 * same way the mantras are, which is also why the whole page works offline
 * once it has been opened once.
 *
 * Cards rather than five long lists stacked on one screen: twenty items under
 * "How to Keep the Spirit in Our Home" alone would bury the four sheets under
 * it, and a child looking for "what do I do when I'm mad" should be one tap
 * from the answer rather than a long scroll.
 */
export default async function HealthPage() {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <header className="animate-soft-fade mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Healthy Birches
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--color-text-muted)" }}
        >
          The lists from the wall at home — body, mind, feelings, spirit, and
          all of us together. Tap a picture to read the whole list.
        </p>
      </header>

      <ul className="animate-soft-rise flex flex-col gap-3">
        {HEALTH_SECTIONS.map((section) => (
          <li key={section.id}>
            <HealthSectionCard section={section} />
          </li>
        ))}
      </ul>

      <p
        className="mt-8 text-center text-xs leading-relaxed"
        style={{ color: "var(--color-text-muted)" }}
      >
        {HEALTH_ITEM_COUNT} good things to do, and no day needs all of them.
      </p>
    </main>
  );
}
