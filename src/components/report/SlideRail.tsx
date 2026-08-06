"use client";

/**
 * Where you are in the ceremony, and how long this slide has left.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT DOTS AND ARROWS
 * ---------------------------------------------------------------------------
 * A row of dots with a chevron either side is the universal signal for "this
 * is a carousel of adverts, skip it", and it puts two 40px targets over the
 * bottom corners of the thing you are meant to be watching. This is a rail
 * instead: one segment per award, in that child's own colour, filling up as
 * their slide plays. It says the same three things — how many there are, which
 * one this is, how long is left — and it reads as a programme rather than as a
 * widget.
 *
 * The segments are still buttons, so a parent can jump straight to a child who
 * has wandered off, and each one carries that child's name for a screen
 * reader.
 *
 * The fill is a CSS animation whose duration is handed in from `timing.ts` —
 * the same number the auto-advance timer uses — so the bar arriving at the end
 * and the slide turning over are the same moment rather than two that happen
 * to be close.
 */

export type RailSlide = {
  key: string;
  /** Named in the button's accessible label, e.g. "William". */
  label: string;
  /** The segment's colour when it is the current one. */
  color: string;
};

export function SlideRail({
  slides,
  index,
  /** How long the current slide runs for, or `null` when it does not turn. */
  durationMs,
  onSelect,
}: {
  slides: readonly RailSlide[];
  index: number;
  durationMs: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex w-full items-center gap-1.5 px-1">
      {slides.map((slide, position) => {
        const isCurrent = position === index;
        const isPast = position < index;

        return (
          <button
            key={slide.key}
            type="button"
            onClick={() => onSelect(position)}
            aria-label={`Go to ${slide.label}`}
            aria-current={isCurrent ? "true" : undefined}
            // A tall, invisible tap area around a thin bar: the bar is 4px
            // because a thick one is a progress widget, but 4px is not
            // something a thumb can hit.
            className="group flex flex-1 items-center py-3"
          >
            <span
              className="relative block h-1 w-full overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--color-border)" }}
            >
              <span
                // `key` on the fill, so returning to a slide restarts the
                // animation instead of leaving the bar wherever it stopped.
                key={`${slide.key}-${index}`}
                className={`absolute inset-0 block rounded-full${
                  isCurrent && durationMs !== null ? " rail-progress" : ""
                }`}
                style={{
                  backgroundColor: slide.color,
                  opacity: isCurrent || isPast ? 1 : 0,
                  animationDuration:
                    isCurrent && durationMs !== null ? `${durationMs}ms` : undefined,
                  // A slide that never turns — the finale, or a paused one —
                  // shows a full bar rather than one frozen part-way.
                  transform:
                    isCurrent && durationMs === null ? "scaleX(1)" : undefined,
                }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
