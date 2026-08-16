import { describe, expect, it } from "vitest";

import { NOTE_ASPECT } from "@/config/note";
import {
  MAX_POINTS,
  NOTE_FORMAT_VERSION,
  appendPoint,
  clamp01,
  countPoints,
  distance,
  distanceToSegment,
  eraseAt,
  hasRoom,
  parseStoredNote,
  pressureFromSpeed,
  serialiseNote,
  smoothPressure,
  strokeIsHit,
  type NoteStroke,
} from "@/lib/note/strokes";

/*
 * The note's model, which is the part of the pad that has to be right for
 * reasons nobody can see by looking at it: that a saved note comes back, that
 * a note from another build cannot crash the page, and that the eraser rubs
 * out what is under it rather than what is near it.
 */

function stroke(points: [number, number][]): NoteStroke {
  return {
    tool: "pen",
    ink: "graphite",
    nib: "medium",
    points: points.map(([x, y]) => ({ x, y, p: 0.6 })),
  };
}

describe("measuring the pad", () => {
  it("measures across the sheet in fractions of its width", () => {
    expect(distance({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(1);
  });

  it("counts a vertical gap by its real length, not its fraction", () => {
    /*
     * The bug this exists to catch. `y` runs 0-1 over a sheet that is only
     * two-thirds as tall as it is wide, so the full height of the pad is
     * two-thirds of a width — not a whole one. Treating the space as square
     * makes the eraser under-reach downwards by a third.
     */
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(1 / NOTE_ASPECT);
  });

  it("finds the near point of a long segment, not just its ends", () => {
    // An underline drawn as two points, rubbed at in the middle.
    const near = distanceToSegment({ x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }, { x: 1, y: 0.5 });
    expect(near).toBeCloseTo(0);
  });

  it("does not run past the end of a segment", () => {
    // Beyond the right-hand end: the answer is the distance to that end,
    // never a perpendicular to the infinite line through it.
    const beyond = distanceToSegment({ x: 1.5, y: 0.5 }, { x: 0, y: 0.5 }, { x: 1, y: 0.5 });
    expect(beyond).toBeCloseTo(0.5);
  });

  it("treats a stroke that never moved as a dot", () => {
    const dot = distanceToSegment({ x: 0.2, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
    expect(dot).toBeCloseTo(0.3);
  });
});

describe("recording a stroke", () => {
  it("drops a point the nib has barely moved to", () => {
    const points = stroke([[0.5, 0.5]]).points;
    expect(appendPoint(points, { x: 0.5001, y: 0.5, p: 0.6 })).toBeNull();
  });

  it("keeps a point that is a real step away", () => {
    const points = stroke([[0.5, 0.5]]).points;
    const next = appendPoint(points, { x: 0.52, y: 0.5, p: 0.6 });
    expect(next).toHaveLength(2);
  });

  it("never edits the array it was given", () => {
    const points = stroke([[0.5, 0.5]]).points;
    appendPoint(points, { x: 0.52, y: 0.5, p: 0.6 });
    expect(points).toHaveLength(1);
  });

  it("starts a stroke without a previous point to compare against", () => {
    expect(appendPoint([], { x: 0.1, y: 0.1, p: 0.5 })).toHaveLength(1);
  });
});

describe("pressure", () => {
  it("presses hardest when the nib is still", () => {
    expect(pressureFromSpeed(0)).toBeCloseTo(1);
  });

  it("thins as the hand speeds up, and stops thinning at a floor", () => {
    expect(pressureFromSpeed(0.0009)).toBeLessThan(pressureFromSpeed(0));
    // A hard floor, or the tapered end of a fast stroke disappears and the
    // letters come apart.
    expect(pressureFromSpeed(99)).toBeGreaterThanOrEqual(0.3);
  });

  it("stays inside 0-1 however fast the report", () => {
    for (const speed of [0, 0.0005, 0.002, 5, 1000]) {
      const value = pressureFromSpeed(speed);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("eases towards a new reading rather than snapping to it", () => {
    const eased = smoothPressure(0.2, 1);
    expect(eased).toBeGreaterThan(0.2);
    expect(eased).toBeLessThan(1);
  });

  it("converges on a steady reading", () => {
    let value = 0;
    for (let i = 0; i < 40; i += 1) value = smoothPressure(value, 0.8);
    expect(value).toBeCloseTo(0.8, 3);
  });

  it("clamps anything out of range", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(4)).toBe(1);
    expect(clamp01(0.25)).toBe(0.25);
  });
});

describe("the eraser", () => {
  const underline = stroke([
    [0.1, 0.5],
    [0.9, 0.5],
  ]);
  const elsewhere = stroke([
    [0.1, 0.1],
    [0.2, 0.1],
  ]);

  it("takes away a stroke it is dragged across", () => {
    expect(strokeIsHit(underline, { x: 0.5, y: 0.5 }, 0.02)).toBe(true);
  });

  it("leaves one it only passes near", () => {
    expect(strokeIsHit(underline, { x: 0.5, y: 0.9 }, 0.02)).toBe(false);
  });

  it("removes the whole stroke, not the bit it touched", () => {
    const left = eraseAt([underline, elsewhere], { x: 0.5, y: 0.5 }, 0.02);
    expect(left).toEqual([elsewhere]);
  });

  it("returns the very same array when it rubs at blank paper", () => {
    /*
     * Identity, not equality, and the test is about identity on purpose: the
     * pad compares by reference to decide whether to redraw and whether to
     * push an undo entry. A fresh array every time would put fifty identical
     * states on the undo stack for one wipe across an empty page.
     */
    const before = [underline, elsewhere];
    expect(eraseAt(before, { x: 0.5, y: 0.95 }, 0.02)).toBe(before);
  });

  it("finds a dot", () => {
    const dot = stroke([[0.5, 0.5]]);
    expect(strokeIsHit(dot, { x: 0.505, y: 0.5 }, 0.02)).toBe(true);
  });

  it("ignores a stroke with no points at all", () => {
    expect(strokeIsHit(stroke([]), { x: 0.5, y: 0.5 }, 0.5)).toBe(false);
  });
});

describe("how full the page is", () => {
  it("counts every point across every stroke", () => {
    expect(
      countPoints([
        stroke([
          [0, 0],
          [0.1, 0.1],
        ]),
        stroke([[0.5, 0.5]]),
      ]),
    ).toBe(3);
  });

  it("has room on a blank page and none on a full one", () => {
    expect(hasRoom([])).toBe(true);
    const packed: NoteStroke = {
      tool: "pen",
      ink: "graphite",
      nib: "medium",
      points: Array.from({ length: MAX_POINTS }, () => ({ x: 0.5, y: 0.5, p: 1 })),
    };
    expect(hasRoom([packed])).toBe(false);
  });
});

describe("saving and reading back", () => {
  const document = {
    strokes: [
      stroke([
        [0.25, 0.4],
        [0.75, 0.6],
      ]),
    ],
    paper: "ruled" as const,
    savedAt: "2026-08-15T09:30:00.000Z",
  };

  it("comes back the way it went in", () => {
    const back = parseStoredNote(serialiseNote(document));
    expect(back?.savedAt).toBe(document.savedAt);
    expect(back?.paper).toBe("ruled");
    expect(back?.strokes).toHaveLength(1);
    expect(back?.strokes[0].ink).toBe("graphite");
    expect(back?.strokes[0].points[0].x).toBeCloseTo(0.25, 4);
    expect(back?.strokes[0].points[1].y).toBeCloseTo(0.6, 4);
  });

  it("stores ink and nib by name, so the palette can still be re-tuned", () => {
    const raw = JSON.parse(serialiseNote(document));
    expect(raw.strokes[0].i).toBe("graphite");
    expect(raw.strokes[0].n).toBe("medium");
    // Not a hex value and not a pixel size — a note already written picks up a
    // corrected red or a re-cut nib instead of being frozen with the old one.
    expect(JSON.stringify(raw)).not.toContain("#");
  });

  it("keeps a note small enough for storage", () => {
    // Four decimal places is a tenth of a pixel on an iPad, and the point
    // arrays are triples rather than objects. A thousand points should be
    // well under a hundred kilobytes; five megabytes is all there is.
    const long: NoteStroke = {
      tool: "pen",
      ink: "graphite",
      nib: "medium",
      points: Array.from({ length: 1000 }, (_, i) => ({
        x: i / 1000,
        y: 0.123456789,
        p: 0.987654321,
      })),
    };
    const size = serialiseNote({ ...document, strokes: [long] }).length;
    expect(size).toBeLessThan(40_000);
  });

  it("has nothing to show for nothing stored", () => {
    expect(parseStoredNote(null)).toBeNull();
    expect(parseStoredNote("")).toBeNull();
  });

  it("shrugs off a note that is not JSON at all", () => {
    // A write cut short by a tab being killed mid-save.
    expect(parseStoredNote('{"v":1,"strokes":[{"t":"pe')).toBeNull();
  });

  it("refuses a note from a format it does not know", () => {
    const future = serialiseNote(document).replace(
      `"v":${NOTE_FORMAT_VERSION}`,
      '"v":99',
    );
    expect(parseStoredNote(future)).toBeNull();
  });

  it("refuses a note with no timestamp", () => {
    expect(parseStoredNote('{"v":1,"strokes":[]}')).toBeNull();
  });

  it("drops one bad stroke rather than the whole note", () => {
    // A note is worth more than its worst mark.
    const back = parseStoredNote(
      '{"v":1,"savedAt":"2026-08-15T09:30:00.000Z","paper":"plain","strokes":' +
        '[{"t":"pen","i":"blue","n":"fine","p":[[0.1,0.1,1]]},' +
        '{"t":"lasso","i":"blue","n":"fine","p":[[0.2,0.2,1]]},' +
        '{"t":"pen","i":"red","n":"fine","p":[[0.3,0.3,"heavy"]]}]}',
    );
    expect(back?.strokes).toHaveLength(1);
    expect(back?.strokes[0].ink).toBe("blue");
  });

  it("refuses a stroke whose points are not numbers", () => {
    expect(
      parseStoredNote(
        '{"v":1,"savedAt":"x","paper":"plain","strokes":[{"t":"pen","i":"blue","n":"fine","p":[[null,0,1]]}]}',
      )?.strokes,
    ).toHaveLength(0);
  });

  it("refuses an infinite coordinate", () => {
    // `JSON.parse` turns `1e999` into `Infinity`, which would put the canvas
    // into an unrecoverable state rather than merely drawing something odd.
    expect(
      parseStoredNote(
        '{"v":1,"savedAt":"x","paper":"plain","strokes":[{"t":"pen","i":"blue","n":"fine","p":[[1e999,0,1]]}]}',
      )?.strokes,
    ).toHaveLength(0);
  });

  it("falls back to the default paper rather than losing the note over it", () => {
    const back = parseStoredNote(
      '{"v":1,"savedAt":"x","paper":"papyrus","strokes":[{"t":"pen","i":"blue","n":"fine","p":[[0.1,0.1,1]]}]}',
    );
    expect(back?.strokes).toHaveLength(1);
    expect(back?.paper).toBe("ruled");
  });

  it("keeps a pressure reading inside range on the way in", () => {
    const back = parseStoredNote(
      '{"v":1,"savedAt":"x","paper":"plain","strokes":[{"t":"pen","i":"blue","n":"fine","p":[[0.1,0.1,42]]}]}',
    );
    expect(back?.strokes[0].points[0].p).toBe(1);
  });
});
