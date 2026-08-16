import { describe, expect, it } from "vitest";

import {
  PICKER_COLOURS,
  PICKER_CIRCLE_PX,
  PICKER_SECONDS,
} from "@/config/picker";
import {
  chooseIndex,
  countdownNumber,
  floodScale,
  nextColourIndex,
} from "@/lib/picker/game";

/*
 * The Finger Picker settles arguments between five children, which makes the
 * draw the one piece of code in this app that has to be provably fair — and
 * the clock the one that has to be provably honest, because everybody is
 * watching it.
 */

describe("handing out colours", () => {
  it("gives the first finger the first colour", () => {
    expect(nextColourIndex([])).toBe(0);
  });

  it("walks down the palette in order", () => {
    expect(nextColourIndex([0])).toBe(1);
    expect(nextColourIndex([0, 1, 2])).toBe(3);
  });

  it("reuses a colour freed by a finger that lifted", () => {
    // Somebody let go of colour 1. The next hand down takes it back rather
    // than pushing the palette further along and running out early.
    expect(nextColourIndex([0, 2, 3])).toBe(1);
  });

  it("never gives two fingers the same colour while there are colours left", () => {
    const taken: number[] = [];
    for (let i = 0; i < PICKER_COLOURS.length; i += 1) {
      taken.push(nextColourIndex(taken));
    }
    expect(new Set(taken).size).toBe(PICKER_COLOURS.length);
  });

  it("repeats rather than disappearing once every colour is out", () => {
    // An eleventh finger is a party, not a use case — but it still gets a
    // circle, because an invisible one would look like the game is broken.
    const all = PICKER_COLOURS.map((_, index) => index);
    const eleventh = nextColourIndex(all);
    expect(eleventh).toBeGreaterThanOrEqual(0);
    expect(eleventh).toBeLessThan(PICKER_COLOURS.length);
  });
});

describe("the countdown", () => {
  it("says five the instant the clock starts", () => {
    expect(countdownNumber(PICKER_SECONDS * 1000)).toBe(PICKER_SECONDS);
  });

  it("holds each number for its whole second", () => {
    // Rounding up is what makes this read like a countdown: "1" is on screen
    // for the entire final second rather than flicking to 0 halfway through.
    expect(countdownNumber(1000)).toBe(1);
    expect(countdownNumber(999)).toBe(1);
    expect(countdownNumber(1)).toBe(1);
  });

  it("counts down one at a time", () => {
    expect(countdownNumber(4500)).toBe(5);
    expect(countdownNumber(3500)).toBe(4);
    expect(countdownNumber(2500)).toBe(3);
    expect(countdownNumber(1500)).toBe(2);
  });

  it("never shows more than it started with", () => {
    // A clock knocked forward by a browser suspending the tab must not put a 9
    // on a screen that promised five.
    expect(countdownNumber(99_000)).toBe(PICKER_SECONDS);
  });

  it("reaches zero only when time is up", () => {
    expect(countdownNumber(0)).toBe(0);
    expect(countdownNumber(-500)).toBe(0);
  });
});

describe("the draw", () => {
  it("picks the only finger on the screen", () => {
    expect(chooseIndex(1, 0)).toBe(0);
    expect(chooseIndex(1, 0.999)).toBe(0);
  });

  it("splits the range evenly between the fingers", () => {
    expect(chooseIndex(4, 0)).toBe(0);
    expect(chooseIndex(4, 0.24)).toBe(0);
    expect(chooseIndex(4, 0.25)).toBe(1);
    expect(chooseIndex(4, 0.74)).toBe(2);
    expect(chooseIndex(4, 0.75)).toBe(3);
    expect(chooseIndex(4, 0.999)).toBe(3);
  });

  it("never points at a finger that is not there", () => {
    // `Math.random()` is documented as strictly below 1, but a picker that can
    // return an off-the-end index is a crash waiting for a birthday party.
    expect(chooseIndex(5, 1)).toBe(4);
    expect(chooseIndex(5, -0.1)).toBe(0);
  });

  it("says nobody when there is nobody", () => {
    // Every finger lifted on the last frame. No round happened, and the pad
    // goes back to waiting rather than crowning an absentee.
    expect(chooseIndex(0, 0.5)).toBe(-1);
  });

  it("chooses each of five about a fifth of the time", () => {
    const counts = [0, 0, 0, 0, 0];
    const rounds = 100_000;
    for (let i = 0; i < rounds; i += 1) {
      counts[chooseIndex(5, Math.random())] += 1;
    }
    for (const count of counts) {
      // Within a percentage point of a fifth over a hundred thousand rounds.
      expect(count / rounds).toBeGreaterThan(0.19);
      expect(count / rounds).toBeLessThan(0.21);
    }
  });
});

describe("the winning colour flooding the screen", () => {
  const viewport = { width: 1024, height: 768 };

  it("grows far enough from the middle to reach the corners", () => {
    const scale = floodScale({ x: 512, y: 384 }, viewport, PICKER_CIRCLE_PX);
    const reach = (scale * PICKER_CIRCLE_PX) / 2;
    expect(reach).toBeGreaterThanOrEqual(Math.hypot(512, 384));
  });

  it("measures to the furthest corner, not the nearest", () => {
    /*
     * The bug worth guarding: a circle in one corner sized against the corner
     * it is standing in leaves the opposite three-quarters of the screen
     * showing the background for the whole round.
     */
    const corner = floodScale({ x: 0, y: 0 }, viewport, PICKER_CIRCLE_PX);
    const reach = (corner * PICKER_CIRCLE_PX) / 2;
    expect(reach).toBeGreaterThanOrEqual(Math.hypot(1024, 768));
  });

  it("covers the screen from wherever the finger was", () => {
    const places = [
      { x: 0, y: 0 },
      { x: 1024, y: 0 },
      { x: 0, y: 768 },
      { x: 1024, y: 768 },
      { x: 30, y: 700 },
      { x: 512, y: 10 },
    ];

    for (const place of places) {
      const reach = (floodScale(place, viewport, PICKER_CIRCLE_PX) * PICKER_CIRCLE_PX) / 2;
      for (const corner of [
        { x: 0, y: 0 },
        { x: 1024, y: 0 },
        { x: 0, y: 768 },
        { x: 1024, y: 768 },
      ]) {
        expect(reach).toBeGreaterThanOrEqual(
          Math.hypot(corner.x - place.x, corner.y - place.y),
        );
      }
    }
  });

  it("does not divide by a circle with no width", () => {
    expect(Number.isFinite(floodScale({ x: 10, y: 10 }, viewport, 0))).toBe(true);
  });
});

describe("the palette", () => {
  it("gives every colour a distinct swatch and a name to read out", () => {
    const hexes = PICKER_COLOURS.map((colour) => colour.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const colour of PICKER_COLOURS) {
      expect(colour.label.length).toBeGreaterThan(0);
      expect(colour.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(colour.on).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("has enough colours for two hands", () => {
    expect(PICKER_COLOURS.length).toBeGreaterThanOrEqual(10);
  });
});
