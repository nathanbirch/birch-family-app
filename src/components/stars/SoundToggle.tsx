"use client";

/**
 * The speaker button in the star charts' header.
 *
 * Small, and next to the child's name rather than buried on the account page,
 * because the moment you want it is the moment it has just gone off — in a
 * quiet room, with a baby asleep, or in the back of the car. A preference you
 * have to go looking for is one people solve by turning the whole phone down
 * instead.
 */
export function SoundToggle({
  on,
  onChange,
  labels = { on: "Turn the cheering off", off: "Turn the cheering on" },
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  /**
   * What the switch says it will do, in each state.
   *
   * The same button and the same stored preference silence the ceremony music
   * on the weekly report, where "turn the cheering off" would be describing
   * the wrong sound. It is one preference on purpose — a family that has
   * turned this phone's noises off has turned them off.
   */
  labels?: { on: string; off: string };
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? labels.on : labels.off}
      onClick={() => onChange(!on)}
      className="themed-transition flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
      style={{
        backgroundColor: on
          ? "color-mix(in srgb, var(--color-star) 22%, transparent)"
          : "transparent",
        color: on ? "var(--color-star-ink)" : "var(--color-text-muted)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* The speaker cone itself, which both states share. */}
        <path d="M4 9.5h3.2L11.5 6v12L7.2 14.5H4z" />
        {on ? (
          // Two arcs rather than three: at 20px the third is a smudge.
          <path d="M14.8 9.2a4 4 0 0 1 0 5.6M17.4 6.8a7.6 7.6 0 0 1 0 10.4" />
        ) : (
          <path d="m15.2 9.8 4.4 4.4M19.6 9.8l-4.4 4.4" />
        )}
      </svg>
    </button>
  );
}
