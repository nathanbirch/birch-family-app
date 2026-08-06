import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { getPerson } from "@/config/family";
import { formatMoney } from "@/config/rewards";
import { STAR_RATE_LABEL, type WeekReport } from "@/lib/stars/report";

import { StarGlyph } from "./StarGlyph";

/**
 * The newest report, at the top of the page.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS A CARD AND NOT THE CEREMONY ITSELF
 * ---------------------------------------------------------------------------
 * The obvious move is to put the slides straight on `/report` and have them
 * start playing. Two things stop that being right. The music cannot start
 * without a tap in any case (see `AwardCeremony`), so something has to be
 * pressed — and the page is *also* the archive, so opening it to find last
 * March would mean scrolling past a ceremony that had begun without being
 * asked. The card is the invitation; the ceremony is behind it.
 *
 * It shows the totals up front rather than hiding them, which sounds like it
 * gives away the ending. It does not: the numbers on this card are the
 * family's week, and the ceremony is the five children's weeks, one at a time,
 * which is the part nobody can read off a card.
 *
 * It stays here for seven days, because "the latest finished week" only
 * changes at midnight on a Monday. See `latestCompletedWeekStart()`.
 */
export function ReportHeroCard({
  report,
  dateLabel,
}: {
  report: WeekReport;
  /** e.g. "Aug 3 – Aug 7". */
  dateLabel: string;
}) {
  const empty = report.earned === 0;

  return (
    <Link
      href={`/report/${report.weekStart}`}
      className="app-card animate-soft-rise block overflow-hidden p-0 transition-transform active:scale-[0.99]"
    >
      {/*
        The bright half. Gold rather than the theme's own colour: this is the
        one card in the app that is a celebration rather than a destination,
        and gold is what a star is on every theme.
      */}
      <div
        className="relative flex flex-col items-center gap-3 px-5 py-6 text-center"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--color-star) 88%, #ffffff) 0%, var(--color-star) 45%, #d99400 100%)",
          color: "#4a3200",
        }}
      >
        <p className="text-xs font-extrabold uppercase tracking-[0.24em] opacity-80">
          Last week&rsquo;s report
        </p>
        <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          {dateLabel}
        </h2>

        <p className="flex items-center gap-2">
          <StarGlyph className="h-8 w-8" color="#4a3200" />
          <span className="text-5xl font-extrabold tabular-nums leading-none">
            {report.earned}
          </span>
        </p>
        <p className="-mt-1 text-sm font-bold">
          {empty
            ? "No stars ticked last week"
            : `stars together · ${formatMoney(report.cents)} at ${STAR_RATE_LABEL}`}
        </p>

        <span className="mt-1 rounded-full bg-white px-5 py-2 text-base font-extrabold">
          Watch the ceremony
        </span>
      </div>

      {/* The five of them, with what each one earned. */}
      <ul className="flex items-start justify-between gap-1 px-3 py-4 sm:px-5">
        {[...report.children].reverse().map((child) => (
          <li
            key={child.childId}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <span className="block w-full max-w-[3.25rem]">
              <Avatar member={getPerson(child.childId)} showName={false} arriving />
            </span>
            <span
              className="truncate text-xs font-bold"
              style={{ color: "var(--color-text)" }}
            >
              {child.name}
            </span>
            <span
              className="text-xs font-bold tabular-nums"
              style={{ color: "var(--color-star-ink)" }}
            >
              {child.earned} ⭐
            </span>
          </li>
        ))}
      </ul>
    </Link>
  );
}
