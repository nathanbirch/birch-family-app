/**
 * The note, as data.
 *
 * Everything in here is pure: no canvas, no `window`, no React. The page draws
 * from this model and never the other way round, which is what makes undo,
 * erasing and saving all fall out of the same three functions instead of being
 * three separate mechanisms fighting over one bitmap.
 *
 * ---------------------------------------------------------------------------
 * WHY STROKES AND NOT A PICTURE
 * ---------------------------------------------------------------------------
 * The obvious way to save a canvas is `toDataURL()`, and it is wrong for all
 * four of the things this page has to do:
 *
 *   **Undo.** A bitmap has no idea what the last stroke was. Keeping thirty
 *   full-resolution snapshots to get undo back costs megabytes.
 *
 *   **The eraser.** Rubbing out pixels leaves torn edges through the middle of
 *   letters. Rubbing out *strokes* takes the whole pen-mark away cleanly,
 *   which is what Apple's object eraser does and what people actually expect
 *   when they wipe a word off a pad.
 *
 *   **Two screens.** A bitmap is written at the iPad's size and read at the
 *   phone's. Strokes are stored as fractions of the pad and are re-drawn
 *   crisply at whatever size the reader's screen happens to be — including
 *   after a rotation, and including on a display with a different pixel ratio.
 *
 *   **Space.** A page of handwriting is a few tens of kilobytes as points and
 *   a few hundred as a PNG, and `localStorage` gives us about five megabytes
 *   for everything the app stores.
 *
 * ---------------------------------------------------------------------------
 * THE COORDINATE SPACE
 * ---------------------------------------------------------------------------
 * `x` and `y` are both 0-1, spanning the pad's width and height. The pad's
 * proportions are fixed (`NOTE_ASPECT`), so this is lossless — see the note on
 * that constant for why the shape is not allowed to vary.
 *
 * The one place the two axes are *not* interchangeable is distance: a tenth of
 * the way across is a longer journey than a tenth of the way down. Every
 * function here that measures anything takes the aspect ratio and corrects for
 * it rather than pretending the space is square.
 */

import {
  DEFAULT_PAPER,
  NOTE_ASPECT,
  NOTE_PAPERS,
  type NoteInkTool,
  type NotePaper,
} from "@/config/note";

export type NotePoint = {
  /** 0 at the left edge of the pad, 1 at the right. */
  x: number;
  /** 0 at the top edge of the pad, 1 at the bottom. */
  y: number;
  /**
   * How hard the nib was pressed, 0-1.
   *
   * From the Apple Pencil this is the real thing. From a finger or a mouse,
   * which report a flat 0.5 forever, it is derived from how fast the point was
   * moving — see `pressureFromSpeed`. Either way the renderer treats it the
   * same, so there is exactly one code path for width.
   */
  p: number;
};

export type NoteStroke = {
  tool: NoteInkTool;
  /** An id from `NOTE_INKS`, not a hex value — see `serialiseNote`. */
  ink: string;
  /** A nib id from `NOTE_NIBS`. */
  nib: string;
  points: NotePoint[];
};

export type NoteDocument = {
  strokes: readonly NoteStroke[];
  /**
   * Which paper the note is written on.
   *
   * Saved with the note rather than kept as a device preference, because it is
   * part of what the note *looks like* — squared paper under a diagram is a
   * choice the writer made about that note, and it should come back with it.
   */
  paper: NotePaper;
  /** When the note was last written on, as an ISO instant. */
  savedAt: string;
};

/**
 * How much of the pad's width a point has to travel before it is recorded.
 *
 * An Apple Pencil fires around 240 events a second and a slow, careful letter
 * can produce hundreds of points within a few pixels of each other. Dropping
 * the ones that have not moved costs nothing visually — they are well inside a
 * single nib width — and roughly halves what ends up in storage.
 */
const MIN_STEP = 0.0012;

/**
 * The ceiling on one note, in points.
 *
 * Not a performance limit — the renderer is comfortable well past this. It is
 * a `localStorage` limit: the browser throws a quota error on write, and the
 * failure mode of *silently not saving* a note somebody has just spent a
 * minute writing is much worse than the failure mode of the pad politely
 * refusing to accept more ink. In practice a densely written pad is about
 * fifteen thousand points, so this is roughly four times a full one.
 */
export const MAX_POINTS = 60_000;

/** The ceiling on undo history. Thirty strokes is several sentences. */
export const MAX_HISTORY = 30;

/** Total points across every stroke. */
export function countPoints(strokes: readonly NoteStroke[]): number {
  let total = 0;
  for (const stroke of strokes) total += stroke.points.length;
  return total;
}

/** Whether there is room for another stroke. */
export function hasRoom(strokes: readonly NoteStroke[]): boolean {
  return countPoints(strokes) < MAX_POINTS;
}

/**
 * A point added to a stroke, or `null` when it was too close to bother with.
 *
 * Returning `null` rather than the unchanged stroke is deliberate: the caller
 * uses it to decide whether a redraw is needed at all, which on a pencil
 * running at 240Hz is the difference between one repaint per movement and one
 * per frame.
 */
export function appendPoint(
  points: NotePoint[],
  next: NotePoint,
  aspect: number = NOTE_ASPECT,
): NotePoint[] | null {
  const last = points[points.length - 1];
  if (last && distance(last, next, aspect) < MIN_STEP) return null;
  return [...points, next];
}

/**
 * Straight-line distance between two points, in units of the pad's *width*.
 *
 * `y` is divided by the aspect ratio to bring it into the same units as `x`.
 * Skipping that step is the classic bug here: on a 3:2 pad it makes vertical
 * distances read 50% shorter than they are, so the eraser under-reaches
 * downwards and strokes are recorded more densely on vertical pen movements
 * than horizontal ones.
 */
export function distance(
  a: { x: number; y: number },
  b: { x: number; y: number },
  aspect: number = NOTE_ASPECT,
): number {
  const dx = a.x - b.x;
  const dy = (a.y - b.y) / aspect;
  return Math.hypot(dx, dy);
}

/**
 * Shortest distance from `point` to the segment `a`-`b`, in width units.
 *
 * Segments rather than the endpoints alone, because a long straight pen stroke
 * — an underline, the cross of a "t" — has only two recorded points, and an
 * eraser dragged across its middle would find neither of them.
 */
export function distanceToSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  aspect: number = NOTE_ASPECT,
): number {
  const ax = a.x;
  const ay = a.y / aspect;
  const bx = b.x;
  const by = b.y / aspect;
  const px = point.x;
  const py = point.y / aspect;

  const vx = bx - ax;
  const vy = by - ay;
  const lengthSquared = vx * vx + vy * vy;

  // A stroke that never moved — a dot — is a single point, not a segment.
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);

  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lengthSquared));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Whether the eraser, centred on `point` with `radius`, touches this stroke. */
export function strokeIsHit(
  stroke: NoteStroke,
  point: { x: number; y: number },
  radius: number,
  aspect: number = NOTE_ASPECT,
): boolean {
  const { points } = stroke;
  if (points.length === 0) return false;
  if (points.length === 1) return distance(points[0], point, aspect) <= radius;

  for (let i = 1; i < points.length; i += 1) {
    if (distanceToSegment(point, points[i - 1], points[i], aspect) <= radius) {
      return true;
    }
  }
  return false;
}

/**
 * The strokes left after rubbing at `point`.
 *
 * The same array is returned when nothing was hit, so the caller can compare
 * by identity and skip both the redraw and the undo entry. That matters more
 * than it sounds: an eraser is *dragged*, so this runs on every pointer move,
 * and without the identity check a single wipe across blank paper would push
 * fifty identical states onto the undo stack.
 */
export function eraseAt(
  strokes: readonly NoteStroke[],
  point: { x: number; y: number },
  radius: number,
  aspect: number = NOTE_ASPECT,
): readonly NoteStroke[] {
  const kept = strokes.filter((stroke) => !strokeIsHit(stroke, point, radius, aspect));
  return kept.length === strokes.length ? strokes : kept;
}

/**
 * Pressure inferred from how fast the nib is moving, for input that has none.
 *
 * A finger and a mouse both report a flat 0.5 pressure forever, and a stroke of
 * uniform width reads as a line drawn by a machine. Real handwriting thins
 * where the hand speeds up — the long connecting sweeps between letters — and
 * thickens where it slows to form one, so speed is a decent stand-in for the
 * pressure that is not being reported.
 *
 * `speed` is width-units per millisecond. The ceiling below is about a third of
 * the pad crossed in a second, which is a brisk scribble; anything faster is
 * simply the thinnest the line goes.
 */
export function pressureFromSpeed(speed: number): number {
  const FASTEST = 0.0018;
  return clamp01(1 - speed / FASTEST) * 0.7 + 0.3;
}

/**
 * Pressure eased towards a new reading rather than snapped to it.
 *
 * Raw pencil pressure is noisy enough that using it directly gives a stroke a
 * faintly serrated edge. A third of the way per sample smooths that out
 * without lagging far enough behind the hand to be felt.
 */
export function smoothPressure(previous: number, next: number): number {
  return previous + (next - previous) * 0.34;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/* ------------------------------------------------------------------------ */
/* Storage                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The version stamp on a saved note.
 *
 * `parseStoredNote` rejects anything that is not this number, which throws the
 * note away rather than trying to migrate it. That is the right trade for this
 * feature and only this feature: the whole promise of the page is that a note
 * lives until somebody clears it, and the cost of breaking that promise once,
 * on a deploy that changes the format, is that Dad writes it again. Migration
 * code for a sticky note would be more likely to be wrong than useful.
 */
export const NOTE_FORMAT_VERSION = 1;

/**
 * How many decimal places a coordinate keeps.
 *
 * Four places is a ten-thousandth of the pad — about a tenth of a pixel on an
 * iPad, which is well below what a nib can express. It is worth being exact
 * about because it is pure profit: three places would be visibly steppy on
 * slow curves and five would grow every note by a fifth for nothing.
 */
const PRECISION = 4;

function round(value: number): number {
  const factor = 10 ** PRECISION;
  return Math.round(value * factor) / factor;
}

/**
 * The note as a JSON string.
 *
 * Points are stored as `[x, y, p]` triples rather than `{x, y, p}` objects,
 * which is not premature cleverness — the keys are two-thirds of the bytes at
 * this shape, and a page of handwriting is tens of thousands of them.
 *
 * Inks and nibs are stored by **id**, not by hex or pixel size. That means the
 * palette can be re-tuned — a red that turned out too orange on the paper, a
 * fine nib that was too fine — and every note already written picks up the
 * correction instead of being frozen with the old value baked in.
 */
export function serialiseNote(document: NoteDocument): string {
  return JSON.stringify({
    v: NOTE_FORMAT_VERSION,
    savedAt: document.savedAt,
    paper: document.paper,
    strokes: document.strokes.map((stroke) => ({
      t: stroke.tool,
      i: stroke.ink,
      n: stroke.nib,
      p: stroke.points.map((point) => [round(point.x), round(point.y), round(point.p)]),
    })),
  });
}

/**
 * A saved note, or `null` if there is not a usable one.
 *
 * Every field is checked. This is not defensiveness about our own writer — it
 * is that `localStorage` is a shared, user-visible, forever-lived key/value
 * store, and the thing being reconstructed from it is fed straight into a
 * render loop. A truncated write from a tab killed mid-save, a value edited by
 * hand, or a note left behind by a future build are all reachable, and every
 * one of them should mean "blank pad", not a crash on a page whose only job is
 * to show a message to a child.
 */
export function parseStoredNote(raw: string | null): NoteDocument | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (parsed.v !== NOTE_FORMAT_VERSION) return null;
  if (typeof parsed.savedAt !== "string") return null;
  if (!Array.isArray(parsed.strokes)) return null;

  const strokes: NoteStroke[] = [];
  for (const entry of parsed.strokes) {
    const stroke = parseStroke(entry);
    // One bad stroke drops that stroke, not the note. A note is worth more
    // than its worst mark.
    if (stroke) strokes.push(stroke);
  }

  return { strokes, paper: parsePaper(parsed.paper), savedAt: parsed.savedAt };
}

/**
 * The saved paper, or the default.
 *
 * Unlike a bad stroke, a paper we do not recognise is not worth discarding the
 * note over — it is the background. Fall back and carry on.
 */
function parsePaper(value: unknown): NotePaper {
  if (typeof value !== "string") return DEFAULT_PAPER;
  const known = NOTE_PAPERS.find((paper) => paper.id === value);
  return known ? known.id : DEFAULT_PAPER;
}

const INK_TOOLS = new Set<string>(["pen", "marker", "highlighter"]);

function parseStroke(entry: unknown): NoteStroke | null {
  if (!isRecord(entry)) return null;
  if (typeof entry.t !== "string" || !INK_TOOLS.has(entry.t)) return null;
  if (typeof entry.i !== "string" || typeof entry.n !== "string") return null;
  if (!Array.isArray(entry.p) || entry.p.length === 0) return null;

  const points: NotePoint[] = [];
  for (const raw of entry.p) {
    if (!Array.isArray(raw) || raw.length < 3) return null;
    const [x, y, p] = raw;
    if (!isFinite2(x) || !isFinite2(y) || !isFinite2(p)) return null;
    points.push({ x, y, p: clamp01(p) });
  }

  return {
    tool: entry.t as NoteInkTool,
    ink: entry.i,
    nib: entry.n,
    points,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFinite2(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
