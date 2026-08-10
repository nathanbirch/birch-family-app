"use client";

/**
 * One star: the tap target the whole page exists for.
 *
 * Sized at 44px on a phone because that is the smallest square a thumb hits
 * reliably, and this is a chart a four-year-old fills in himself. The outline
 * state is a real outline rather than a faded fill, so "not yet" reads as an
 * empty shape to colour in — the same thing the paper chart asks for.
 */

export function StarButton({
  filled,
  label,
  isToday,
  locked,
  onToggle,
}: {
  filled: boolean;
  /** Full sentence for screen readers, e.g. "Piano practice on Wednesday". */
  label: string;
  isToday: boolean;
  /**
   * Any day that is not today: the star still shows what happened, but it
   * cannot be changed. See `openDayIndex()` in `lib/stars/week.ts` for why.
   */
  locked: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={filled}
      aria-label={
        // Spoken as part of the star's own sentence rather than left to the
        // `disabled` state alone, because "dimmed" is the whole of what a
        // sighted child gets and a screen reader should hear the reason.
        locked ? `${label} — only today can be coloured in` : label
      }
      /*
       * `disabled` rather than a no-op handler: it takes the star out of the
       * tab order and stops the tap from being announced as an action at all,
       * which is the honest description of a column that is closed.
       */
      disabled={locked}
      onClick={() => onToggle(!filled)}
      className={`star-button flex h-11 w-11 items-center justify-center rounded-xl transition-transform${
        locked ? "" : " active:scale-90"
      }`}
      style={{
        // Today's column gets a faint wash so a child looking for "which one
        // do I colour in now" finds it without reading the letters on top.
        backgroundColor: isToday
          ? "color-mix(in srgb, var(--color-accent) 14%, transparent)"
          : "transparent",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-7 w-7${filled ? " star-pop" : ""}`}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 1 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          color: filled ? "var(--color-star)" : "var(--color-text-muted)",
          /*
           * A locked star that was earned stays gold and only slightly faded —
           * Monday's star is still Monday's star on Thursday. A locked *empty*
           * one fades much further, so the column a child can actually colour
           * in is the one the eye lands on.
           */
          opacity: filled ? (locked ? 0.7 : 1) : locked ? 0.22 : 0.55,
        }}
        aria-hidden="true"
      >
        <path d="m12 3.6 2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 10l6-.9Z" />
      </svg>
    </button>
  );
}
