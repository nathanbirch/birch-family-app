import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PetNights } from "@/components/pets/PetNights";
import { PET_PHOTO_SOURCES } from "@/config/pet-manifest";
import { DEFAULT_PET_ROTATIONS, PETS } from "@/config/pets";

/** Local date at noon, so tests never depend on the machine's timezone. */
function localDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** The card for a named pet: the section its heading sits in. */
function cardFor(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name });
  const card = heading.closest("section");
  if (!(card instanceof HTMLElement)) {
    throw new Error(`No card found for ${name}`);
  }
  return card;
}

/**
 * The `<Seat>` pinned on a pet — the element carrying the position and the
 * arrival timing. Queried through the seat rather than by name, because the
 * child's name deliberately appears twice on the card: on the avatar and again
 * in the sentence underneath.
 */
function seatOn(petName: string): HTMLElement {
  const seat = cardFor(petName).querySelector(".seat-glide");
  if (!(seat instanceof HTMLElement)) {
    throw new Error(`No seat found on ${petName}`);
  }
  return seat;
}

/**
 * The name on the avatar pinned to a pet. Read from the name label rather than
 * the seat's whole text, which also contains the first-initial badge.
 */
function childOn(petName: string): string {
  return within(seatOn(petName)).getByText(
    /^(Hannah|Emily|Clara|William|James)$/,
  ).textContent!;
}

describe("tonight's pets", () => {
  it("shows the child the rotation says, on each animal", () => {
    render(
      <PetNights
        configs={DEFAULT_PET_ROTATIONS}
        date={localDate("2026-08-04")}
      />,
    );

    expect(childOn("Bella")).toBe("Hannah");
    expect(childOn("Leia")).toBe("William");
  });

  it("moves everyone on by one the next night", () => {
    render(
      <PetNights
        configs={DEFAULT_PET_ROTATIONS}
        date={localDate("2026-08-05")}
      />,
    );

    expect(childOn("Bella")).toBe("Emily");
    expect(childOn("Leia")).toBe("James");
  });

  it("never puts the same child on both animals", () => {
    // Every night of one full cycle, through the rendered output rather than
    // the maths — the wiring is as capable of getting this wrong as the sums.
    for (const iso of [
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
    ]) {
      const { unmount } = render(
        <PetNights configs={DEFAULT_PET_ROTATIONS} date={localDate(iso)} />,
      );

      const summary = screen.getByRole("heading", {
        name: "Who sleeps with which pet tonight",
      }).parentElement;
      const lines = within(summary!)
        .getAllByRole("listitem")
        .map((item) => item.textContent ?? "");

      expect(lines).toHaveLength(2);
      const [bella, leia] = lines.map((line) => line.split(" sleeps")[0]);
      expect(bella).not.toBe(leia);

      unmount();
    }
  });

  it("says whose turn it is tomorrow", () => {
    render(
      <PetNights
        configs={DEFAULT_PET_ROTATIONS}
        date={localDate("2026-08-04")}
      />,
    );

    expect(
      within(cardFor("Bella")).getByText(/Tomorrow it is Emily/),
    ).toBeTruthy();
    expect(
      within(cardFor("Leia")).getByText(/Tomorrow it is James/),
    ).toBeTruthy();
  });

  it("renders each pet's optimised, content-hashed photograph", () => {
    render(
      <PetNights
        configs={DEFAULT_PET_ROTATIONS}
        date={localDate("2026-08-04")}
      />,
    );

    for (const pet of PETS) {
      const image = within(cardFor(pet.name)).getByAltText(pet.alt);
      // `next/image` rewrites the src through the optimiser, so assert the
      // hashed filename survives into it rather than matching the whole URL.
      const source = PET_PHOTO_SOURCES[pet.id];
      expect(decodeURIComponent(image.getAttribute("src") ?? "")).toContain(
        source,
      );
      expect(source).toMatch(/^\/pets\/[a-z]+-[0-9a-f]{10}\.png$/);
    }
  });

  it("pins the child at the spot configured for that animal", () => {
    render(
      <PetNights
        configs={DEFAULT_PET_ROTATIONS}
        date={localDate("2026-08-04")}
      />,
    );

    for (const pet of PETS) {
      const seat = seatOn(pet.name);
      expect(Number.parseFloat(seat.style.left)).toBe(pet.avatarSpot.x);
      expect(Number.parseFloat(seat.style.top)).toBe(pet.avatarSpot.y);
    }
  });
});
