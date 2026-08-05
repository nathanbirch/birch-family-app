import { describe, expect, it } from "vitest";

import { CHILD_IDS, type ChildId } from "@/config/family";
import {
  DEFAULT_PET_ROTATIONS,
  PETS,
  PET_ROTATION_ORDER,
  type PetRotationConfig,
} from "@/config/pets";
import {
  assertNoSharedNights,
  findSharedNightProblem,
  getPetChildOn,
  getPetNights,
} from "@/lib/pets/rotation";

/** Local date at noon, so tests never depend on the machine's timezone. */
function localDate(iso: string, hour = 12): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function configFor(petId: "bella" | "leia"): PetRotationConfig {
  const config = DEFAULT_PET_ROTATIONS.find((c) => c.petId === petId);
  if (!config) throw new Error(`No default rotation for ${petId}`);
  return config;
}

const BELLA = configFor("bella");
const LEIA = configFor("leia");

describe("configuration sanity", () => {
  it("rotates through all five children, and only children", () => {
    expect([...PET_ROTATION_ORDER].sort()).toEqual([...CHILD_IDS].sort());
  });

  it("has a rotation configured for every pet", () => {
    for (const pet of PETS) {
      expect(DEFAULT_PET_ROTATIONS.map((c) => c.petId)).toContain(pet.id);
    }
  });

  it("starts where the family said it does", () => {
    // Told to the app on the evening of 4 August 2026.
    const night = localDate("2026-08-04");
    expect(getPetChildOn(BELLA, night)).toBe("hannah");
    expect(getPetChildOn(LEIA, night)).toBe("william");
  });
});

describe("the nightly rotation", () => {
  it("moves one child down the order each night", () => {
    const nights: [string, ChildId][] = [
      ["2026-08-04", "hannah"],
      ["2026-08-05", "emily"],
      ["2026-08-06", "clara"],
      ["2026-08-07", "william"],
      ["2026-08-08", "james"],
      ["2026-08-09", "hannah"],
      ["2026-08-10", "emily"],
    ];

    for (const [iso, child] of nights) {
      expect(getPetChildOn(BELLA, localDate(iso))).toBe(child);
    }
  });

  it("keeps Leia three places ahead of Bella, always", () => {
    for (let day = 0; day < 40; day += 1) {
      const date = localDate("2026-08-04");
      date.setDate(date.getDate() + day);

      const bella = PET_ROTATION_ORDER.indexOf(getPetChildOn(BELLA, date));
      const leia = PET_ROTATION_ORDER.indexOf(getPetChildOn(LEIA, date));
      expect((leia - bella + 5) % 5).toBe(3);
    }
  });

  it("runs backwards too, so past nights are answerable", () => {
    expect(getPetChildOn(BELLA, localDate("2026-08-03"))).toBe("james");
    // Five nights earlier is a whole cycle back, so it comes round to Hannah.
    expect(getPetChildOn(BELLA, localDate("2026-07-30"))).toBe("hannah");
    expect(getPetChildOn(LEIA, localDate("2026-08-03"))).toBe("clara");
  });

  it("is the same answer all evening and all morning", () => {
    // A rotation that changed at some hour of the day rather than at midnight
    // would show one child at bedtime and another at breakfast.
    for (const hour of [0, 7, 12, 19, 23]) {
      expect(getPetChildOn(BELLA, localDate("2026-08-05", hour))).toBe("emily");
    }
  });

  it("does not slip a day across a daylight-saving boundary", () => {
    // US DST ends 1 November 2026; the day before it is 25 hours long.
    const before = getPetChildOn(BELLA, localDate("2026-10-31"));
    const after = getPetChildOn(BELLA, localDate("2026-11-01"));
    const index = PET_ROTATION_ORDER.indexOf(before);
    expect(after).toBe(PET_ROTATION_ORDER[(index + 1) % 5]);
  });

  it("reports every pet at once, in configured order", () => {
    const nights = getPetNights(DEFAULT_PET_ROTATIONS, localDate("2026-08-04"));
    expect(nights).toEqual([
      { petId: "bella", childId: "hannah" },
      { petId: "leia", childId: "william" },
    ]);
  });
});

describe("nobody gets both animals on the same night", () => {
  it("holds for the configured rotation, every night for five years", () => {
    const date = localDate("2026-08-04");
    for (let day = 0; day < 365 * 5; day += 1) {
      const nights = getPetNights(DEFAULT_PET_ROTATIONS, date);
      const children = new Set(nights.map((night) => night.childId));
      expect(children.size).toBe(nights.length);
      date.setDate(date.getDate() + 1);
    }
  });

  it("accepts the configured rotation", () => {
    expect(findSharedNightProblem(DEFAULT_PET_ROTATIONS)).toBeNull();
    expect(() => assertNoSharedNights(DEFAULT_PET_ROTATIONS)).not.toThrow();
  });

  it("rejects two pets anchored on the same child", () => {
    const problem = findSharedNightProblem([
      BELLA,
      { ...LEIA, anchorChildId: "hannah" },
    ]);
    expect(problem).toMatch(/same place in the rotation/);
  });

  it("rejects two pets that are the same distance apart via their anchors", () => {
    // Different anchor date, different anchor child — but five days later the
    // rotation has come full circle, so this is Bella all over again.
    const problem = findSharedNightProblem([
      BELLA,
      { ...LEIA, anchorDate: "2026-08-09", anchorChildId: "hannah" },
    ]);
    expect(problem).toMatch(/same place in the rotation/);
  });

  it("rejects pets rotating through different orders", () => {
    const problem = findSharedNightProblem([
      BELLA,
      { ...LEIA, order: ["james", "william", "clara", "emily", "hannah"] },
    ]);
    expect(problem).toMatch(/different orders/);
  });

  it("has nothing to say about a single pet", () => {
    expect(findSharedNightProblem([BELLA])).toBeNull();
  });
});

describe("bad configuration is refused loudly", () => {
  const night = localDate("2026-08-04");

  it("rejects an unparseable anchor date", () => {
    expect(() =>
      getPetChildOn({ ...BELLA, anchorDate: "4 August" }, night),
    ).toThrow(/not a valid YYYY-MM-DD/);
  });

  it("rejects an anchor child who is not in the order", () => {
    expect(() =>
      getPetChildOn({ ...BELLA, order: ["emily", "clara"] }, night),
    ).toThrow(/not in its order/);
  });

  it("rejects an empty order", () => {
    expect(() => getPetChildOn({ ...BELLA, order: [] }, night)).toThrow(
      /empty order/,
    );
  });
});
