import Link from "next/link";

import { formatMoney } from "@/config/rewards";
import { STAR_RATE_LABEL, type WeekReport } from "@/lib/stars/report";

import { StarGlyph } from "./StarGlyph";

/**
 * A ceremony covering several weeks, above everything else on the page.
 *
 * ---------------------------------------------------------------------------
 * WHY IT DOES NOT LOOK LIKE THE WEEKLY CARD
 * ---------------------------------------------------------------------------
 * `ReportHeroCard` is gold, because gold is what a star is and the weekly
 * report is the page's own celebration. Making this one gold too would put two
 * near-identical cards on top of each other, and the first thing anybody would
 * have to do is read them to tell which was which.
 *
 * So this is the theme's colour rather than the star's, and it is deliberately
 * a *poster* — a name, a date range, a number — rather than a scoreboard with
 * five faces on it. It is a one-off event with a title; the card should read
 * like an invitation to it, and the weekly card underneath should still read
 * as the thing that is there every Monday.
 *
 * It says how long it will be up for, because it will not be up for long. A
 * card that quietly disappears overnight is worse than one that said so.
 */
export function SpanCeremonyCard({
  report,
  title,
  blurb,
  dateLabel,
  lastNight,
}: {
  report: WeekReport;
  title: string;
  blurb: string;
  /** e.g. "Jul 20 – Aug 7". */
  dateLabel: string;
  /** `true` on the final evening it can be watched. */
  lastNight: boolean;
}) {
  return (
    <Link
      href={`/ceremonies/${report.slug}`}
      className="app-card animate-soft-rise mb-4 block overflow-hidden p-0 transition-transform active:scale-[0.99]"
    >
      <div
        className="relative flex flex-col items-center gap-2 px-5 py-6 text-center"
        style={{
          /*
            Same trick as the ceremony's own title slide: every stop is the
            theme's primary *mixed down towards black* rather than used raw,
            because one of the ten themes has a pale sky blue as its primary
            and white on it is about 3:1.
          */
          background:
            "radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--color-primary) 66%, #000000) 0%, color-mix(in srgb, var(--color-primary) 44%, #000000) 60%, color-mix(in srgb, var(--color-primary) 30%, #000000) 100%)",
          color: "#ffffff",
        }}
      >
        <p className="text-xs font-extrabold uppercase tracking-[0.24em] opacity-80">
          {report.weekCount} weeks · one ceremony
        </p>
        <h2 className="text-3xl font-extrabold leading-tight tracking-tight">
          {title}
        </h2>
        <p className="text-sm font-semibold opacity-85">{dateLabel}</p>

        <p className="mt-1 flex items-center gap-2">
          <StarGlyph className="h-8 w-8" color="var(--color-star)" />
          <span className="text-5xl font-extrabold tabular-nums leading-none">
            {report.earned}
          </span>
        </p>
        <p className="-mt-1 text-sm font-bold opacity-90">
          stars altogether · {formatMoney(report.cents)} at {STAR_RATE_LABEL}
        </p>

        <span
          className="mt-2 rounded-full px-5 py-2 text-base font-extrabold"
          style={{ backgroundColor: "var(--color-star)", color: "#4a3200" }}
        >
          Watch the ceremony
        </span>

        <p className="mt-1 text-xs font-semibold opacity-75">{blurb}</p>
        {lastNight ? (
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] opacity-90">
            Tonight only
          </p>
        ) : null}
      </div>
    </Link>
  );
}
