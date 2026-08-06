import type { Metadata } from "next";

import { ReportHeroCard } from "@/components/report/ReportHeroCard";
import { ReportPager } from "@/components/report/ReportPager";
import { ReportRow } from "@/components/report/ReportRow";
import { requireUser } from "@/lib/auth/dal";
import { addDays, formatDateRange, parseLocalDate } from "@/lib/dates";
import { familyNow } from "@/lib/family-api/time";
import { getMarksForWeeks, listStarWeekStarts } from "@/lib/stars/marks";
import { buildWeekReport, reportableWeeks } from "@/lib/stars/report";
import { getChorePools } from "@/lib/stars/rotation-store";

export const metadata: Metadata = {
  title: "Weekly Report",
};

/** How many older weeks are listed on one page. */
const PER_PAGE = 10;

/**
 * Every weekly report, newest first.
 *
 * The latest finished week gets the card at the top — it sits there for seven
 * days, until the next Monday makes a new one — and everything older is a
 * plain list underneath it, ten at a time.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE IS STORED
 * ---------------------------------------------------------------------------
 * A report is `starWeeks` read back through `lib/stars/report.ts`, so this
 * page is two queries: which weeks have stars in them, and the marks for the
 * eleven weeks actually on screen. See the note at the top of `report.ts` for
 * why there is no `reports` collection and should not be one.
 *
 * ---------------------------------------------------------------------------
 * WHOSE CLOCK DECIDES WHICH WEEK IS OVER
 * ---------------------------------------------------------------------------
 * The family's, not the server's. This runs on Vercel, where "now" is UTC, and
 * Rexburg is six or seven hours behind — so from Sunday teatime onwards a
 * server-clock page would have already published a report for a week that,
 * where the children are, has not finished. `familyNow().civilNoon` is the
 * same fix the family API uses: a `Date` whose calendar fields read as
 * Rexburg's. It is only ever fed to the helpers in `lib/dates.ts`, which is
 * all that proxy is safe for.
 */
export default async function ReportPage({
  searchParams,
}: {
  /** Async in this version of Next — it must be awaited before it is read. */
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await requireUser();

  const now = familyNow().civilNoon;
  const stored = await listStarWeekStarts();
  const weeks = reportableWeeks(stored, now);

  const [featuredWeek, ...older] = weeks;
  const pageCount = Math.max(1, Math.ceil(older.length / PER_PAGE));
  const page = clampPage((await searchParams).page, pageCount);
  const listed = older.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const [pools, marks] = await Promise.all([
    getChorePools(),
    getMarksForWeeks([featuredWeek, ...listed]),
  ]);

  const featured = buildWeekReport(
    pools,
    // `reportableWeeks` only ever returns Mondays it produced itself, so this
    // cannot be null — but the fallback keeps the page rendering rather than
    // throwing if that ever stops being true.
    parseLocalDate(featuredWeek) ?? now,
    marks[featuredWeek],
  );

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <header className="animate-soft-fade mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Weekly Report
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Every star of the week, and what it was worth.
        </p>
      </header>

      {page === 1 ? (
        <ReportHeroCard report={featured} dateLabel={labelFor(featured.weekStart)} />
      ) : null}

      {listed.length > 0 ? (
        <section aria-labelledby="older-heading" className="mt-8">
          <h2
            id="older-heading"
            className="mb-3 px-1 text-xs font-bold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            Earlier weeks
          </h2>
          <ul className="animate-soft-rise flex flex-col gap-3">
            {listed.map((week) => (
              <li key={week}>
                <ReportRow
                  report={buildWeekReport(
                    pools,
                    parseLocalDate(week) ?? now,
                    marks[week],
                  )}
                  dateLabel={labelFor(week)}
                />
              </li>
            ))}
          </ul>
          <ReportPager page={page} pageCount={pageCount} />
        </section>
      ) : (
        <p
          className="mt-8 text-center text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          Earlier weeks will appear here as they finish.
        </p>
      )}
    </main>
  );
}

/** "Aug 3 – Aug 7": Monday to Friday, which is as wide as a chart goes. */
function labelFor(weekStart: string): string {
  const monday = parseLocalDate(weekStart);
  if (!monday) return weekStart;
  return formatDateRange(monday, addDays(monday, 4));
}

/**
 * `?page=` from a URL somebody may well have typed.
 *
 * Anything that is not a page number lands on page one rather than on an empty
 * list or a 404 — a mistyped query string is not worth an error page.
 */
function clampPage(raw: string | string[] | undefined, pageCount: number): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(1, parsed), pageCount);
}
