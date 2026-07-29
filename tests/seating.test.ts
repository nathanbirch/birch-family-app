import { describe, expect, it } from "vitest";

import { FAMILY, getPerson } from "@/config/family";
import {
  ARRIVAL_DURATION_MS,
  ARRIVAL_STEP_MS,
  ARRIVAL_TOTAL_MS,
  getParentAssignments,
  PARENT_ASSIGNMENTS,
  SEATS_PER_SCENE,
  TABLE_CHILD_SEATS,
  TABLE_LAYOUT,
  TABLE_PARENT_SEATS,
  VEHICLE_CHILD_SEATS,
  VEHICLE_LAYOUT,
  VEHICLE_PARENT_SEATS,
  type PlacedSeat,
  type SceneLayout,
} from "@/config/seating";
import { getRotationStartDate, getWeeklyAssignments } from "@/lib/rotation";
import { getTableSummary, getVehicleSummary } from "@/lib/seating-summary";

const START = getRotationStartDate();
const WEEK_3 = getWeeklyAssignments(new Date(2026, 7, 17, 12), START);

/*
 * Rough width of a name pill, in the same "percentage of scene width" units
 * as the avatar footprint. 0.55em per character is a conservative estimate
 * for a semibold UI face, plus 1.2em of horizontal padding.
 */
function labelWidth(layout: SceneLayout, name: string) {
  const fontPercentOfWidth = layout.fontSize / layout.aspectRatio;
  return fontPercentOfWidth * (name.length * 0.55 + 1.2);
}

/*
 * Avatar sizes are configured in `cqh` — a percentage of the scene's height.
 * Converting to a percentage of its width needs the aspect ratio, and once
 * both footprints are in the same units we can prove no two avatars can
 * ever overlap, at any screen size, because everything scales together.
 */
function footprint(layout: SceneLayout) {
  return {
    width: layout.avatarSize / layout.aspectRatio,
    height: layout.avatarSize,
    // Name label sits below the avatar: a small gap plus roughly one and a
    // half lines of text.
    labelHeight: layout.fontSize * 1.6 + layout.avatarSize * 0.05,
  };
}

const SCENES: Array<{ layout: SceneLayout; seats: PlacedSeat[] }> = [
  {
    layout: TABLE_LAYOUT,
    seats: [...TABLE_CHILD_SEATS, ...TABLE_PARENT_SEATS],
  },
  {
    layout: VEHICLE_LAYOUT,
    seats: [...VEHICLE_CHILD_SEATS, ...VEHICLE_PARENT_SEATS],
  },
];

describe("seat geometry", () => {
  it("keeps every seat inside the scene, expressed as percentages", () => {
    const seats = [
      ...TABLE_CHILD_SEATS,
      ...TABLE_PARENT_SEATS,
      ...VEHICLE_CHILD_SEATS,
      ...VEHICLE_PARENT_SEATS,
    ];
    for (const seat of seats) {
      expect(seat.x).toBeGreaterThan(0);
      expect(seat.x).toBeLessThan(100);
      expect(seat.y).toBeGreaterThan(0);
      expect(seat.y).toBeLessThan(100);
    }
  });

  it("never lets two avatars overlap", () => {
    for (const { layout, seats } of SCENES) {
      const { width, height } = footprint(layout);
      for (let i = 0; i < seats.length; i += 1) {
        for (let j = i + 1; j < seats.length; j += 1) {
          const dx = Math.abs(seats[i].x - seats[j].x);
          const dy = Math.abs(seats[i].y - seats[j].y);
          expect(
            dx >= width || dy >= height,
            `${layout.id}: seats ${i} and ${j} overlap`,
          ).toBe(true);
        }
      }
    }
  });

  it("never lets a name label collide with the avatar below it", () => {
    for (const { layout, seats } of SCENES) {
      const { width, height, labelHeight } = footprint(layout);
      for (const a of seats) {
        for (const b of seats) {
          if (a === b || b.y <= a.y) continue;
          const sameColumn = Math.abs(a.x - b.x) < width;
          if (!sameColumn) continue;
          const labelBottom = a.y + height / 2 + labelHeight;
          expect(
            labelBottom <= b.y - height / 2,
            `${layout.id}: label under seat at ${a.x},${a.y} reaches ${b.x},${b.y}`,
          ).toBe(true);
        }
      }
    }
  });

  it("leaves room for the longest name beside every neighbouring seat", () => {
    const longest = FAMILY.reduce(
      (a, b) => (b.name.length > a.name.length ? b : a),
      FAMILY[0],
    ).name;

    for (const { layout, seats } of SCENES) {
      const { height } = footprint(layout);
      const width = labelWidth(layout, longest);
      for (let i = 0; i < seats.length; i += 1) {
        for (let j = i + 1; j < seats.length; j += 1) {
          const dx = Math.abs(seats[i].x - seats[j].x);
          const dy = Math.abs(seats[i].y - seats[j].y);
          // Labels only compete when two seats share a row.
          if (dy >= height) continue;
          expect(
            dx >= width,
            `${layout.id}: "${longest}" labels would touch between seats ${i} and ${j}`,
          ).toBe(true);
        }
      }
    }
  });

  it("keeps every avatar and its label inside the scene frame", () => {
    for (const { layout, seats } of SCENES) {
      const { width, height, labelHeight } = footprint(layout);
      for (const seat of seats) {
        expect(seat.x - width / 2).toBeGreaterThanOrEqual(0);
        expect(seat.x + width / 2).toBeLessThanOrEqual(100);
        expect(seat.y - height / 2).toBeGreaterThanOrEqual(0);
        expect(seat.y + height / 2 + labelHeight).toBeLessThanOrEqual(100);
      }
    }
  });

  it("seats three on the left bench and four on the right bench", () => {
    const all = [...TABLE_CHILD_SEATS, ...TABLE_PARENT_SEATS];
    expect(all.filter((seat) => seat.x < 50)).toHaveLength(3);
    expect(all.filter((seat) => seat.x > 50)).toHaveLength(4);
  });

  it("renders avatars at exactly the same size in both scenes", () => {
    // Same shape and same sizing constants, so equal-width cards produce
    // pixel-identical avatars in the table and the Expedition.
    expect(TABLE_LAYOUT.aspect).toBe(VEHICLE_LAYOUT.aspect);
    expect(TABLE_LAYOUT.aspectRatio).toBe(VEHICLE_LAYOUT.aspectRatio);
    expect(TABLE_LAYOUT.avatarSize).toBe(VEHICLE_LAYOUT.avatarSize);
    expect(TABLE_LAYOUT.fontSize).toBe(VEHICLE_LAYOUT.fontSize);
  });

  it("points both scenes at local photographs", () => {
    for (const layout of [TABLE_LAYOUT, VEHICLE_LAYOUT]) {
      expect(layout.photo.startsWith("/")).toBe(true);
      expect(layout.photo).not.toMatch(/^https?:/);
    }
  });

  it("lays the Expedition out as 2 + 3 + 2", () => {
    expect(VEHICLE_PARENT_SEATS).toHaveLength(2);
    expect(VEHICLE_CHILD_SEATS.filter((seat) => seat.position <= 3)).toHaveLength(3);
    expect(VEHICLE_CHILD_SEATS.filter((seat) => seat.position >= 4)).toHaveLength(2);
  });
});

describe("arrival choreography", () => {
  it("has one entry point per seat, all outside the scene", () => {
    for (const { seats } of SCENES) {
      expect(seats).toHaveLength(SEATS_PER_SCENE);
      for (const seat of seats) {
        expect(seat.entry).toBeTruthy();
        const outside =
          seat.entry.x < 0 ||
          seat.entry.x > 100 ||
          seat.entry.y < 0 ||
          seat.entry.y > 100;
        expect(outside, `${seat.entry.id} must start off-scene`).toBe(true);
      }
    }
  });

  it("gives the table two doorways and the Expedition four", () => {
    const doorways = (seats: PlacedSeat[]) =>
      new Set(seats.map((seat) => seat.entry.id));
    expect(doorways(SCENES[0].seats).size).toBe(2);
    expect(doorways(SCENES[1].seats).size).toBe(4);
  });

  it("seats everyone within exactly three seconds", () => {
    // The last person starts after every other has had their turn.
    const lastStart = (SEATS_PER_SCENE - 1) * ARRIVAL_STEP_MS;
    expect(lastStart + ARRIVAL_DURATION_MS).toBe(ARRIVAL_TOTAL_MS);
  });

  it("moves one person at a time", () => {
    // A person finishes before the next one is more than a moment in, so the
    // sequence reads as a queue rather than a crowd.
    expect(ARRIVAL_DURATION_MS).toBeLessThanOrEqual(ARRIVAL_STEP_MS);
  });
});

describe("parent assignments", () => {
  it("puts Nathan and Sarah in their fixed seats", () => {
    expect(PARENT_ASSIGNMENTS.table.parent1).toBe("nathan");
    expect(PARENT_ASSIGNMENTS.table.parent2).toBe("sarah");
    expect(PARENT_ASSIGNMENTS.vehicle.parent1).toBe("nathan");
    expect(PARENT_ASSIGNMENTS.vehicle.parent2).toBe("sarah");
  });

  it("swaps both scenes together", () => {
    const normal = getParentAssignments(false);
    const swapped = getParentAssignments(true);

    expect(normal.table.parent1).toBe("nathan");
    expect(swapped.table.parent1).toBe("sarah");
    expect(swapped.table.parent2).toBe("nathan");
    // Whoever takes Parent Seat 1 at dinner also takes the wheel.
    expect(swapped.vehicle.parent1).toBe(swapped.table.parent1);
    expect(swapped.vehicle.parent2).toBe(swapped.table.parent2);
  });

  it("returns to the configured seats when swapped twice", () => {
    const once = getParentAssignments(true);
    const twice = getParentAssignments(false);
    expect(twice.table).toEqual(PARENT_ASSIGNMENTS.table);
    expect(once.table).not.toEqual(twice.table);
  });

  it("does not let a swap leak into the default config", () => {
    getParentAssignments(true);
    expect(PARENT_ASSIGNMENTS.table.parent1).toBe("nathan");
  });

  it("swaps the parents in the weekly assignments", () => {
    const date = new Date(2026, 7, 17, 12);
    const normal = getWeeklyAssignments(date, START);
    const swapped = getWeeklyAssignments(date, START, undefined, {
      swapParents: true,
    });

    expect(swapped.tableParents.parent1).toBe(normal.tableParents.parent2);
    expect(swapped.vehicleParents.parent1).toBe(normal.vehicleParents.parent2);
    // The children are untouched by a parent swap.
    expect(swapped.children).toEqual(normal.children);
  });

  it("never rotates the parents", () => {
    for (const iso of [
      new Date(2026, 7, 3, 12),
      new Date(2026, 7, 17, 12),
      new Date(2027, 0, 4, 12),
    ]) {
      const assignments = getWeeklyAssignments(iso, START);
      expect(assignments.tableParents.parent1).toBe("nathan");
      expect(assignments.vehicleParents.parent2).toBe("sarah");
    }
  });
});

describe("family configuration", () => {
  it("has two parents and five children with unique ids", () => {
    expect(FAMILY.filter((m) => m.role === "parent")).toHaveLength(2);
    expect(FAMILY.filter((m) => m.role === "child")).toHaveLength(5);
    expect(new Set(FAMILY.map((m) => m.id)).size).toBe(FAMILY.length);
  });

  it("gives everyone a distinct identifying colour", () => {
    expect(new Set(FAMILY.map((m) => m.avatarColor)).size).toBe(FAMILY.length);
  });

  it("throws loudly for an unknown id", () => {
    // @ts-expect-error deliberately invalid, to prove misconfiguration fails fast
    expect(() => getPerson("grandma")).toThrow(/Unknown family member/);
  });
});

describe("screen-reader summaries", () => {
  it("describes all seven dinner-table seats", () => {
    const lines = getTableSummary(WEEK_3);
    expect(lines).toHaveLength(7);
    expect(lines[0].text).toContain("Nathan is in Parent Seat 1");
    expect(lines[1].text).toContain("Sarah is in Parent Seat 2");
    for (const line of lines) expect(line.text).toMatch(/\.$/);
  });

  it("describes all seven Expedition seats", () => {
    const lines = getVehicleSummary(WEEK_3);
    expect(lines).toHaveLength(7);
    expect(lines[0].text).toContain("driver's seat");
    expect(lines[1].text).toContain("front passenger seat");
  });

  it("matches the assignments the graphics render", () => {
    const table = getTableSummary(WEEK_3);
    const vehicle = getVehicleSummary(WEEK_3);

    for (const entry of WEEK_3.children) {
      const name = getPerson(entry.childId).name;
      expect(
        table.some(
          (line) =>
            line.id === `table-child-${entry.position}` &&
            line.text.startsWith(name),
        ),
      ).toBe(true);
      // The same child holds the same position number in both scenes.
      expect(
        vehicle.some(
          (line) =>
            line.id === `vehicle-child-${entry.position}` &&
            line.text.startsWith(name),
        ),
      ).toBe(true);
    }
  });

  it("gives every summary line a unique key", () => {
    const ids = [...getTableSummary(WEEK_3), ...getVehicleSummary(WEEK_3)].map(
      (line) => line.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
