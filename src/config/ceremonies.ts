/**
 * Ceremonies that cover more than one week, and when they may be watched.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ARE LISTED BY HAND
 * ---------------------------------------------------------------------------
 * The weekly ceremonies need no configuration at all: a week finishes, and
 * there is a ceremony for it. That is the whole design, and it is why there is
 * no `reports` collection (see `lib/stars/report.ts`).
 *
 * A ceremony that spans several weeks is a different kind of thing. It is not
 * produced by the calendar — somebody decides that these three weeks belong
 * together and are worth watching in one sitting, gives it a name, and often
 * wants it in front of the family for one evening rather than for ever. None
 * of that can be derived, so it is written down, and it is written down *here*
 * rather than in the database for the same reason the star tasks are: it is
 * content, it is reviewed, and it changes by deploy.
 *
 * Nothing about a span is stored either. It is still `starWeeks` read back
 * through `buildSpanReport()`, so correcting a star in one of the weeks
 * corrects the span too, and the span can never disagree with the individual
 * weeks it is made of.
 *
 * ---------------------------------------------------------------------------
 * THE VISIBILITY WINDOW IS A CALENDAR DATE, IN REXBURG
 * ---------------------------------------------------------------------------
 * `hiddenFrom` is a date, and it means **midnight at the start of that date,
 * on the family's clock** — so `"2026-08-11"` is exactly "gone at 12:00 AM
 * Mountain Time on the 11th", and the ceremony is watchable all through the
 * evening of the 10th.
 *
 * A date rather than a timestamp because the boundary anybody actually asks
 * for is midnight, and because a date makes the comparison a string comparison
 * against `familyNow().date` — no parsing, no instant arithmetic, and no way
 * for the server's UTC clock to take the thing off the page at six in the
 * evening. See `isCeremonyVisible()`.
 *
 * When it is hidden it is *gone*, not greyed out: the card disappears from
 * `/ceremonies` and the page itself 404s. A ceremony that has had its evening
 * should not be a dead link on somebody's home screen.
 */

export type SpanCeremony = {
  /**
   * The segment under `/ceremonies`, and the report's `slug`.
   *
   * Must not look like a `YYYY-MM-DD` Monday — that is what the weekly
   * ceremonies are addressed by, and `ceremonies.test.ts` fails if one of
   * these could be mistaken for a date.
   */
  id: string;
  /** The heading on the card and on the ceremony's title slide. */
  title: string;
  /** One line under it, on the card. Ours, not off any chart. */
  blurb: string;
  /**
   * The Mondays it covers, `YYYY-MM-DD`, oldest first. Every one must be a
   * week that has finished — a span containing the current week would be a
   * ceremony for days that have not happened.
   */
  weekStarts: readonly string[];
  /**
   * Watchable from midnight at the start of this date, or from the moment it
   * ships if it is left out.
   */
  visibleFrom?: string;
  /** Gone from midnight at the start of this date. Family clock. */
  hiddenFrom: string;
};

export const SPAN_CEREMONIES: readonly SpanCeremony[] = [
  {
    id: "summer-so-far",
    title: "Summer So Far",
    blurb: "Three weeks of stars, read out in one sitting.",
    // Every week the charts have ever been kept: the two back-filled off the
    // photographs on the fridge, and the first week the app itself recorded.
    weekStarts: ["2026-07-20", "2026-07-27", "2026-08-03"],
    // One evening only — Monday the 10th. Gone at midnight.
    hiddenFrom: "2026-08-11",
  },
] as const;

/**
 * Whether a ceremony may be watched on `today` (`YYYY-MM-DD`, family clock).
 *
 * String comparison rather than date arithmetic, and safely so: ISO dates sort
 * as strings exactly as they sort as calendar days. `hiddenFrom` is exclusive
 * — the ceremony is visible up to and including the day before it — which is
 * what makes "hidden from the 11th" mean what somebody saying it out loud
 * means.
 */
export function isCeremonyVisible(
  ceremony: SpanCeremony,
  today: string,
): boolean {
  if (ceremony.visibleFrom && today < ceremony.visibleFrom) return false;
  return today < ceremony.hiddenFrom;
}

/** The span ceremonies watchable today, in configured order. */
export function visibleSpanCeremonies(today: string): SpanCeremony[] {
  return SPAN_CEREMONIES.filter((ceremony) => isCeremonyVisible(ceremony, today));
}

/**
 * One by id, **only if it may be watched today**.
 *
 * Visibility is checked here rather than by the caller on purpose: this is the
 * lookup the page uses to decide whether a URL exists at all, and a version of
 * it that returned hidden ceremonies would be a hole somebody could walk
 * through by typing the id.
 */
export function getVisibleSpanCeremony(
  id: string,
  today: string,
): SpanCeremony | undefined {
  return SPAN_CEREMONIES.find(
    (ceremony) => ceremony.id === id && isCeremonyVisible(ceremony, today),
  );
}
