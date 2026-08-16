/**
 * Everything you can pick up on the Note page.
 *
 * The inks, the nibs, the three tools and the three papers. All of it is
 * compiled in — there is nothing to fetch and nothing to configure — so the
 * page works with the aeroplane mode on, which is most of the point of a
 * scribble pad.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE COLOURS AND NOT THE THEME'S
 * ---------------------------------------------------------------------------
 * Every other surface in this app takes its colours from the active theme (see
 * `config/themes.ts`). This one does not, and that is deliberate: the note is
 * ink on paper. Ink does not change colour because somebody switched the app
 * to Midnight, and a message written in red must still be red tomorrow on a
 * different theme — otherwise the note would rewrite itself, which is a very
 * strange thing for a note to do.
 *
 * The paper is likewise a fixed warm off-white in every theme. It is the one
 * place in the app where the surface is a physical object rather than a panel.
 */

/** The three things you can draw with, plus the one that undraws. */
export type NoteTool = "pen" | "marker" | "highlighter" | "eraser";

/** The three that actually leave a mark. `eraser` removes whole strokes. */
export type NoteInkTool = Exclude<NoteTool, "eraser">;

export type NoteToolSpec = {
  id: NoteTool;
  /** Shown under the tool in the toolbar, and read out by screen readers. */
  label: string;
  /** Multiplies the chosen nib size. */
  scale: number;
  /**
   * How opaque the ink is, 0-1.
   *
   * The highlighter is the only one under 1, and it is also the only one drawn
   * with `multiply` blending (see `renderStroke`), which is what makes it
   * darken the ink underneath instead of washing it out.
   */
  opacity: number;
  /**
   * Whether width follows pressure.
   *
   * True for the pen, which is what makes an Apple Pencil feel like a pen
   * rather than a mouse. False for the highlighter, because a highlighter with
   * a variable width looks like a leak.
   */
  pressureSensitive: boolean;
  /** `round` for the pen and marker; `square` gives the highlighter its chisel. */
  cap: CanvasLineCap;
};

/**
 * The tool strip, in the order it is shown.
 *
 * Three inks and an eraser is the whole set, and stopping there is a decision
 * rather than a first pass. Apple's own palette has a lasso, a ruler and a
 * colour dropper as well; every one of those is a tool for editing a drawing,
 * and nobody edits a note that says "bins out, dishwasher on, back by six".
 */
export const NOTE_TOOLS: readonly NoteToolSpec[] = [
  {
    id: "pen",
    label: "Pen",
    scale: 1,
    opacity: 1,
    pressureSensitive: true,
    cap: "round",
  },
  {
    id: "marker",
    label: "Marker",
    scale: 2.6,
    opacity: 0.95,
    pressureSensitive: false,
    cap: "round",
  },
  {
    id: "highlighter",
    label: "Highlighter",
    scale: 6,
    opacity: 0.32,
    pressureSensitive: false,
    cap: "square",
  },
  {
    id: "eraser",
    label: "Eraser",
    scale: 4,
    opacity: 1,
    pressureSensitive: false,
    cap: "round",
  },
] as const;

export function noteTool(id: NoteTool): NoteToolSpec {
  const found = NOTE_TOOLS.find((tool) => tool.id === id);
  // Every caller passes a `NoteTool`, so this is unreachable — but a stored
  // note from an older build could name a tool that no longer exists, and a
  // crash is a worse answer than a pen.
  return found ?? NOTE_TOOLS[0];
}

/**
 * Nib sizes, as a fraction of the note's width.
 *
 * A fraction rather than pixels, because the same note is written on a 1024px
 * iPad and read on a 390px phone. Storing the nib in pixels would mean a note
 * whose handwriting is legible on the pad and whose strokes are fat blobs on
 * the phone; storing it as a share of the width means the whole note scales as
 * one picture, exactly as a photograph of a real note would.
 */
export type NoteNib = { id: "fine" | "medium" | "broad"; label: string; size: number };

export const NOTE_NIBS: readonly NoteNib[] = [
  { id: "fine", label: "Fine", size: 0.0035 },
  { id: "medium", label: "Medium", size: 0.006 },
  { id: "broad", label: "Broad", size: 0.011 },
] as const;

export const DEFAULT_NIB = NOTE_NIBS[1];

export function noteNib(id: string): NoteNib {
  return NOTE_NIBS.find((nib) => nib.id === id) ?? DEFAULT_NIB;
}

export type NoteInk = { id: string; label: string; hex: string };

/**
 * The inks.
 *
 * Eight, in a single row on an iPad and two rows on a phone. They are chosen
 * to stay legible against the warm paper *and* against each other under the
 * highlighter at 32% — a pale yellow ink, for instance, is unreadable on this
 * paper and is not offered, however nice it looks in the swatch.
 *
 * Graphite leads because it is what most notes are written in, and because a
 * child looking for "the normal one" should not have to hunt.
 */
export const NOTE_INKS: readonly NoteInk[] = [
  { id: "graphite", label: "Graphite", hex: "#1f2430" },
  { id: "blue", label: "Blue", hex: "#1d5fd0" },
  { id: "red", label: "Red", hex: "#d92d20" },
  { id: "green", label: "Green", hex: "#128a5b" },
  { id: "purple", label: "Purple", hex: "#7b3fe4" },
  { id: "orange", label: "Orange", hex: "#e8730c" },
  { id: "pink", label: "Pink", hex: "#e1418f" },
  { id: "teal", label: "Teal", hex: "#0e8fa8" },
] as const;

export const DEFAULT_INK = NOTE_INKS[0];

export function noteInk(id: string): NoteInk {
  return NOTE_INKS.find((ink) => ink.id === id) ?? DEFAULT_INK;
}

/** Plain, ruled or squared. Drawn in CSS behind the canvas, never in it. */
export type NotePaper = "plain" | "ruled" | "grid";

export const NOTE_PAPERS: readonly { id: NotePaper; label: string }[] = [
  { id: "ruled", label: "Ruled" },
  { id: "plain", label: "Plain" },
  { id: "grid", label: "Grid" },
] as const;

export const DEFAULT_PAPER: NotePaper = "ruled";

/** The warm off-white every theme gets. See the header note. */
export const NOTE_PAPER_COLOUR = "#fdfbf4";

/**
 * The shape of the pad, width ÷ height.
 *
 * Fixed, and it has to be. Stroke coordinates are stored as a fraction of the
 * pad, so if the pad's proportions changed with the window, a note written in
 * landscape would come back squashed in portrait — handwriting is the one kind
 * of drawing where that is immediately obvious and completely unacceptable.
 *
 * 3:2 is roughly a sheet of A4 turned sideways, which is the shape of the pad
 * on the fridge this replaces.
 */
export const NOTE_ASPECT = 3 / 2;
