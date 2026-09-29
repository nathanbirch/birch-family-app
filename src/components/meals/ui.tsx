/**
 * The handful of small controls every part of the Meals page shares, so the
 * list, the sheet, the plan, the price book and the editors look like one
 * page rather than five.
 */

export const FIELD_CLASS = "w-full rounded-xl border px-3 py-2 text-sm";

export const FIELD_STYLE: React.CSSProperties = {
  borderColor: "var(--color-border)",
  backgroundColor: "var(--color-surface)",
  color: "var(--color-text)",
};

export const PRIMARY_STYLE: React.CSSProperties = {
  backgroundColor: "var(--color-primary)",
  color: "var(--color-on-primary)",
};

export const QUIET_STYLE: React.CSSProperties = {
  backgroundColor: "var(--color-surface-muted)",
  color: "var(--color-text)",
};

/**
 * A quiet control that sits directly on the page background rather than
 * inside a card — where `QUIET_STYLE`'s muted fill is nearly the page's own
 * colour and the button would all but disappear.
 */
export const ON_PAGE_STYLE: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
};

export const MUTED_TEXT: React.CSSProperties = { color: "var(--color-text-muted)" };

/** The one red in the app, used for warnings and destructive buttons. */
export const WARNING_COLOR = "#c0392b";

/** A labelled number: the tiles at the top of the list and the plan. */
export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div
      className="flex min-w-0 flex-col rounded-2xl px-3 py-2.5"
      style={{ backgroundColor: "var(--color-surface-muted)" }}
    >
      <span className="text-[0.65rem] font-bold uppercase tracking-wider" style={MUTED_TEXT}>
        {label}
      </span>
      <span className="truncate text-lg font-extrabold leading-tight tabular-nums">{value}</span>
      {detail ? (
        <span className="truncate text-xs" style={MUTED_TEXT}>
          {detail}
        </span>
      ) : null}
    </div>
  );
}

/** − 7 + */
export function Stepper({
  value,
  min = 1,
  max,
  onChange,
  label,
  disabled,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  /** What is being counted, for the buttons' labels: "servings". */
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold disabled:opacity-40"
        style={QUIET_STYLE}
      >
        −
      </button>
      <span className="min-w-[2ch] text-center text-sm font-extrabold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold disabled:opacity-40"
        style={QUIET_STYLE}
      >
        +
      </button>
    </span>
  );
}

/** A small rounded label. `auto` ones are computed from the numbers and drawn outlined. */
export function TagChip({ tag, auto = false }: { tag: string; auto?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-bold"
      style={
        auto
          ? { border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }
          : { backgroundColor: "var(--color-surface-muted)", color: "var(--color-text)" }
      }
    >
      {tag}
    </span>
  );
}

/** The heart, filled or not. */
export function HeartIcon({ filled, className = "h-5 w-5" }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z" />
    </svg>
  );
}

/** A die, for "surprise me". */
export function DiceIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
