"use client";

/**
 * Hold the ceremony where it is, or let it carry on.
 *
 * ---------------------------------------------------------------------------
 * WHY A CEREMONY NEEDS A PAUSE AT ALL
 * ---------------------------------------------------------------------------
 * The slides turn on a timer because an awards night should run itself — the
 * whole design is that somebody presses Start and then puts the iPad down.
 * What a timer cannot know is that the room is still clapping.
 *
 * So this is not a "pause" in the sense a video player means it. Nothing is
 * being interrupted: the music keeps going, the slide keeps its own
 * choreography, and the only thing that stops is the clock that would have
 * moved everybody on. It is the difference between a ceremony that runs and a
 * ceremony that can be *held* while a four-year-old takes a bow.
 *
 * ---------------------------------------------------------------------------
 * WHY IT SAYS WHAT IT DOES RATHER THAN SHOWING A SYMBOL
 * ---------------------------------------------------------------------------
 * The speaker beside it is an icon and gets away with it, because a crossed-out
 * speaker is the most universally understood symbol in software. A pause bar is
 * nearly as well understood *on a video* — but this is not a video, and a bare
 * ⏸ next to a slideshow reads as "stop the music" to about half the people who
 * see it. The music is exactly what it does not do.
 *
 * So it carries the word as well as the mark, and the word is "Hold" rather
 * than "Pause" for the same reason: it is what somebody actually calls out
 * across a kitchen when a child is still being clapped at.
 */
export function HoldToggle({
  held,
  disabled = false,
  onChange,
}: {
  held: boolean;
  /** True on the title card and the finale, which have no clock to hold. */
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={held}
      disabled={disabled}
      onClick={() => onChange(!held)}
      className="themed-transition flex h-10 shrink-0 items-center gap-1.5 rounded-full pe-3.5 ps-3 text-sm font-bold transition-transform active:scale-95 disabled:opacity-0"
      style={{
        backgroundColor: held
          ? "var(--color-primary)"
          : "var(--color-surface-muted)",
        color: held ? "var(--color-on-primary)" : "var(--color-text-muted)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="currentColor"
        aria-hidden="true"
      >
        {held ? (
          // A play triangle: what pressing it will do next.
          <path d="M8 5.4v13.2a1 1 0 0 0 1.53.85l10.2-6.6a1 1 0 0 0 0-1.7L9.53 4.55A1 1 0 0 0 8 5.4Z" />
        ) : (
          <path d="M8.4 4.6h2.6a1 1 0 0 1 1 1v12.8a1 1 0 0 1-1 1H8.4a1 1 0 0 1-1-1V5.6a1 1 0 0 1 1-1Zm4.6 0h2.6a1 1 0 0 1 1 1v12.8a1 1 0 0 1-1 1H13a1 1 0 0 1-1-1V5.6a1 1 0 0 1 1-1Z" />
        )}
      </svg>
      {/*
        The label changes to what the button will *do*, not to what is
        happening. "Held" on a button is a status; "Go on" is an offer, and a
        button should be an offer.
      */}
      {held ? "Go on" : "Hold"}
    </button>
  );
}
