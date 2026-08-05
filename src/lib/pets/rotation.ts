/**
 * Pet rotation maths. Pure functions only — nothing here touches React or the
 * database.
 *
 * The seating rotation turns over every Monday; this one turns over every
 * night. Otherwise the shape is the same: a configured anchor, the current
 * local date, and a fixed order of children.
 *
 *   childIndex = (index of the anchor child + whole days since the anchor)
 *                mod the number of children
 *
 * The anchor is a *date the answer is known for* rather than a "start date",
 * which means re-anchoring is the natural way to fix a mistake: put in last
 * night's truth and every night after it lands correctly.
 */

import type { ChildId } from "@/config/family";
import type { PetId, PetRotationConfig } from "@/config/pets";
import { differenceInCalendarDays, parseLocalDate } from "@/lib/dates";

export type PetNight = {
  petId: PetId;
  childId: ChildId;
};

/**
 * Which child sleeps with this pet on `date`.
 *
 * Dates before the anchor are handled the same as dates after it — the
 * rotation runs backwards just as happily, which is what makes "who had Bella
 * last Tuesday?" answerable.
 */
export function getPetChildOn(
  config: PetRotationConfig,
  date: Date,
): ChildId {
  const { order } = config;
  if (order.length === 0) {
    throw new Error(
      `Pet rotation for "${config.petId}" has an empty order. Check the ` +
        `petRotations collection, or src/config/pets.ts.`,
    );
  }

  const anchorDate = parseLocalDate(config.anchorDate);
  if (!anchorDate) {
    throw new Error(
      `Pet rotation for "${config.petId}" has an anchorDate of ` +
        `"${config.anchorDate}", which is not a valid YYYY-MM-DD date.`,
    );
  }

  const anchorIndex = order.indexOf(config.anchorChildId);
  if (anchorIndex < 0) {
    throw new Error(
      `Pet rotation for "${config.petId}" is anchored on ` +
        `"${config.anchorChildId}", who is not in its order.`,
    );
  }

  const elapsed = differenceInCalendarDays(anchorDate, date);
  return order[modulo(anchorIndex + elapsed, order.length)];
}

/** Tonight's answer for every animal, in configured order. */
export function getPetNights(
  configs: readonly PetRotationConfig[],
  date: Date,
): PetNight[] {
  return configs.map((config) => ({
    petId: config.petId,
    childId: getPetChildOn(config, date),
  }));
}

/* ------------------------------------------------------------------ */
/* The rule: nobody gets both animals on the same night                */
/* ------------------------------------------------------------------ */

/**
 * Two pets can never land on the same child on the same night **iff** they
 * share an order and sit at different places in it.
 *
 * Both halves matter. Same order and different offsets means the gap between
 * the two animals is a constant, so if it is not zero today it is not zero on
 * any day, forwards or backwards, forever — no simulation needed. Give the
 * pets *different* orders and that argument evaporates: the two sequences
 * drift against each other and will eventually collide.
 *
 * So this refuses anything it cannot prove, rather than proving what it is
 * given. Returns a human-readable reason, or `null` when the configuration is
 * sound.
 */
export function findSharedNightProblem(
  configs: readonly PetRotationConfig[],
): string | null {
  if (configs.length < 2) return null;

  const [first, ...rest] = configs;
  for (const config of rest) {
    if (!sameOrder(first.order, config.order)) {
      return (
        `"${first.petId}" and "${config.petId}" rotate through different ` +
        `orders of children. Two different orders drift against each other, ` +
        `so sooner or later one child gets both animals in one night.`
      );
    }
  }

  const seen = new Map<number, PetId>();
  for (const config of configs) {
    const offset = offsetOf(config);
    const clash = seen.get(offset);
    if (clash !== undefined) {
      return (
        `"${clash}" and "${config.petId}" are at the same place in the ` +
        `rotation, so the same child would get both of them every night.`
      );
    }
    seen.set(offset, config.petId);
  }

  return null;
}

/** Throws if the configuration allows a child to get both animals at once. */
export function assertNoSharedNights(
  configs: readonly PetRotationConfig[],
): void {
  const problem = findSharedNightProblem(configs);
  if (problem) throw new Error(problem);
}

/**
 * Where this pet sits in the cycle, normalised so that two configs with
 * different anchor dates are still directly comparable.
 *
 * Day zero is arbitrary — it only has to be the same for every pet — so the
 * anchor date is folded in rather than assumed to match.
 */
function offsetOf(config: PetRotationConfig): number {
  const anchorDate = parseLocalDate(config.anchorDate);
  if (!anchorDate) {
    throw new Error(
      `Pet rotation for "${config.petId}" has an invalid anchorDate ` +
        `("${config.anchorDate}").`,
    );
  }

  const anchorIndex = config.order.indexOf(config.anchorChildId);
  if (anchorIndex < 0) {
    throw new Error(
      `Pet rotation for "${config.petId}" is anchored on ` +
        `"${config.anchorChildId}", who is not in its order.`,
    );
  }

  // Days from a fixed epoch to the anchor, so the comparison does not care
  // which date each pet happens to be anchored on.
  const EPOCH = new Date(2000, 0, 1, 12, 0, 0, 0);
  const days = differenceInCalendarDays(EPOCH, anchorDate);
  return modulo(anchorIndex - days, config.order.length);
}

function sameOrder(a: readonly ChildId[], b: readonly ChildId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** `%` that returns a non-negative result for negative operands. */
function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}
