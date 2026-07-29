/**
 * Seat geometry and adjacency definitions.
 *
 * Seat coordinates are expressed as *percentages* of the visualisation
 * container so both scenes scale cleanly from a small phone to a desktop.
 * Nothing here is measured in pixels.
 */

import type { PersonId } from "./family";

/** Child positions are numbered 1-5 and shared by both scenes. */
export type ChildPosition = 1 | 2 | 3 | 4 | 5;

export const CHILD_POSITIONS: readonly ChildPosition[] = [1, 2, 3, 4, 5] as const;

export type SeatPoint = {
  /** Horizontal centre of the seat, as a percentage of container width. */
  x: number;
  /** Vertical centre of the seat, as a percentage of container height. */
  y: number;
};

/**
 * Where a person walks in from at the start of the arrival animation.
 *
 * Deliberately outside the 0-100 scene box: the scene frame clips its
 * contents, so people are hidden until they step through the doorway.
 */
export type EntryPoint = SeatPoint & { id: string };

export type ChildSeat = SeatPoint & {
  position: ChildPosition;
  /** Human-readable seat name, used by the screen-reader summary. */
  label: string;
  /** The doorway this seat is reached through. */
  entry: EntryPoint;
};

export type ParentSeat = SeatPoint & {
  key: "parent1" | "parent2";
  label: string;
  entry: EntryPoint;
};

/** Any seat, once the scene no longer cares whether it holds a parent. */
export type PlacedSeat = SeatPoint & { entry: EntryPoint };

/* ------------------------------------------------------------------ */
/* Parent assignments                                                  */
/* ------------------------------------------------------------------ */

/**
 * Parents never rotate with the children. These are their default seats; the
 * app can swap the two at runtime (see `getParentAssignments`), and that
 * choice is remembered per device.
 *
 * To change the *default*, exchange the two ids in each object below.
 */
export const PARENT_ASSIGNMENTS = {
  table: {
    parent1: "nathan" as PersonId,
    parent2: "sarah" as PersonId,
  },
  vehicle: {
    /** parent1 === the driver's seat. */
    parent1: "nathan" as PersonId,
    /** parent2 === the front passenger seat. */
    parent2: "sarah" as PersonId,
  },
} as const;

export type ParentPair = { parent1: PersonId; parent2: PersonId };
export type ParentAssignments = { table: ParentPair; vehicle: ParentPair };

/**
 * The parent seating for the current preference.
 *
 * Swapping exchanges both scenes together, so whoever is in Parent Seat 1 at
 * dinner is also the one behind the wheel.
 */
export function getParentAssignments(swapped = false): ParentAssignments {
  const { table, vehicle } = PARENT_ASSIGNMENTS;
  if (!swapped) {
    return {
      table: { ...table },
      vehicle: { ...vehicle },
    };
  }
  return {
    table: { parent1: table.parent2, parent2: table.parent1 },
    vehicle: { parent1: vehicle.parent2, parent2: vehicle.parent1 },
  };
}

/* ------------------------------------------------------------------ */
/* Dinner table                                                        */
/* ------------------------------------------------------------------ */

/*
 * The table is photographed portrait, with a bench down each long side:
 *
 *        left bench        table        right bench
 *
 *         Parent 1                        Parent 2
 *         Child 1                         Child 3
 *         Child 2                         Child 4
 *                                         Child 5
 *
 * The parents take the top slot of each bench, directly across from one
 * another, and the children fill downwards. This is the same seven seats as a
 * landscape view of the table, so who sits beside whom — and therefore the
 * adjacency model and the schedule — is unchanged.
 *
 * Measured against `public/scenes/dinner-table.png` as it is actually
 * rendered: in that frame the left bench occupies x 17-27, the table 30-74 and
 * the right bench 77-87, and both benches run from y 22 to y 86. The two
 * columns sit at x 24 and x 80 — straddling bench and table edge, where a head
 * would be from directly above, and symmetric about the table's centre line.
 *
 * The children's rows are aligned across the table so that seat 1 faces seat 3
 * and seat 2 faces seat 4, which is what `TABLE_CHILD_OPPOSITES` below
 * assumes. The left bench has spare room at its foot, because it seats three
 * where the right seats four.
 */
/**
 * You reach each bench from the top of the room, so everyone files down their
 * own side of the table to their place.
 */
export const TABLE_ENTRIES = {
  leftBench: { id: "left-bench", x: 24, y: -18 },
  rightBench: { id: "right-bench", x: 80, y: -18 },
} as const satisfies Record<string, EntryPoint>;

export const TABLE_CHILD_SEATS: readonly ChildSeat[] = [
  {
    position: 1,
    x: 24,
    y: 45.5,
    label: "left bench, middle",
    entry: TABLE_ENTRIES.leftBench,
  },
  {
    position: 2,
    x: 24,
    y: 63.5,
    label: "left bench, bottom",
    entry: TABLE_ENTRIES.leftBench,
  },
  {
    position: 3,
    x: 80,
    y: 45.5,
    label: "right bench, upper middle",
    entry: TABLE_ENTRIES.rightBench,
  },
  {
    position: 4,
    x: 80,
    y: 63.5,
    label: "right bench, lower middle",
    entry: TABLE_ENTRIES.rightBench,
  },
  {
    position: 5,
    x: 80,
    y: 81,
    label: "right bench, bottom",
    entry: TABLE_ENTRIES.rightBench,
  },
] as const;

export const TABLE_PARENT_SEATS: readonly ParentSeat[] = [
  {
    key: "parent1",
    x: 24,
    y: 28,
    label: "left bench, top",
    entry: TABLE_ENTRIES.leftBench,
  },
  {
    key: "parent2",
    x: 80,
    y: 28,
    label: "right bench, top",
    entry: TABLE_ENTRIES.rightBench,
  },
] as const;

/** Seats that physically touch shoulders. Weighted most heavily. */
export const TABLE_CHILD_ADJACENCIES = [
  [1, 2],
  [3, 4],
  [4, 5],
] as const;

/** Seats directly across the table from one another. Weighted lower. */
export const TABLE_CHILD_OPPOSITES = [
  [1, 3],
  [2, 4],
] as const;

/* ------------------------------------------------------------------ */
/* Ford Expedition                                                     */
/* ------------------------------------------------------------------ */

/*
 *  Nathan                  Sarah        (driver / front passenger)
 *
 *  Child 1    Child 2    Child 3        (second row)
 *
 *  Child 4               Child 5        (third row)
 *
 * Measured against `public/scenes/expedition.png`: captain's chairs up front,
 * a three-across second row, and the two outboard seats of the third row.
 */

/**
 * The Expedition's four doors. Third-row passengers climb in through the rear
 * door on their own side, exactly as they do in real life.
 */
export const VEHICLE_ENTRIES = {
  frontLeft: { id: "front-left-door", x: -18, y: 38 },
  frontRight: { id: "front-right-door", x: 118, y: 38 },
  rearLeft: { id: "rear-left-door", x: -18, y: 64 },
  rearRight: { id: "rear-right-door", x: 118, y: 64 },
} as const satisfies Record<string, EntryPoint>;

export const VEHICLE_CHILD_SEATS: readonly ChildSeat[] = [
  {
    position: 1,
    x: 28,
    y: 59,
    label: "second row, driver side",
    entry: VEHICLE_ENTRIES.rearLeft,
  },
  {
    position: 2,
    x: 50,
    y: 59,
    label: "second row, middle",
    // The middle seat is reached by climbing in behind the driver.
    entry: VEHICLE_ENTRIES.rearLeft,
  },
  {
    position: 3,
    x: 72,
    y: 59,
    label: "second row, passenger side",
    entry: VEHICLE_ENTRIES.rearRight,
  },
  {
    position: 4,
    x: 29,
    y: 79,
    label: "third row, driver side",
    entry: VEHICLE_ENTRIES.rearLeft,
  },
  {
    position: 5,
    x: 71,
    y: 79,
    label: "third row, passenger side",
    entry: VEHICLE_ENTRIES.rearRight,
  },
] as const;

export const VEHICLE_PARENT_SEATS: readonly ParentSeat[] = [
  {
    key: "parent1",
    x: 33,
    y: 41,
    label: "driver's seat",
    entry: VEHICLE_ENTRIES.frontLeft,
  },
  {
    key: "parent2",
    x: 72,
    y: 41,
    label: "front passenger seat",
    entry: VEHICLE_ENTRIES.frontRight,
  },
] as const;

/** Side-by-side within a row. Weighted most heavily. */
export const VEHICLE_CHILD_ADJACENCIES = [
  [1, 2],
  [2, 3],
  [4, 5],
] as const;

/**
 * Third-row seats sit behind the gaps in the second row, so each third-row
 * child is "behind" the two second-row children flanking them. Weighted lower.
 */
export const VEHICLE_CHILD_OPPOSITES = [
  [1, 4],
  [2, 4],
  [2, 5],
  [3, 5],
] as const;

/* ------------------------------------------------------------------ */
/* Adjacency model                                                     */
/* ------------------------------------------------------------------ */

export type AdjacencyPair = readonly [number, number];

export type AdjacencyModel = {
  id: "table" | "vehicle";
  label: string;
  /** Shoulder-to-shoulder. */
  strong: readonly AdjacencyPair[];
  /** Across the table / directly in front or behind. */
  weak: readonly AdjacencyPair[];
};

/** Relative importance of the two kinds of proximity. */
export const ADJACENCY_WEIGHTS = { strong: 1, weak: 0.5 } as const;

export const TABLE_ADJACENCY: AdjacencyModel = {
  id: "table",
  label: "Dinner Table",
  strong: TABLE_CHILD_ADJACENCIES,
  weak: TABLE_CHILD_OPPOSITES,
};

export const VEHICLE_ADJACENCY: AdjacencyModel = {
  id: "vehicle",
  label: "Ford Expedition",
  strong: VEHICLE_CHILD_ADJACENCIES,
  weak: VEHICLE_CHILD_OPPOSITES,
};

export const ADJACENCY_MODELS: readonly AdjacencyModel[] = [
  TABLE_ADJACENCY,
  VEHICLE_ADJACENCY,
] as const;

/* ------------------------------------------------------------------ */
/* Scene layout                                                        */
/* ------------------------------------------------------------------ */

export type SceneLayout = {
  id: "table" | "vehicle";
  /** Local photograph used as the scene backdrop. */
  photo: string;
  /** CSS `aspect-ratio` for the scene frame. */
  aspect: string;
  /** The same ratio as a number (width / height), for geometry checks. */
  aspectRatio: number;
  /** Avatar diameter, in container-query height units. */
  avatarSize: number;
  /** Base text size inside a seat, in container-query height units. */
  fontSize: number;
};

/*
 * Both photographs are portrait and share the same 2:3 shape, so the two
 * scenes are defined from one set of constants. That is what guarantees an
 * avatar is rendered at exactly the same size in both cards — the cards are
 * always equal width, whether stacked on a phone or side by side on a desktop.
 *
 * Sizes are in `cqh` (a percentage of the scene's height) rather than `cqw`,
 * because in a portrait frame width-based sizing would make avatars far taller
 * than the gap between rows.
 */
const SCENE_ASPECT = "2 / 3";
const SCENE_ASPECT_RATIO = 2 / 3;

/** Avatar diameter, shared by both scenes. */
export const SCENE_AVATAR_SIZE = 12.5;

/** Seat text size, shared by both scenes. */
export const SCENE_FONT_SIZE = 2.5;

/**
 * Avatar sizes live in config rather than in the components so the seating
 * tests can prove that no two avatars overlap, at any screen size.
 */
export const TABLE_LAYOUT: SceneLayout = {
  id: "table",
  photo: "/scenes/dinner-table.png",
  aspect: SCENE_ASPECT,
  aspectRatio: SCENE_ASPECT_RATIO,
  avatarSize: SCENE_AVATAR_SIZE,
  fontSize: SCENE_FONT_SIZE,
};

export const VEHICLE_LAYOUT: SceneLayout = {
  id: "vehicle",
  photo: "/scenes/expedition.png",
  aspect: SCENE_ASPECT,
  aspectRatio: SCENE_ASPECT_RATIO,
  avatarSize: SCENE_AVATAR_SIZE,
  fontSize: SCENE_FONT_SIZE,
};

/* ------------------------------------------------------------------ */
/* Arrival choreography                                                */
/* ------------------------------------------------------------------ */

/** Seats in one scene: two parents plus five children. */
export const SEATS_PER_SCENE = 7;

/**
 * Everyone walks in through a doorway and takes their place, one after
 * another, and the whole thing lasts exactly three seconds. Both scenes run
 * the same clock, so the table and the Expedition fill up together.
 *
 * The last person starts at `(SEATS_PER_SCENE - 1) * STEP` and travels for
 * `DURATION`, which is what makes the total land on `TOTAL`. A test keeps
 * these three numbers honest if any of them is edited.
 */
export const ARRIVAL_TOTAL_MS = 3000;
export const ARRIVAL_STEP_MS = 430;
export const ARRIVAL_DURATION_MS = 420;

/** How long a parent takes to glide across to the other seat when swapped. */
export const SWAP_DURATION_MS = 620;
