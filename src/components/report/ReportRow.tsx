import Link from "next/link";

import { formatMoney } from "@/config/rewards";
import type { WeekReport } from "@/lib/stars/report";

import { StarGlyph } from "./StarGlyph";

/**
 * One older week, in the list underneath the card.
 *
 * Deliberately plain. The report that matters is the one at the top; these are
 * the archive, and an archive is for finding a week rather than for being
 * impressed by it. Date first, because that is what somebody is scanning for,
 * and the total after it.
 *
 * The whole row is the link. A row where only the date is tappable is a row
 * that gets tapped in the wrong place.
 */
export function ReportRow({
  report,
  dateLabel,
}: {
  report: WeekReport;
  dateLabel: string;
}) {
  return (
    <Link
      href={`/report/${report.weekStart}`}
      className="app-card themed-transition flex items-center gap-3 p-4 transition-transform active:scale-[0.98]"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--color-star) 24%, var(--color-surface))",
        }}
      >
        <StarGlyph className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{dateLabel}</span>
        <span
          className="mt-0.5 block text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          {report.earned} of {report.possible} stars · {formatMoney(report.cents)}
        </span>
      </span>

      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--color-text-muted)" }}
        aria-hidden="true"
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  );
}
