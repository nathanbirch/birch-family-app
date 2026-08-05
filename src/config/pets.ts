/**
 * The family's animals, and where their nightly rotation starts.
 *
 * The split here is deliberate and worth reading before changing anything:
 *
 *  - **Who the animals are** — names, photographs, where a child's face is
 *    pinned on them — is compiled into the app, exactly like the family roster
 *    in `family.ts`. It changes when a photograph changes, which is a deploy.
 *  - **Who sleeps with whom** lives in MongoDB, in the `petRotations`
 *    collection, so it can be re-anchored without a deploy. What is below is
 *    the *seed* for that collection and the fallback the page falls back to if
 *    the database cannot be reached — see `src/lib/pets/store.ts`.
 */

import type { ChildId } from "./family";
import { PET_PHOTO_SOURCES } from "./pet-manifest";

export type PetId = "bella" | "leia";

export type Pet = {
  id: PetId;
  name: string;
  /** Shown under the name, e.g. "Dog". */
  species: string;
  /** Optimised, content-hashed photograph from `pet-manifest.ts`. */
  photo: string;
  /** Alt text for the photograph. */
  alt: string;
  /**
   * Where the child's avatar is pinned on the animal, as percentages of the
   * photograph.
   *
   * These are picked by eye against the *generated* file, which is safe
   * because `scripts/optimise-pets.mjs` trims and centres every pet on one
   * fixed canvas — so the geometry is reproducible. Replace a master with a
   * differently-posed photo and these need picking again.
   */
  avatarSpot: { x: number; y: number };
};

export const PETS: readonly Pet[] = [
  {
    id: "bella",
    name: "Bella",
    species: "Dog",
    photo: PET_PHOTO_SOURCES.bella,
    alt: "Bella, the family's cream-coloured dog, lying down",
    avatarSpot: { x: 34, y: 47 },
  },
  {
    id: "leia",
    name: "Leia",
    species: "Cat",
    photo: PET_PHOTO_SOURCES.leia,
    alt: "Leia, the family's ginger cat, curled up",
    avatarSpot: { x: 36, y: 50 },
  },
] as const;

const BY_ID = new Map(PETS.map((pet) => [pet.id, pet]));

export function getPet(id: PetId): Pet {
  const pet = BY_ID.get(id);
  if (!pet) {
    throw new Error(`Unknown pet id: "${id}". Check config/pets.ts.`);
  }
  return pet;
}

/* ------------------------------------------------------------------ */
/* The rotation                                                        */
/* ------------------------------------------------------------------ */

/**
 * The order the children take their turn in, shared by both animals.
 *
 * Both pets walk the *same* list; they are simply at different places in it.
 * That is what makes "nobody gets both animals on the same night" a property
 * of the configuration rather than something to check every evening — see
 * `src/lib/pets/rotation.ts`.
 */
export const PET_ROTATION_ORDER: readonly ChildId[] = [
  "hannah",
  "emily",
  "clara",
  "william",
  "james",
] as const;

export type PetRotationConfig = {
  petId: PetId;
  /** The order children take their turn in. */
  order: readonly ChildId[];
  /** A local calendar date, `YYYY-MM-DD`, that `anchorChildId` is true for. */
  anchorDate: string;
  /** Who sleeps with this pet on `anchorDate`. */
  anchorChildId: ChildId;
};

/**
 * The starting point, as told to the app on the evening of 4 August 2026:
 * Hannah had Bella that night and William had Leia.
 *
 * Hannah is index 0 and William index 3, so the two animals sit three places
 * apart in a five-child cycle and stay three places apart forever. Change
 * either anchor and keep the gap off zero, or two children become one child
 * with two animals — `assertNoSharedNights` will refuse the configuration if
 * you do.
 */
export const DEFAULT_PET_ROTATIONS: readonly PetRotationConfig[] = [
  {
    petId: "bella",
    order: PET_ROTATION_ORDER,
    anchorDate: "2026-08-04",
    anchorChildId: "hannah",
  },
  {
    petId: "leia",
    order: PET_ROTATION_ORDER,
    anchorDate: "2026-08-04",
    anchorChildId: "william",
  },
] as const;
