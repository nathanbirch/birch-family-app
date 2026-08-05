import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@/lib/calendar/events";
import { firstInterestingHour, layoutDayEvents } from "@/lib/calendar/layout";

const DAY = new Date(2026, 7, 3); // Monday 3 August 2026
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A timed event on `DAY`, given in local hours. Fractional hours are allowed:
 * `7.25` is 7:15.
 */
function at(title: string, startHour: number, endHour: number): CalendarEvent {
  const base = new Date(2026, 7, 3).getTime();
  return {
    id: title,
    title,
    location: null,
    description: null,
    allDay: false,
    start: base + startHour * 60 * 60 * 1000,
    end: base + endHour * 60 * 60 * 1000,
    startDate: null,
    endDate: null,
  };
}

function allDay(title: string): CalendarEvent {
  return {
    id: title,
    title,
    location: null,
    description: null,
    allDay: true,
    start: Date.UTC(2026, 7, 3),
    end: Date.UTC(2026, 7, 4),
    startDate: "2026-08-03",
    endDate: "2026-08-03",
  };
}

/** Layout keyed by title, for readable assertions. */
function layout(events: CalendarEvent[]) {
  const positioned = layoutDayEvents(events, DAY);
  return new Map(positioned.map((block) => [block.event.title, block]));
}

describe("vertical placement", () => {
  it("places an event at its fraction of the day", () => {
    const blocks = layout([at("piano", 15, 16)]);
    const piano = blocks.get("piano")!;

    expect(piano.top).toBeCloseTo(15 / 24, 10);
    expect(piano.height).toBeCloseTo(1 / 24, 10);
  });

  it("gives a very short event a readable minimum height", () => {
    // A 5-minute reminder would otherwise be a 1px hairline.
    const blocks = layout([at("reminder", 9, 9 + 5 / 60)]);
    expect(blocks.get("reminder")!.height).toBeCloseTo(20 / (24 * 60), 10);
  });

  it("gives a zero-length event the same minimum", () => {
    const blocks = layout([at("ping", 9, 9)]);
    expect(blocks.get("ping")!.height).toBeGreaterThan(0);
  });

  it("leaves all-day events out entirely", () => {
    // They have no place on a time axis; the grid pins them above it.
    const blocks = layout([allDay("Hannah's Night"), at("piano", 15, 16)]);
    expect(blocks.has("Hannah's Night")).toBe(false);
    expect(blocks.has("piano")).toBe(true);
  });
});

describe("events crossing midnight", () => {
  it("clips an event that runs into the next day and flags it", () => {
    const party = at("party", 21, 28); // 9pm to 4am
    const blocks = layout([party]);
    const block = blocks.get("party")!;

    expect(block.top).toBeCloseTo(21 / 24, 10);
    // Clipped at midnight, not drawn past the bottom of the column.
    expect(block.top + block.height).toBeCloseTo(1, 10);
    expect(block.continuesInto).toBe(true);
    expect(block.continuesFrom).toBe(false);
  });

  it("clips the tail of that event on the following day", () => {
    const party = at("party", 21, 28);
    const nextDay = layoutDayEvents([party], new Date(2026, 7, 4));

    expect(nextDay).toHaveLength(1);
    expect(nextDay[0].top).toBe(0);
    expect(nextDay[0].height).toBeCloseTo(4 / 24, 10);
    expect(nextDay[0].continuesFrom).toBe(true);
    expect(nextDay[0].continuesInto).toBe(false);
  });

  it("fills the column for a day entirely inside a long event", () => {
    const holiday = at("holiday", -24, 48); // the whole of the day and beyond
    const block = layoutDayEvents([holiday], DAY)[0];

    expect(block.top).toBe(0);
    expect(block.height).toBeCloseTo(1, 10);
    expect(block.continuesFrom).toBe(true);
    expect(block.continuesInto).toBe(true);
  });
});

describe("overlap packing", () => {
  it("gives a lone event the full width", () => {
    const piano = layout([at("piano", 15, 16)]).get("piano")!;
    expect(piano.columnCount).toBe(1);
    expect(piano.column).toBe(0);
  });

  it("splits two overlapping events into two columns", () => {
    const blocks = layout([at("a", 9, 11), at("b", 10, 12)]);

    expect(blocks.get("a")!.columnCount).toBe(2);
    expect(blocks.get("b")!.columnCount).toBe(2);
    expect(blocks.get("a")!.column).toBe(0);
    expect(blocks.get("b")!.column).toBe(1);
  });

  it("keeps events that merely touch in the same column", () => {
    // 9-10 and 10-11 do not overlap; the second reuses the first's column.
    const blocks = layout([at("a", 9, 10), at("b", 10, 11)]);

    expect(blocks.get("a")!.columnCount).toBe(1);
    expect(blocks.get("b")!.column).toBe(0);
  });

  it("does not let a busy morning narrow a lone evening event", () => {
    // Monday from the real calendar: an airport run, a flight, babysitting,
    // then dinner. The morning three are one cluster and dinner is another, so
    // dinner keeps the whole width instead of being squeezed to a third.
    const blocks = layout([
      at("airport", 5.5, 6.5),
      at("flight", 6, 9.25),
      at("babysitting", 8, 12),
      at("dinner", 18, 19),
    ]);

    expect(blocks.get("dinner")!.columnCount).toBe(1);
    expect(blocks.get("dinner")!.column).toBe(0);

    // Three events, but only two columns: the airport run finishes at 6:30 and
    // babysitting does not start until 8, so it reuses that column rather than
    // opening a third and making everything narrower than it needs to be.
    expect(blocks.get("babysitting")!.columnCount).toBe(2);
    expect(blocks.get("airport")!.column).toBe(0);
    expect(blocks.get("flight")!.column).toBe(1);
    expect(blocks.get("babysitting")!.column).toBe(0);
  });

  it("reuses a freed column later in the same cluster", () => {
    // `a` spans the cluster; `b` and `c` are sequential beside it, so `c`
    // takes column 1 again rather than opening a third.
    const blocks = layout([at("a", 9, 15), at("b", 9, 11), at("c", 11, 13)]);

    expect(blocks.get("a")!.column).toBe(0);
    expect(blocks.get("b")!.column).toBe(1);
    expect(blocks.get("c")!.column).toBe(1);
    expect(blocks.get("a")!.columnCount).toBe(2);
  });

  it("puts the longer event on the left when two start together", () => {
    const blocks = layout([at("short", 9, 10), at("long", 9, 13)]);
    expect(blocks.get("long")!.column).toBe(0);
    expect(blocks.get("short")!.column).toBe(1);
  });

  it("does not stack two back-to-back zero-length events in one column", () => {
    // Both are widened to the minimum slot, so they genuinely collide and must
    // be given separate columns rather than drawn on top of each other.
    const blocks = layout([at("ping", 9, 9), at("pong", 9.1, 9.1)]);
    expect(blocks.get("ping")!.column).not.toBe(blocks.get("pong")!.column);
  });

  it("never places two overlapping events in the same column", () => {
    // A brute-force check over a messy day, since this is the invariant the
    // whole algorithm exists to guarantee.
    const events = [
      at("a", 5.5, 6.5),
      at("b", 6, 9.25),
      at("c", 8, 12),
      at("d", 8.5, 9),
      at("e", 9, 10),
      at("f", 11, 11.5),
      at("g", 14, 18),
      at("h", 15, 16),
    ];
    const blocks = layoutDayEvents(events, DAY);

    for (const one of blocks) {
      for (const other of blocks) {
        if (one === other) continue;
        if (one.column !== other.column) continue;

        const oneEnd = one.top + one.height;
        const otherEnd = other.top + other.height;
        const overlaps = one.top < otherEnd && oneEnd > other.top;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("keeps every block inside its share of the width", () => {
    const blocks = layoutDayEvents(
      [at("a", 9, 11), at("b", 10, 12), at("c", 10.5, 11)],
      DAY,
    );
    for (const block of blocks) {
      expect(block.column).toBeGreaterThanOrEqual(0);
      expect(block.column).toBeLessThan(block.columnCount);
    }
  });
});

describe("firstInterestingHour", () => {
  it("opens an hour before the earliest event", () => {
    expect(firstInterestingHour([at("piano", 15, 16)], [DAY], 7)).toBe(14);
  });

  it("falls back when there is nothing on", () => {
    expect(firstInterestingHour([], [DAY], 7)).toBe(7);
  });

  it("does not go above midnight", () => {
    expect(firstInterestingHour([at("early", 0.5, 1)], [DAY], 7)).toBe(0);
  });

  it("ignores an event running in from the previous day", () => {
    // It starts at midnight in this column and would drag the grid to the top
    // for no benefit, hiding the day's real first event.
    const overnight = at("overnight", -3, 2);
    expect(firstInterestingHour([overnight, at("piano", 15, 16)], [DAY], 7)).toBe(14);
  });

  it("takes the earliest across a whole week", () => {
    const days = Array.from(
      { length: 7 },
      (_, offset) => new Date(2026, 7, 3 + offset),
    );
    const wednesday = new Date(2026, 7, 5).getTime() + 6 * 60 * 60 * 1000;
    const early: CalendarEvent = {
      ...at("early", 0, 0),
      start: wednesday,
      end: wednesday + 60 * 60 * 1000,
    };

    expect(firstInterestingHour([at("piano", 15, 16), early], days, 7)).toBe(5);
  });
});

describe("fractions are safe to render as percentages", () => {
  it("keeps every block within the day", () => {
    const events = [at("a", -5, 3), at("b", 9, 10), at("c", 22, 30)];
    for (const block of layoutDayEvents(events, DAY)) {
      expect(block.top).toBeGreaterThanOrEqual(0);
      expect(block.top).toBeLessThanOrEqual(1);
      expect(block.top + block.height).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("measures against a real 24-hour day", () => {
    // Guards the constant: a day is 86,400,000ms and `top` is a fraction of it.
    const piano = layout([at("piano", 12, 13)]).get("piano")!;
    expect(piano.top * MS_PER_DAY).toBeCloseTo(12 * 60 * 60 * 1000, 5);
  });
});
