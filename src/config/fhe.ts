/**
 * Family Home Evening: the seven jobs, who does them, and where each person
 * stands in the picture of the house.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A THIRD ROTATION AND NOT A THIRD SCENE
 * ---------------------------------------------------------------------------
 * The dinner table and the Expedition are two views of *one* rotation: five
 * children moving through five numbered positions on a five-week cycle, with
 * the parents parked in seats of their own. This is a different thing wearing
 * the same clothes:
 *
 *  - **All seven people are in it.** Nathan and Sarah take a job like everybody
 *    else, so there is no parent/child split here and nothing to swap.
 *  - **It turns over on Sunday, not Monday.** See `src/lib/fhe.ts`.
 *  - **It is a single shift, not a Latin square.** Everyone moves down one room
 *    each week and the order of people never changes, which is the whole point:
 *    the family can see next week's jobs by looking one room further down.
 *
 * So it shares the *drawing* machinery — `<Seat>`, `<Avatar>`, `<SceneCard>`,
 * the arrival choreography in `config/seating.ts` — and none of the rotation
 * machinery. Mixing it into `config/rotation.ts` would have meant a schedule
 * type with a "which day does this one change on" flag and five-child arrays
 * that sometimes hold seven people.
 */

import type { PersonId } from "./family";
import type { EntryPoint, SceneLayout } from "./seating";

/* ------------------------------------------------------------------ */
/* The jobs                                                            */
/* ------------------------------------------------------------------ */

export type FheRoleId =
  | "opening-prayer"
  | "song"
  | "scripture"
  | "lesson"
  | "activity"
  | "treat"
  | "closing-prayer";

export type FheRole = {
  id: FheRoleId;
  /** The job, exactly as it is painted on the wall of its room. */
  label: string;
  /**
   * Where the person stands in the room, as percentages of the photograph —
   * `x` across, `y` down.
   *
   * ---------------------------------------------------------------------
   * `y` IS THE MIDDLE OF THE WHOLE STACK, NOT THE MIDDLE OF THE FACE
   * ---------------------------------------------------------------------
   * `<Seat>` centres avatar *and* name label on the point, so the top of the
   * head is a good `(gap + label) / 2` — around 2% of the frame — above `y`,
   * and the label hangs the same distance below the bottom of the circle.
   * Reading these numbers as "where the face goes" is how the first pass put
   * seven faces on top of seven painted words.
   *
   * Every one of them is measured against the picture rather than guessed at,
   * because the room's title is a *word*: the head must clear the last letter
   * (descenders included) and the label must not land on the title of the room
   * below. Where a room had a choice, the label is put somewhere that looks
   * deliberate — the rug in the Opening Prayer room, the craft table in the
   * Activity room.
   *
   * The numbers therefore go with `FHE_LAYOUT.avatarSize` below: make the
   * avatars bigger and every spot has to be measured again.
   */
  spot: { x: number; y: number };
  /** The doorway this person comes in through. */
  entry: EntryPoint;
};

/**
 * The house has a door at each end and a front door in the middle, and people
 * arrive through whichever one is nearest their room — so the walk-in reads as
 * seven people coming home rather than seven avatars fading up.
 *
 * All three are outside the 0-100 frame, which clips its contents, so nobody
 * is visible until they are through the door.
 */
export const FHE_ENTRIES = {
  left: { id: "house-left", x: -16, y: 50 },
  right: { id: "house-right", x: 116, y: 50 },
  frontDoor: { id: "house-front-door", x: 50, y: 122 },
} as const satisfies Record<string, EntryPoint>;

/**
 * The seven jobs **in rotation order**, which is also top-to-bottom order in
 * the picture: the three upstairs rooms, then the two middle rooms, then the
 * two downstairs.
 *
 * This order is the rotation. Reordering this array reassigns every job —
 * see `src/lib/fhe.ts` — so add nothing to the middle of it casually.
 */
export const FHE_ROLES: readonly FheRole[] = [
  {
    id: "opening-prayer",
    label: "Opening Prayer",
    // Title bottom 19.5% — a two-line title, so the lowest of the upstairs
    // three. Dropped again so the name label lands on the rug rather than on
    // the floorboards.
    spot: { x: 23.2, y: 31.2 },
    entry: FHE_ENTRIES.left,
  },
  {
    id: "song",
    label: "Song",
    // Title bottom 47.9%, and the g of "Song" descends into the head below it.
    // Nudged right rather than down: the word ends at 23.6% across, so a small
    // step sideways clears the tail without crowding the Activity room's title.
    spot: { x: 24.3, y: 56.4 },
    entry: FHE_ENTRIES.left,
  },
  {
    id: "scripture",
    label: "Scripture",
    // Title bottom 20.4%.
    spot: { x: 50.2, y: 31.3 },
    entry: FHE_ENTRIES.frontDoor,
  },
  {
    id: "lesson",
    label: "Lesson",
    /*
     * The tightest room in the house. Its own title ends at 48.4% and "Closing
     * Prayer" is painted 68.6% down in the room below, which leaves barely more
     * than one avatar-and-label between them — so this spot has the smallest
     * clearance above and below of the seven, and is nudged right of its title
     * as well as under it.
     */
    spot: { x: 77.2, y: 58.7 },
    entry: FHE_ENTRIES.right,
  },
  {
    id: "activity",
    label: "Activity",
    // Title bottom 73.1%; the name label lands over the craft table.
    spot: { x: 21.8, y: 81.6 },
    entry: FHE_ENTRIES.left,
  },
  {
    id: "treat",
    label: "Treat",
    // Title bottom 23.9% — lower on the wall than the other two upstairs
    // rooms, so this avatar sits lower than they do, and right of the word
    // rather than under the popcorn machine.
    spot: { x: 79.7, y: 34.8 },
    entry: FHE_ENTRIES.right,
  },
  {
    id: "closing-prayer",
    label: "Closing Prayer",
    // Title bottom 72.6%, descender of the y included. The lowest spot in the
    // house: its name label finishes at 95% of the frame, with the sofa behind
    // the face rather than the words above it.
    spot: { x: 75.2, y: 85.9 },
    entry: FHE_ENTRIES.right,
  },
] as const;

/** How many weeks until everybody is back on the job they started with. */
export const FHE_CYCLE_LENGTH = FHE_ROLES.length;

/* ------------------------------------------------------------------ */
/* The people, and the anchor                                          */
/* ------------------------------------------------------------------ */

/**
 * The family in the order the jobs walk through them. Fixed forever: the whole
 * family moves down the house together, so the person after you this week is
 * the person after you every week.
 *
 * Oldest to youngest, parents first, which is the order everyone in this house
 * says the names in anyway.
 */
export const FHE_PERSON_ORDER: readonly PersonId[] = [
  "nathan",
  "sarah",
  "hannah",
  "emily",
  "clara",
  "william",
  "james",
] as const;

/**
 * One week whose answer is known, and the whole rotation is derived from it.
 *
 * The same shape as the pets' `anchorDate` and the chore pools' `anchorWeek`,
 * and for the same reason: an anchor is a fact ("on this Sunday, Nathan had the
 * Activity"), so fixing a mistake means re-anchoring rather than back-filling.
 * Naming one person and one job is enough, because `FHE_PERSON_ORDER` and
 * `FHE_ROLES` fix everybody else relative to them.
 *
 * `sunday` must be a Sunday: the rotation turns over at midnight going into
 * Sunday, and an anchor set to a Wednesday would quietly move the changeover to
 * Wednesdays. `tests/fhe.test.ts` checks that it is one.
 */
export const FHE_ANCHOR = {
  /** The Sunday the rotation started, as a local calendar date. */
  sunday: "2026-08-16",
  personId: "nathan" as PersonId,
  roleId: "activity" as FheRoleId,
} as const;

/* ------------------------------------------------------------------ */
/* Scene layout                                                        */
/* ------------------------------------------------------------------ */

/**
 * The photograph's own pixel dimensions, used as the frame's aspect ratio so
 * the picture is never cropped and the coordinates above always mean the same
 * spot on the wall.
 */
export const FHE_PHOTO_WIDTH = 1672;
export const FHE_PHOTO_HEIGHT = 940;

/**
 * Landscape, and the full width of the page — the picture is a cutaway of the
 * whole house, so it is as wide as the dinner table and the Expedition are
 * side by side rather than sharing a column with either.
 *
 * Sizes stay in `cqh` (a percentage of the frame's *height*), exactly as the
 * two portrait scenes do. The frame has a fixed aspect ratio, so `cqh` and
 * `cqw` differ only by a constant here — keeping the unit the same as the
 * other scenes is what lets `tests/fhe.test.ts` reuse their geometry checks.
 *
 * ---------------------------------------------------------------------------
 * WHY THE NUMBER IS BIGGER THAN THE SEATING SCENES' AND THE FACES ARE NOT
 * ---------------------------------------------------------------------------
 * A face here should be the same size as a face at the dinner table — they are
 * the same people on the same screen, and a smaller Clara upstairs just looks
 * like a mistake. But `cqh` is a percentage of the frame's *height*, and on the
 * two-column layout the family reads this on, the house is twice as wide and
 * therefore a good deal shorter than either seating card:
 *
 *   seating frame  ~436 x 654    12.5cqh -> 82px
 *   house frame    ~936 x 526    12.5cqh -> 66px
 *
 * So the same number would draw a visibly smaller face. Matching the *pixels*
 * needs 12.5 x (654 / 526) ≈ 15.5 — except that the Lesson room cannot hold an
 * avatar and a name label that big without the label landing on the words
 * "Closing Prayer" painted below it. 14.5 is the largest that clears every
 * painted title in the house, and it is within a few per cent of matching, which
 * no one can see. The label keeps the seating scenes' 2.5 for the same reason:
 * bigger reads better, and bigger does not fit.
 */
export const FHE_LAYOUT: SceneLayout & { id: "fhe" } = {
  id: "fhe",
  photo: "/scenes/family-home-evening.jpg",
  aspect: `${FHE_PHOTO_WIDTH} / ${FHE_PHOTO_HEIGHT}`,
  aspectRatio: FHE_PHOTO_WIDTH / FHE_PHOTO_HEIGHT,
  avatarSize: 14.5,
  fontSize: 2.5,
};
