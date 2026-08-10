import Link from "next/link";

/**
 * Older / newer, and where you are.
 *
 * Two links and a count, and no numbered pages. Numbered pages are for a list
 * somebody searches; this one is walked, a week at a time, and by the time
 * there are enough reports for page seven to exist nobody will be aiming at
 * page seven — they will be aiming at a *month*, which is a different feature
 * and should be a date jump rather than twenty little numbers.
 *
 * The ends are rendered as spans rather than as disabled links, so there is
 * never a tappable thing that does nothing.
 */
export function ReportPager({
  page,
  pageCount,
}: {
  /** 1-based. */
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="More reports"
      className="mt-4 flex items-center justify-between gap-3"
    >
      <Step href={page > 1 ? hrefFor(page - 1) : null} direction="newer" />
      <p
        className="text-sm font-semibold tabular-nums"
        style={{ color: "var(--color-text-muted)" }}
      >
        Page {page} of {pageCount}
      </p>
      <Step href={page < pageCount ? hrefFor(page + 1) : null} direction="older" />
    </nav>
  );
}

/** Page one is the bare path — a `?page=1` in the address bar is noise. */
function hrefFor(page: number): string {
  return page <= 1 ? "/ceremonies" : `/ceremonies?page=${page}`;
}

function Step({
  href,
  direction,
}: {
  href: string | null;
  direction: "newer" | "older";
}) {
  const label = direction === "newer" ? "Newer" : "Older";
  const arrow = direction === "newer" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7";

  const content = (
    <>
      {direction === "newer" ? <Chevron path={arrow} /> : null}
      {label}
      {direction === "older" ? <Chevron path={arrow} /> : null}
    </>
  );

  const className =
    "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold";

  if (!href) {
    return (
      <span
        className={className}
        style={{ color: "var(--color-text-muted)", opacity: 0.4 }}
        aria-hidden="true"
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`${className} transition-transform active:scale-95`}
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        color: "var(--color-primary)",
      }}
    >
      {content}
    </Link>
  );
}

function Chevron({ path }: { path: string }) {
  return (
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
      <path d={path} />
    </svg>
  );
}
