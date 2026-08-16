"use client";

import {
  NOTE_INKS,
  NOTE_NIBS,
  NOTE_PAPERS,
  NOTE_TOOLS,
  noteInk,
  type NoteNib,
  type NotePaper,
  type NoteTool,
} from "@/config/note";

/**
 * The tray under the pad.
 *
 * Themed, unlike the pad itself — this is app chrome, not paper, and it should
 * follow whatever theme the family is on. The only fixed colours in here are
 * the eight ink swatches, which have to be the actual inks or the swatch is
 * lying about what it will draw with.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TOOLS ARE PICTURES AND THE INKS ARE NOT
 * ---------------------------------------------------------------------------
 * A tool needs its drawing *and* its word, because "marker" and "highlighter"
 * are not obviously different objects to a six-year-old and the two nibs look
 * similar at this size. An ink needs neither: a circle of red is the most
 * complete possible description of red, and the label would be the only text
 * on the row nobody reads. The word is still there for screen readers.
 *
 * Every target is at least 44px, the same floor the bottom bar uses, because
 * this is tapped by the same thumbs — and, on the pad, by the tip of a pencil
 * that is less accurate than a finger, not more.
 */

export type NoteToolbarProps = {
  tool: NoteTool;
  onToolChange: (tool: NoteTool) => void;
  ink: string;
  onInkChange: (ink: string) => void;
  nib: NoteNib;
  onNibChange: (nib: NoteNib) => void;
  paper: NotePaper;
  onPaperChange: (paper: NotePaper) => void;
  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  /**
   * `true` once Clear has been tapped and is waiting to be confirmed.
   *
   * The confirmation lives in the parent rather than here because it has to be
   * cancelled by things this component never hears about — a new stroke, a
   * timeout, leaving the page.
   */
  clearArmed: boolean;
  onClear: () => void;
};

export function NoteToolbar({
  tool,
  onToolChange,
  ink,
  onInkChange,
  nib,
  onNibChange,
  paper,
  onPaperChange,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  clearArmed,
  onClear,
}: NoteToolbarProps) {
  return (
    <div
      className="app-card themed-transition mt-3 flex flex-col gap-3 p-3 sm:mt-4 sm:p-4"
      /*
       * The toolbar is never the thing the pencil is aimed at while writing,
       * but a palm resting past the edge of the pad lands here. `touch-action`
       * is left alone — these are ordinary buttons and should scroll the page
       * like ordinary buttons — but text selection is off, because dragging a
       * pencil across a label otherwise selects the word and pops the iPad's
       * copy menu over the pad.
       */
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ToolGroup label="Tool">
          {NOTE_TOOLS.map((spec) => (
            <ToolButton
              key={spec.id}
              selected={tool === spec.id}
              label={spec.label}
              onClick={() => onToolChange(spec.id)}
            >
              <ToolGlyph tool={spec.id} />
            </ToolButton>
          ))}
        </ToolGroup>

        <ToolGroup label="Size">
          {NOTE_NIBS.map((option) => (
            <ToolButton
              key={option.id}
              selected={nib.id === option.id}
              label={option.label}
              onClick={() => onNibChange(option)}
            >
              {/*
                A dot at roughly the size the nib actually draws, so the choice
                is shown rather than named. Small/Medium/Large as words would
                need reading; three dots of increasing size do not.
              */}
              <span
                aria-hidden="true"
                className="block rounded-full bg-current"
                style={{
                  width: `${4 + NOTE_NIBS.indexOf(option) * 4}px`,
                  height: `${4 + NOTE_NIBS.indexOf(option) * 4}px`,
                }}
              />
            </ToolButton>
          ))}
        </ToolGroup>

        <ToolGroup label="History">
          <ToolButton
            selected={false}
            disabled={!canUndo}
            label="Undo"
            onClick={onUndo}
          >
            <UndoGlyph />
          </ToolButton>
          <ToolButton
            selected={false}
            disabled={!canRedo}
            label="Redo"
            onClick={onRedo}
          >
            <UndoGlyph flipped />
          </ToolButton>
        </ToolGroup>

        {/*
          Pushed to the far end on a wide screen and simply last in the wrap on
          a narrow one. Clear is the one destructive control on the page and it
          should never sit next to a control somebody is tapping repeatedly.
        */}
        <div className="ms-auto">
          <ClearButton armed={clearArmed} onClick={onClear} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ToolGroup label="Ink">
          {NOTE_INKS.map((option) => {
            const selected = ink === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onInkChange(option.id)}
                className="flex h-11 w-9 items-center justify-center rounded-xl transition-transform active:scale-90"
                title={option.label}
              >
                <span className="sr-only">{option.label}</span>
                {/*
                  The selected swatch grows and takes a ring in the *theme's*
                  colour rather than its own — a red ring around a red dot is
                  invisible, which is precisely the swatch you most need to be
                  able to see is selected.
                */}
                <span
                  aria-hidden="true"
                  className="block rounded-full transition-all"
                  style={{
                    width: selected ? "1.6rem" : "1.25rem",
                    height: selected ? "1.6rem" : "1.25rem",
                    backgroundColor: option.hex,
                    boxShadow: selected
                      ? "0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-primary)"
                      : "0 1px 2px var(--color-shadow)",
                  }}
                />
              </button>
            );
          })}
        </ToolGroup>

        <ToolGroup label="Paper">
          {NOTE_PAPERS.map((option) => (
            <ToolButton
              key={option.id}
              selected={paper === option.id}
              label={option.label}
              onClick={() => onPaperChange(option.id)}
            >
              <PaperGlyph paper={option.id} />
            </ToolButton>
          ))}
        </ToolGroup>
      </div>
    </div>
  );
}

/**
 * A labelled cluster of controls.
 *
 * The label is for screen readers only. On screen the grouping is done with a
 * hairline and spacing, which is enough for a sighted user and keeps a tray of
 * twenty controls from becoming a wall of small print.
 */
function ToolGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-1 rounded-2xl p-1"
      style={{ backgroundColor: "var(--color-surface-muted)" }}
    >
      {children}
    </div>
  );
}

function ToolButton({
  selected,
  disabled = false,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      title={label}
      className="flex h-11 min-w-11 items-center justify-center rounded-xl px-2 transition-transform active:scale-90 disabled:opacity-35"
      style={{
        backgroundColor: selected ? "var(--color-primary)" : "transparent",
        color: selected ? "var(--color-on-primary)" : "var(--color-text-muted)",
      }}
    >
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}

/**
 * Clear, which asks twice.
 *
 * Undo covers a mistaken stroke; nothing covers a mistaken Clear, and this
 * button sits on a page that five children are encouraged to poke at. A
 * confirmation step is the cheapest possible insurance, and it is done by
 * changing this button into its own confirmation rather than by opening a
 * dialog — a dialog on a touch screen is dismissed by tapping outside it,
 * which is exactly the gesture somebody makes when they want to get back to
 * the pad, and half of them would tap the wrong thing.
 */
function ClearButton({ armed, onClick }: { armed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold transition-transform active:scale-95"
      style={
        armed
          ? { backgroundColor: "#d92d20", color: "#ffffff" }
          : {
              backgroundColor: "var(--color-surface-muted)",
              color: "var(--color-text-muted)",
            }
      }
    >
      <TrashGlyph />
      {armed ? "Tap again" : "Clear"}
    </button>
  );
}

/* ------------------------------------------------------------------------ */
/* Glyphs                                                                    */
/* ------------------------------------------------------------------------ */

/*
 * Drawn on the same 24x24 grid as `NavIcon`, but solid rather than line work.
 * These are *implements* seen end-on in a tray — the same way Apple draws
 * them — and a hollow outline of a pen nib at 22px is a smudge.
 */

const NIB = {
  viewBox: "0 0 24 24",
  fill: "currentColor",
} as const;

function ToolGlyph({ tool }: { tool: NoteTool }) {
  if (tool === "eraser") {
    return (
      <svg {...NIB} className="h-[22px] w-[22px]" aria-hidden="true">
        <path d="M9.4 20h9.3a1 1 0 0 0 0-2h-5.6l7-7a2.2 2.2 0 0 0 0-3.1l-3.6-3.6a2.2 2.2 0 0 0-3.1 0L3.6 12.1a2.2 2.2 0 0 0 0 3.1l4 4a2.2 2.2 0 0 0 1.8.8Zm-4-6.5 4.6-4.6 4.6 4.6-4.1 4.1a.6.6 0 0 1-.8 0l-4.3-4.3Z" />
      </svg>
    );
  }

  if (tool === "highlighter") {
    return (
      <svg {...NIB} className="h-[22px] w-[22px]" aria-hidden="true">
        {/* A chisel tip: the body tapers to a wide flat edge, not a point. */}
        <path d="M14.9 2.9a1.6 1.6 0 0 1 2.3 0l3.9 3.9a1.6 1.6 0 0 1 0 2.3l-7.3 7.3-6.2-6.2Z" />
        <path d="M6.6 11.4l6 6-1.6 1.6H5.2l-1.1-1.9Z" opacity="0.55" />
        <rect x="3" y="20.4" width="18" height="2.2" rx="1.1" opacity="0.35" />
      </svg>
    );
  }

  if (tool === "marker") {
    /*
     * A fat barrel at the pen's angle, with a blunt tip instead of a split
     * nib and no thin tail. Thickness alone is what separates it from the pen,
     * which is exactly right — thickness is the only thing that separates the
     * lines they draw, and an icon that lies about that is worse than one that
     * is merely plain.
     */
    return (
      <svg {...NIB} className="h-[22px] w-[22px]" aria-hidden="true">
        <path d="M16.2 2.5a1.9 1.9 0 0 1 2.7 0l2.6 2.6a1.9 1.9 0 0 1 0 2.7l-2 2-5.3-5.3Z" />
        <path d="M12.8 5.9l5.3 5.3-7.3 7.3a3 3 0 0 1-1.5.8l-4.6 1a1.1 1.1 0 0 1-1.3-1.3l1-4.6a3 3 0 0 1 .8-1.5Z" />
      </svg>
    );
  }

  return (
    <svg {...NIB} className="h-[22px] w-[22px]" aria-hidden="true">
      {/* A fountain-pen nib: long slim body, lying at a writing angle. */}
      <path d="M17.1 2.6a1.5 1.5 0 0 1 2.1 0l2.2 2.2a1.5 1.5 0 0 1 0 2.1l-1.9 1.9-4.3-4.3Z" />
      <path d="M13.8 5.9l4.3 4.3-8.6 8.6-5.9 2.9a.8.8 0 0 1-1-1l2.9-5.9Zm-2.2 7.5-4.2 4.2 1 1 4.2-4.2Z" />
    </svg>
  );
}

function PaperGlyph({ paper }: { paper: NotePaper }) {
  const lines =
    paper === "plain" ? null : paper === "ruled" ? (
      <path
        d="M6.6 9.4h10.8M6.6 12h10.8M6.6 14.6h10.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    ) : (
      <path
        d="M6.6 9.9h10.8M6.6 14.1h10.8M9.9 6.6v10.8M14.1 6.6v10.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    );

  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <rect
        x="4.2"
        y="3.6"
        width="15.6"
        height="16.8"
        rx="2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {lines}
    </svg>
  );
}

function UndoGlyph({ flipped = false }: { flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={flipped ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M4 8.4h8.9a5.6 5.6 0 0 1 0 11.2H8.2" />
      <path d="m7.7 4.6-3.9 3.8 3.9 3.9" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.8 6.6h14.4M9.6 6.6V4.8h4.8v1.8" />
      <path d="M6.6 6.6 7.5 19a1.4 1.4 0 0 0 1.4 1.3h6.2A1.4 1.4 0 0 0 16.5 19l.9-12.4" />
    </svg>
  );
}

/** Exported for the page's own heading, so the ink names stay in one place. */
export function inkLabel(id: string): string {
  return noteInk(id).label;
}
