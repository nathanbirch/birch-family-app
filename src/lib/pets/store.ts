import "server-only";

import { cache } from "react";
import type { Collection, ObjectId } from "mongodb";
import { z } from "zod";

import { COLLECTIONS } from "@/config/db";
import { CHILD_IDS } from "@/config/family";
import {
  DEFAULT_PET_ROTATIONS,
  PETS,
  type PetId,
  type PetRotationConfig,
} from "@/config/pets";
import { getCollection } from "@/lib/db";

import { findSharedNightProblem } from "./rotation";

/**
 * The `petRotations` collection — the database half of the pet rotation. The
 * maths lives in `rotation.ts` and never touches Mongo.
 *
 * One document per animal:
 *
 *   { petId: "bella", order: [...five child ids...],
 *     anchorDate: "2026-08-04", anchorChildId: "hannah" }
 *
 * Reading is deliberately forgiving and writing is deliberately strict. This
 * is a page a family looks at over breakfast, so a bad or missing document
 * must not be able to take the whole seating page down — the read falls back
 * to the compiled defaults and says so in the log. The seed, by contrast,
 * refuses to write anything that would let one child end up with both animals.
 */

const PET_IDS = PETS.map((pet) => pet.id) as [PetId, ...PetId[]];

/** The stored shape, validated on the way *out* of the database. */
const petRotationSchema = z.object({
  petId: z.enum(PET_IDS),
  order: z.array(z.enum(CHILD_IDS as [string, ...string[]])).min(1),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  anchorChildId: z.enum(CHILD_IDS as [string, ...string[]]),
});

export type PetRotationDocument = {
  _id: ObjectId;
  petId: PetId;
  order: string[];
  anchorDate: string;
  anchorChildId: string;
  updatedAt: Date;
};

async function petRotations(): Promise<Collection<PetRotationDocument>> {
  return getCollection<PetRotationDocument>(COLLECTIONS.petRotations);
}

/**
 * Tonight's rotation configuration for every animal, in the order they are
 * listed in `config/pets.ts`.
 *
 * `cache()` memoises per render pass, so the page and anything else that asks
 * during the same render share one query.
 */
export const getPetRotations = cache(
  async (): Promise<readonly PetRotationConfig[]> => {
    let stored: PetRotationDocument[];
    try {
      const collection = await petRotations();
      stored = await collection.find({}).toArray();
    } catch (error) {
      return fallback("the database could not be reached", error);
    }

    const byId = new Map<PetId, PetRotationConfig>();
    for (const document of stored) {
      const parsed = petRotationSchema.safeParse(document);
      if (!parsed.success) {
        console.warn(
          `[pets] Ignoring a malformed petRotations document ` +
            `(${String(document.petId)}): ${parsed.error.message}`,
        );
        continue;
      }
      byId.set(parsed.data.petId, parsed.data as PetRotationConfig);
    }

    // Configured order, and every pet accounted for: a pet the collection has
    // no row for falls back to its compiled default rather than vanishing off
    // the page.
    const configs = PETS.map(
      (pet) =>
        byId.get(pet.id) ??
        DEFAULT_PET_ROTATIONS.find((config) => config.petId === pet.id)!,
    );

    const problem = findSharedNightProblem(configs);
    if (problem) {
      return fallback(`the stored rotation is unsafe — ${problem}`);
    }

    return configs;
  },
);

function fallback(
  reason: string,
  error?: unknown,
): readonly PetRotationConfig[] {
  console.warn(
    `[pets] Falling back to the rotation compiled into config/pets.ts: ` +
      `${reason}.${error ? ` (${describe(error)})` : ""}`,
  );
  return DEFAULT_PET_ROTATIONS;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/*
 * Seeding lives in `scripts/seed-database.ts`, alongside every other index and
 * starter document, and writes with its own short-lived client. It reuses
 * `DEFAULT_PET_ROTATIONS` and `findSharedNightProblem` from here and from
 * `rotation.ts`, so there is exactly one definition of what a correct rotation
 * is — but it does not go through `getCollection()`, whose pooled client is
 * deliberately never closed and would hang a one-shot script on exit.
 */
