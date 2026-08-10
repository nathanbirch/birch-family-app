import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AwardCeremony } from "@/components/report/AwardCeremony";
import {
  getVisibleSpanCeremony,
  type SpanCeremony,
} from "@/config/ceremonies";
import { requireUser } from "@/lib/auth/dal";
import { addDays, formatDateRange, parseLocalDate } from "@/lib/dates";
import { familyNow } from "@/lib/family-api/time";
import { getMarksForWeeks, getWeekMarks } from "@/lib/stars/marks";
import {
  buildSpanReport,
  buildWeekReport,
  isCompletedWeek,
} from "@/lib/stars/report";
import { getChorePools } from "@/lib/stars/rotation-store";
import { parseWeekStart } from "@/lib/stars/week";

type PageProps = {
  /** Async in this version of Next — it must be awaited before it is read. */
  params: Promise<{ week: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { week } = await params;

  const span = getVisibleSpanCeremony(week, familyNow().date);
  if (span) return { title: span.title };

  const monday = parseWeekStart(week);
  return {
    title: monday
      ? `Ceremony · ${formatDateRange(monday, addDays(monday, 4))}`
      : "Ceremonies",
  };
}

/**
 * One week's award ceremony.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE URL IS ALLOWED TO BE
 * ---------------------------------------------------------------------------
 * `/ceremonies/2026-08-03`, and only ever a Monday that has already been and gone.
 * Two checks, and both 404 rather than falling back to something:
 *
 * - `parseWeekStart` rejects anything that is not a Monday, exactly as the
 *   star-charts action does. Without it, `/ceremonies/2026-08-05` would build a
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

  /*
   * A ceremony spanning several weeks is addressed by its id rather than by a
   * Monday, so it is looked up first — the parse below would reject the id as
   * "not a Monday" and 404 a page that exists.
   *
   * `getVisibleSpanCeremony` refuses one whose window has closed, which is why
   * the check is a lookup rather than a lookup plus an `if`: a hidden ceremony
   * has no URL, and a home-screen shortcut to last night's event lands on the
   * same 404 as an id somebody invented.
   */
  const span = getVisibleSpanCeremony(week, familyNow().date);
  if (span) return renderSpan(span);

  const monday = parseWeekStart(week);
  if (!monday) notFound();

  // The family's clock rather than the server's — see the note on `/ceremonies`.
  if (!isCompletedWeek(week, familyNow().civilNoon)) notFound();

  const [pools, marks] = await Promise.all([
    getChorePools(),
    getWeekMarks(week),
  ]);

  const report = buildWeekReport(pools, monday, marks);
  const dateLabel = formatDateRange(monday, addDays(monday, 4));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <BackLink />

      <div className="animate-soft-rise">
        <AwardCeremony report={report} dateLabel={dateLabel} />
      </div>
    </main>
  );
}

/**
 * A ceremony made of several finished weeks.
 *
 * Every week is read and built exactly as it would be on its own — same
 * rotation, same rows — and the totals are summed, so this can never disagree
 * with the weekly ceremonies listed underneath it. See `buildSpanReport()`.
 *
 * The weeks are not re-checked for being finished here. `tests/ceremonies.test.ts`
 * pins that every configured span is made of Mondays that are already over,
 * which is the right place for it: a span is written by hand and a mistake in
 * it should fail the build rather than 404 in front of the family.
 */
async function renderSpan(span: SpanCeremony) {
  const [pools, marks] = await Promise.all([
    getChorePools(),
    getMarksForWeeks(span.weekStarts),
  ]);

  const report = buildSpanReport(
    pools,
    span.id,
    span.weekStarts.map((week) => ({
      // Every entry is checked as a real Monday by the test suite, so the
      // fallback is unreachable — and it keeps a bad edit rendering rather
      // than throwing in front of five children.
      monday: parseLocalDate(week) ?? new Date(),
      marks: marks[week],
    })),
  );

  const dateLabel = formatDateRange(
    parseLocalDate(report.weekStart) ?? new Date(),
    parseLocalDate(report.weekEnd) ?? new Date(),
  );

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <BackLink />
      <div className="animate-soft-rise">
        <AwardCeremony
          report={report}
          dateLabel={dateLabel}
          title={span.title}
        />
      </div>
    </main>
  );
}

/** The way back to the list. The same on both kinds of ceremony page. */
function BackLink() {
  return (
    <Link
      href="/ceremonies"
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
      Ceremonies
    </Link>
  );
}
