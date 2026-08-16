/**
 * Putting the strokes on the canvas.
 *
 * The only module in the note that touches a drawing context. It is
 * deliberately dumb: hand it a context, a size and some strokes and it paints
 * them. It holds no state, decides nothing, and can repaint the whole note
 * from scratch at any moment — which is what makes undo and the eraser a
 * matter of changing the array and calling this again.
 *
 * ---------------------------------------------------------------------------
 * WHY A STROKE IS MANY LITTLE STROKES
 * ---------------------------------------------------------------------------
 * The line width of a pen changes continuously along its length, and a canvas
 * path has exactly one `lineWidth` for the whole path. So a pressure-varying
 * stroke is drawn as one short path per point, each with its own width,
 * overlapping its neighbours by half a nib. Round caps hide the joins
 * completely; the result is a line that swells and tapers like ink.
 *
 * The segments are quadratic curves through the *midpoints* between recorded
 * points, using each recorded point as the control point. That is the standard
 * trick for smoothing a polyline and it is what removes the faint faceting you
 * otherwise get on a slowly drawn curve — the raw points become the pull of
 * the curve rather than corners on it.
 */

import {
  NOTE_ASPECT,
  NOTE_PAPER_COLOUR,
  noteInk,
  noteNib,
  noteTool,
  type NotePaper,
} from "@/config/note";

import type { NoteStroke } from "./strokes";

export type PadSize = {
  /** CSS pixels across the pad. */
  width: number;
  /** CSS pixels down the pad. */
  height: number;
};

/**
 * The largest sheet of the right shape that fits in the space available.
 *
 * The pad's proportions are fixed (`NOTE_ASPECT`) and its size is not: it
 * should be as big as whatever is left of the screen once the heading and the
 * tray have taken theirs. Those two things together are a "contain" fit —
 * match the width, and if that makes it too tall, match the height instead.
 *
 * This is done in JavaScript rather than in CSS, which is worth explaining
 * because `aspect-ratio` looks like it should cover it. It does not: a box with
 * `aspect-ratio` and `max-height` has its height clamped and its width left
 * alone, so a pad in a short window comes out squashed rather than smaller —
 * and squashed is the one thing handwriting cannot survive. The CSS-only
 * alternative is `width: min(100%, calc(<available height> * 3 / 2))`, which
 * needs the available height as a constant, and the available height is not
 * constant: the tray wraps to four rows on a phone and one on an iPad.
 *
 * Rounded down, so the sheet can never be a fraction of a pixel wider than the
 * box that measured it and start a resize that measures it smaller.
 */
export function fitPad(
  available: { width: number; height: number },
  aspect: number = NOTE_ASPECT,
): PadSize {
  const width = Math.max(0, available.width);
  const height = Math.max(0, available.height);

  if (width / aspect <= height) {
    return { width: Math.floor(width), height: Math.floor(width / aspect) };
  }
  return { width: Math.floor(height * aspect), height: Math.floor(height) };
}

/**
 * How far the nib narrows at its lightest, as a share of its full width.
 *
 * A hard floor is needed or the tapered ends of a fast stroke vanish
 * altogether and the letters come apart. A third is light enough to read as a
 * taper and heavy enough to stay joined up.
 */
const MIN_WIDTH_FACTOR = 0.34;

/** The nib width in CSS pixels for one point of one stroke. */
export function widthAt(
  stroke: NoteStroke,
  pressure: number,
  size: PadSize,
): number {
  const spec = noteTool(stroke.tool);
  const base = noteNib(stroke.nib).size * spec.scale * size.width;
  if (!spec.pressureSensitive) return base;
  return base * (MIN_WIDTH_FACTOR + (1 - MIN_WIDTH_FACTOR) * pressure);
}

/** Paint one stroke. The context is left as it was found. */
export function renderStroke(
  context: CanvasRenderingContext2D,
  stroke: NoteStroke,
  size: PadSize,
): void {
  const { points } = stroke;
  if (points.length === 0) return;

  const spec = noteTool(stroke.tool);
  const colour = noteInk(stroke.ink).hex;

  context.save();
  context.strokeStyle = colour;
  context.fillStyle = colour;
  context.lineCap = spec.cap;
  context.lineJoin = "round";
  context.globalAlpha = spec.opacity;
  /*
   * A real highlighter is translucent pigment: it darkens what is under it and
   * two overlapping passes are darker still. `multiply` is exactly that, and
   * it is the difference between a highlighter and a pale crayon. The other
   * tools are opaque ink and want plain source-over.
   */
  context.globalCompositeOperation =
    stroke.tool === "highlighter" ? "multiply" : "source-over";

  // A tap with no travel is a dot, and a dot has no segments to draw.
  if (points.length === 1) {
    const only = points[0];
    context.beginPath();
    context.arc(
      only.x * size.width,
      only.y * size.height,
      widthAt(stroke, only.p, size) / 2,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();
    return;
  }

  if (spec.pressureSensitive) {
    drawTapered(context, stroke, points, size);
  } else {
    drawEven(context, stroke, points, size);
  }

  context.restore();
}

/**
 * A stroke of one unbroken width, drawn as a single path.
 *
 * One path and one `stroke()` call, which for a translucent tool is not a
 * refinement but the entire difference between a highlighter and a corduroy
 * stripe. Alpha is applied when a path is painted, so painting a stroke as
 * fifty overlapping segments composites the ink against itself fifty times and
 * every overlap comes out darker than the ink either side of it. Painted once,
 * the whole line is one even wash.
 *
 * It is faster too, which is why the marker uses it as well even though its
 * 95% opacity would only band very faintly.
 */
function drawEven(
  context: CanvasRenderingContext2D,
  stroke: NoteStroke,
  points: NoteStroke["points"],
  size: PadSize,
): void {
  context.lineWidth = widthAt(stroke, 1, size);
  context.beginPath();
  context.moveTo(points[0].x * size.width, points[0].y * size.height);

  for (let i = 1; i < points.length - 1; i += 1) {
    const to = midpoint(points[i], points[i + 1]);
    context.quadraticCurveTo(
      points[i].x * size.width,
      points[i].y * size.height,
      to.x * size.width,
      to.y * size.height,
    );
  }

  const last = points[points.length - 1];
  context.lineTo(last.x * size.width, last.y * size.height);
  context.stroke();
}

/**
 * A stroke whose width follows the pressure, drawn as many little strokes.
 *
 * A canvas path has one `lineWidth` for its whole length, so a line that
 * swells and tapers has to be one short path per point. That would band like
 * the highlighter if the ink were translucent — it is not: the only tool that
 * comes down this branch is the pen, at full opacity, where compositing ink
 * over identical ink changes nothing. Round caps hide the joins entirely.
 */
function drawTapered(
  context: CanvasRenderingContext2D,
  stroke: NoteStroke,
  points: NoteStroke["points"],
  size: PadSize,
): void {
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];

    const from = i === 1 ? previous : midpoint(points[i - 2], previous);
    const to = i === points.length - 1 ? current : midpoint(previous, current);

    context.beginPath();
    context.lineWidth = widthAt(stroke, current.p, size);
    context.moveTo(from.x * size.width, from.y * size.height);
    context.quadraticCurveTo(
      previous.x * size.width,
      previous.y * size.height,
      to.x * size.width,
      to.y * size.height,
    );
    context.stroke();
  }
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Wipe the canvas back to bare paper. */
export function clearCanvas(
  context: CanvasRenderingContext2D,
  size: PadSize,
): void {
  context.save();
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.clearRect(0, 0, size.width, size.height);
  context.restore();
}

/**
 * How many ruled lines fit the pad, top to bottom.
 *
 * Fourteen on a 3:2 pad gives a line spacing of about a twentieth of the
 * width, which is roughly the height of comfortable adult handwriting at the
 * medium nib — the rules should be a guide for the hand, not a decoration at
 * some arbitrary density.
 */
const RULE_COUNT = 14;

/** The rules are drawn in the ink colour at low opacity, never in grey. */
const RULE_COLOUR = "#1f2430";

/**
 * Paint the sheet: the colour, and the rules if it has any.
 *
 * Drawn *into* the canvas rather than sitting behind it in CSS, for two
 * reasons. The highlighter blends with `multiply` and needs real pixels
 * underneath — over a transparent canvas it comes out as a dark band instead
 * of a wash. And a highlighter dragged across a ruled line should darken the
 * line, which it only does if the line is part of the same surface.
 */
export function renderPaper(
  context: CanvasRenderingContext2D,
  size: PadSize,
  paper: NotePaper,
): void {
  context.save();
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.fillStyle = NOTE_PAPER_COLOUR;
  context.fillRect(0, 0, size.width, size.height);

  if (paper !== "plain") {
    const step = size.height / RULE_COUNT;
    context.strokeStyle = RULE_COLOUR;
    context.globalAlpha = paper === "grid" ? 0.1 : 0.13;
    context.lineWidth = Math.max(1, size.width * 0.0009);

    context.beginPath();
    // Start at `step` and stop short of the last one, so there is no rule
    // sitting on the very edge of the sheet pretending to be a border.
    for (let i = 1; i < RULE_COUNT; i += 1) {
      const y = Math.round(i * step) + 0.5;
      context.moveTo(0, y);
      context.lineTo(size.width, y);
    }

    if (paper === "grid") {
      // Square cells, so the grid is measured off the *line spacing* rather
      // than divided into some other count across — a grid of oblongs is a
      // grid nobody would draw on purpose.
      for (let x = step; x < size.width; x += step) {
        const at = Math.round(x) + 0.5;
        context.moveTo(at, 0);
        context.lineTo(at, size.height);
      }
    }

    context.stroke();
  }

  context.restore();
}

/** Repaint the sheet and every committed stroke on it. */
export function renderNote(
  context: CanvasRenderingContext2D,
  strokes: readonly NoteStroke[],
  size: PadSize,
  paper: NotePaper,
): void {
  clearCanvas(context, size);
  renderPaper(context, size, paper);
  for (const stroke of strokes) renderStroke(context, stroke, size);
}

/**
 * Match the backing store to the display, and return the CSS size.
 *
 * A canvas has two sizes — the box it occupies and the grid of pixels behind
 * it — and if they are left equal, everything drawn on a modern screen is
 * blurred by a factor of two or three. Scaling the context by the device pixel
 * ratio means every coordinate afterwards can be plain CSS pixels.
 *
 * The ratio is capped at 3. Beyond that the sharpness is imperceptible and the
 * pixel count is not: an unclamped ratio on a large high-density display can
 * ask for a buffer big enough to be refused outright.
 */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  size: PadSize,
  devicePixelRatio: number,
): CanvasRenderingContext2D | null {
  const ratio = Math.min(Math.max(devicePixelRatio || 1, 1), 3);
  canvas.width = Math.round(size.width * ratio);
  canvas.height = Math.round(size.height * ratio);

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}
