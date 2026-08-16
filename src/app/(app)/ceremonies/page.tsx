import type { Metadata } from "next";

import { ReportHeroCard } from "@/components/report/ReportHeroCard";
import { SpanCeremonyCard } from "@/components/report/SpanCeremonyCard";
import { ReportPager } from "@/components/report/ReportPager";
import { ReportRow } from "@/components/report/ReportRow";
import { visibleSpanCeremonies } from "@/config/ceremonies";
import { requireUser } from "@/lib/auth/dal";
import { addDays, formatDateRange, parseLocalDate, toIsoDate } from "@/lib/dates";
import { familyNow } from "@/lib/family-api/time";
import { getMarksForWeeks, listStarWeekStarts } from "@/lib/stars/marks";
import {
  buildSpanReport,
  buildWeekReport,
  ceremonyDateFor,
  ceremonyDateLabel,
  reportableWeeks,
} from "@/lib/stars/report";
import { getChorePools } from "@/lib/stars/rotation-store";

export const metadata: Metadata = {
  title: "Ceremonies",
};

/** How many older weeks are listed on one page. */
const PER_PAGE = 10;

/**
 * Every weekly report, newest first.
 *
 * The latest finished week gets the card at the top — it sits there for seven
 * days, until the next Sunday makes a new one — and everything older is a
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
 * Rexburg is six or seven hours behind — so from Saturday teatime onwards a
 * server-clock page would have already published a ceremony for a week that,
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

  const family = familyNow();
  const now = family.civilNoon;
  /*
   * The ceremonies that span several weeks, and whether tonight is one of the
   * nights they can be watched. `family.date` is Rexburg's calendar day rather
   * than the server's, which is the whole point: a window that closes at
   * midnight has to close at midnight *there*, not at six in the evening
   * because Vercel is already on tomorrow. See `config/ceremonies.ts`.
   */
  const spans = visibleSpanCeremonies(family.date);

  const stored = await listStarWeekStarts();
  const weeks = reportableWeeks(stored, now);

  const [featuredWeek, ...older] = weeks;
  const pageCount = Math.max(1, Math.ceil(older.length / PER_PAGE));
  const page = clampPage((await searchParams).page, pageCount);
  const listed = older.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  /*
   * One read for everything on the page, spans included. A span's weeks are
   * usually already in the list underneath it, and asking for a week twice
   * costs nothing here — `getMarksForWeeks` de-duplicates through the `$in`
   * and keys the answer by week.
   */
  const [pools, marks] = await Promise.all([
    getChorePools(),
    getMarksForWeeks([
      featuredWeek,
      ...listed,
      ...spans.flatMap((span) => span.weekStarts),
    ]),
  ]);

  const featured = buildWeekReport(
    pools,
    // `reportableWeeks` only ever returns Mondays it produced itself, so this
    // cannot be null — but the fallback keeps the page rendering rather than
    // throwing if that ever stops being true.
    parseLocalDate(featuredWeek) ?? now,
    marks[featuredWeek],
  );

  const spanCards = spans.map((span) => ({
    span,
    report: buildSpanReport(
      pools,
      span.id,
      span.weekStarts.map((week) => ({
        monday: parseLocalDate(week) ?? now,
        marks: marks[week],
      })),
    ),
    // The window closes at midnight, so "the last night" is simply the day
    // before it — which is what lets the card say "tonight only" honestly
    // rather than saying it for a fortnight.
    lastNight:
      span.hiddenFrom === toIsoDate(addDays(now, 1)),
  }));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <header className="animate-soft-fade mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Ceremonies
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Sunday afternoons: every star of the week, and what it was worth.
        </p>
      </header>

      {/*
        Above the weekly card, and only on the first page. A span ceremony is
        an event with a night attached to it: it has to be the first thing on
        the page while it is up, and it must not follow somebody into the
        archive on page three.
      */}
      {page === 1
        ? spanCards.map(({ span, report, lastNight }) => (
            <SpanCeremonyCard
              key={span.id}
              report={report}
              title={span.title}
              blurb={span.blurb}
              dateLabel={formatDateRange(
                parseLocalDate(report.weekStart) ?? now,
                parseLocalDate(report.weekEnd) ?? now,
              )}
              lastNight={lastNight}
            />
          ))
        : null}

      {page === 1 ? (
        <ReportHeroCard
          report={featured}
          dateLabel={ceremonyDateLabel(featured.ceremonyDate)}
        />
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
                  dateLabel={ceremonyDateLabel(ceremonyDateFor(week))}
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
