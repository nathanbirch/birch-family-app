import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HealthArt } from "@/components/health/HealthArt";
import { HealthList } from "@/components/health/HealthList";
import { HEALTH_SECTIONS, findHealthSection } from "@/config/health";
import { requireUser } from "@/lib/auth/dal";

type PageProps = {
  /** Async in this version of Next — it must be awaited before it is read. */
  params: Promise<{ section: string }>;
};

/*
 * Deliberately no `generateStaticParams`. The five ids are known at build
 * time, but `requireUser()` reads the session cookie, so this route is
 * server-rendered per request no matter what — pre-rendering the params would
 * be a comment claiming something the build output flatly contradicts. The
 * content itself is still compiled in, so the render is a lookup in an array.
 */

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { section } = await params;
  const match = findHealthSection(section);
  return { title: match ? match.title : "Healthy" };
}

/**
 * One list, on its own page.
 *
 * A real route rather than an expanding panel on `/health`, for two reasons:
 * the back button then does what a child expects, and a long list starts at its
 * own top rather than halfway down a page that is already scrolled.
 *
 * `LastPageMemory` does not reopen the app *here* — `isKnownPage` matches
 * `NAV_ITEMS` exactly, so a sub-route is not remembered and the app comes back
 * to `/health` instead. That is the right answer anyway: a child returning the
 * next morning wants the five cards, not yesterday's list.
 *
 * An unknown id 404s rather than falling back to the first list — a mistyped
 * URL should say so, not quietly show the wrong sheet.
 */
export default async function HealthSectionPage({ params }: PageProps) {
  await requireUser();

  const { section: id } = await params;
  const section = findHealthSection(id);
  if (!section) notFound();

  const others = HEALTH_SECTIONS.filter((other) => other.id !== section.id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <Link
        href="/health"
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
        All the lists
      </Link>

      <div className="animate-soft-rise">
        <HealthList section={section} />
      </div>

      <nav aria-labelledby="others-heading" className="mt-8">
        <h2
          id="others-heading"
          className="mb-3 px-1 text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          The other lists
        </h2>
        <ul className="grid grid-cols-2 gap-3">
          {others.map((other) => (
            <li key={other.id}>
              <Link
                href={`/health/${other.id}`}
                className="app-card themed-transition flex h-full items-center gap-2.5 p-3 text-sm font-bold leading-snug transition-transform active:scale-[0.98]"
              >
                <HealthArt id={other.id} className="h-9 w-9 shrink-0" />
                {other.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
