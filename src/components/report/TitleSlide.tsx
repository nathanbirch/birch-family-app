"use client";

import { StarGlyph } from "./StarGlyph";

/**
 * The curtain.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A BUTTON AT ALL
 * ---------------------------------------------------------------------------
 * Every browser refuses to play audio until somebody has interacted with the
 * page, and quite right too. That constraint happens to agree with what an
 * award ceremony should be anyway: it starts when the room is ready, not when
 * the page finishes loading. So the music, the first slide and the sense that
 * something is about to happen all hang off one deliberate tap.
 *
 * It is also the honest place to say the ceremony can be dragged through,
 * which is otherwise a gesture nobody would guess at — there are no arrows and
 * no dots anywhere in this thing.
 */
export function TitleSlide({
  dateLabel,
  title,
  childCount,
  onStart,
  started,
}: {
  /** e.g. "Aug 3 – Aug 7". */
  dateLabel: string;
  /** The ceremony's own name, when it has one. See `AwardCeremony`. */
  title?: string;
  childCount: number;
  onStart: () => void;
  /** Once it has begun, the button stops asking and becomes a signpost. */
  started: boolean;
}) {
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden px-6 py-8 text-center"
      style={{
        /*
          The theme's own colour, taken down towards black. Every stop is mixed
          rather than used raw because one of the ten themes (Midnight) has a
          pale sky blue as its primary, and white type on that is about 3:1 —
          the app's `--color-on-primary` exists for exactly that case, but it
          cannot be used here: the gradient darkens as it goes, so a theme with
          dark on-primary text would end up dark on dark. Mixing the *surface*
          down instead keeps white correct on all ten.
        */
        background:
          "radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--color-primary) 62%, #000000) 0%, color-mix(in srgb, var(--color-primary) 42%, #000000) 60%, color-mix(in srgb, var(--color-primary) 30%, #000000) 100%)",
        color: "#ffffff",
      }}
    >
      {/* Three stars, drifting in at the top. Decoration, and nothing else. */}
      <span aria-hidden="true" className="flex items-center gap-2">
        <StarGlyph className="h-6 w-6 opacity-70" />
        <StarGlyph className="h-9 w-9" />
        <StarGlyph className="h-6 w-6 opacity-70" />
      </span>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-[0.28em] opacity-75">
          {dateLabel}
        </p>
        <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          {title ?? (
            <>
              The Birch Family
              <br />
              Star Awards
            </>
          )}
        </h2>
      </div>

      <button
        type="button"
        onClick={onStart}
        className="flex items-center gap-2.5 rounded-full px-7 py-3 text-lg font-extrabold transition-transform active:scale-95"
        style={{ backgroundColor: "var(--color-star)", color: "#4a3200" }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <path d="M8 5.6c0-.8.9-1.3 1.6-.9l8 6.4c.6.5.6 1.3 0 1.8l-8 6.4c-.7.4-1.6-.1-1.6-.9Z" />
        </svg>
        {started ? "Start again" : "Start the ceremony"}
      </button>

      <p className="max-w-xs text-sm font-semibold leading-snug opacity-80">
        {childCount} {childCount === 1 ? "award" : "awards"}, one at a time.
        Drag sideways to go at your own pace.
      </p>
    </div>
  );
}
