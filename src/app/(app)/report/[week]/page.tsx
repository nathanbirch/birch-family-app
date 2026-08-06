import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AwardCeremony } from "@/components/report/AwardCeremony";
import { requireUser } from "@/lib/auth/dal";
import { addDays, formatDateRange } from "@/lib/dates";
import { familyNow } from "@/lib/family-api/time";
import { getWeekMarks } from "@/lib/stars/marks";
import { buildWeekReport, isCompletedWeek } from "@/lib/stars/report";
import { getChorePools } from "@/lib/stars/rotation-store";
import { parseWeekStart } from "@/lib/stars/week";

type PageProps = {
  /** Async in this version of Next — it must be awaited before it is read. */
  params: Promise<{ week: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { week } = await params;
  const monday = parseWeekStart(week);
  return {
    title: monday
      ? `Report · ${formatDateRange(monday, addDays(monday, 4))}`
      : "Weekly Report",
  };
}

/**
 * One week's award ceremony.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE URL IS ALLOWED TO BE
 * ---------------------------------------------------------------------------
 * `/report/2026-08-03`, and only ever a Monday that has already been and gone.
 * Two checks, and both 404 rather than falling back to something:
 *
 * - `parseWeekStart` rejects anything that is not a Monday, exactly as the
 *   star-charts action does. Without it, `/report/2026-08-05` would build a
 *   second, offset report for a week that does not exist.
 * - `isCompletedWeek` rejects this week and every week after it. A ceremony
 *   for a Wednesday-in-progress would congratulate five children for a week
 *   half of which has not happened, and one for October would be a page of
 *   zeroes presented as a result.
 *
 * A week nobody ticked a star in is *not* rejected. That is a real report of a
 * real week, and the slides say so.
 *
 * The rotation is asked about the week's own Monday, so a chore that has
 * changed hands three times since is still reported to whoever actually had it
 * — see `buildWeekReport`.
 */
export default async function ReportWeekPage({ params }: PageProps) {
  await requireUser();

  const { week } = await params;
  const monday = parseWeekStart(week);
  if (!monday) notFound();

  // The family's clock rather than the server's — see the note on `/report`.
  if (!isCompletedWeek(week, familyNow().civilNoon)) notFound();

  const [pools, marks] = await Promise.all([
    getChorePools(),
    getWeekMarks(week),
  ]);

  const report = buildWeekReport(pools, monday, marks);
  const dateLabel = formatDateRange(monday, addDays(monday, 4));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <Link
        href="/report"
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
        Weekly Report
      </Link>

      <div className="animate-soft-rise">
        <AwardCeremony report={report} dateLabel={dateLabel} />
      </div>
    </main>
  );
}
