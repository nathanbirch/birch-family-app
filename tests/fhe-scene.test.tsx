import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FamilyHomeEvening } from "@/components/fhe/FamilyHomeEvening";
import { FAMILY, getPerson } from "@/config/family";
import { FHE_CYCLE_LENGTH, FHE_LAYOUT, FHE_ROLES } from "@/config/fhe";
import {
  ARRIVAL_DURATION_MS,
  ARRIVAL_STEP_MS,
  ARRIVAL_TOTAL_MS,
} from "@/config/seating";
import { getFheAnchorSunday, getFheStatus } from "@/lib/fhe";

const ANCHOR = getFheAnchorSunday();
const WEEK_1 = getFheStatus(ANCHOR, ANCHOR);

function draw(status = WEEK_1) {
  return render(<FamilyHomeEvening status={status} arriving />);
}

/** The `<Seat>` wrapper of a named person. */
function seatOf(container: HTMLElement, name: string): HTMLElement {
  const seat = within(container).getByText(name).closest(".seat-glide");
  if (!(seat instanceof HTMLElement)) {
    throw new Error(`No seat found for ${name}`);
  }
  return seat;
}

function pct(seat: HTMLElement, prop: "left" | "top"): number {
  return Number.parseFloat(seat.style[prop]);
}

function numericVar(seat: HTMLElement, name: string): number {
  return Number.parseFloat(seat.style.getPropertyValue(name));
}

describe("the Family Home Evening scene", () => {
  it("stands all seven people in the house, each exactly once", () => {
    const { container } = draw();
    for (const member of FAMILY) {
      expect(
        within(container).getAllByText(member.name),
        `${member.name} should appear once`,
      ).toHaveLength(1);
    }
    expect(container.querySelectorAll(".seat-glide")).toHaveLength(
      FHE_CYCLE_LENGTH,
    );
  });

  it("puts each person in the room whose job they have", () => {
    const { container } = draw();
    for (const { role, personId } of WEEK_1.assignments) {
      const seat = seatOf(container, getPerson(personId).name);
      expect(pct(seat, "left"), role.label).toBe(role.spot.x);
      expect(pct(seat, "top"), role.label).toBe(role.spot.y);
    }
  });

  it("moves the right person when the week turns over", () => {
    const week1 = draw();
    const before = new Map(
      WEEK_1.assignments.map(({ role, personId }) => [personId, role.id]),
    );
    week1.unmount();

    const nextSunday = new Date(
      ANCHOR.getFullYear(),
      ANCHOR.getMonth(),
      ANCHOR.getDate() + 7,
      12,
    );
    const week2 = getFheStatus(nextSunday, ANCHOR);
    const { container } = draw(week2);

    for (const { role, personId } of week2.assignments) {
      // Everybody has moved on one room, and is drawn in the new one.
      expect(role.id).not.toBe(before.get(personId));
      expect(pct(seatOf(container, getPerson(personId).name), "top")).toBe(
        role.spot.y,
      );
    }
  });

  it("sizes every avatar identically", () => {
    const { container } = draw();
    const widths = new Set(
      [...container.querySelectorAll<HTMLElement>(".seat-glide")].map(
        (el) => el.style.width,
      ),
    );
    expect(widths).toEqual(new Set([`${FHE_LAYOUT.avatarSize}cqh`]));
  });

  it("starts everyone at a door outside the house", () => {
    const { container } = draw();
    for (const { role, personId } of WEEK_1.assignments) {
      const seat = seatOf(container, getPerson(personId).name);
      // The offset is stored relative to the room, so adding it back must land
      // on the door the config declares.
      expect(numericVar(seat, "--enter-x") + role.spot.x).toBeCloseTo(
        role.entry.x,
        5,
      );
      expect(numericVar(seat, "--enter-y") + role.spot.y).toBeCloseTo(
        role.entry.y,
        5,
      );
    }
  });

  it("bounces people in one at a time, on the same clock as the seats", () => {
    const { container } = draw();
    const delays = [...container.querySelectorAll<HTMLElement>(".seat-glide")]
      .map((el) => numericVar(el, "--arrive-delay"))
      .sort((a, b) => a - b);

    expect(new Set(delays).size).toBe(FHE_CYCLE_LENGTH);
    delays.forEach((delay, index) => {
      expect(delay).toBe(index * ARRIVAL_STEP_MS);
    });
    expect(delays.at(-1)! + ARRIVAL_DURATION_MS).toBe(ARRIVAL_TOTAL_MS);
  });

  it("fills the house from the top floor down", () => {
    const { container } = draw();
    const delays = WEEK_1.assignments.map(({ personId }) =>
      numericVar(seatOf(container, getPerson(personId).name), "--arrive-delay"),
    );
    // The assignments are in room order, so their delays must be ascending.
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
  });

  it("holds the walk-in until the photographs have loaded", () => {
    const waiting = render(<FamilyHomeEvening status={WEEK_1} arriving={false} />);
    expect(
      waiting.container.querySelectorAll(".seat-arrival.is-arriving"),
    ).toHaveLength(0);
    waiting.unmount();

    const { container } = draw();
    expect(container.querySelectorAll(".seat-arrival.is-arriving")).toHaveLength(
      FHE_CYCLE_LENGTH,
    );
  });

  it("renders the house as a local photograph behind the people", () => {
    const { container } = draw();
    const backdrop = [...container.querySelectorAll("img")].find((img) =>
      img.getAttribute("aria-hidden"),
    );
    expect(backdrop).toBeDefined();
    expect(backdrop!.getAttribute("src")).not.toMatch(/^https?:/);
  });

  it("gives the scene a heading, and names the week and the next rotation", () => {
    const { container } = draw();
    expect(
      screen.getByRole("heading", { name: "Family Home Evening", level: 2 }),
    ).toBeTruthy();
    expect(container.textContent).toContain(
      "This is the rotation for the week of",
    );
    expect(container.textContent).toContain(WEEK_1.countdownLabel);
  });

  it("describes the same jobs for screen readers as it draws", () => {
    const { container } = draw();
    const summary = container.querySelector(".sr-only");
    expect(summary).not.toBeNull();

    const lines = [...summary!.querySelectorAll("li")].map(
      (li) => li.textContent ?? "",
    );
    expect(lines).toHaveLength(FHE_CYCLE_LENGTH);
    for (const member of FAMILY) {
      expect(
        lines.some((line) => line.startsWith(member.name)),
        `${member.name} missing from the accessible summary`,
      ).toBe(true);
    }
    for (const role of FHE_ROLES) {
      expect(
        lines.some((line) => line.includes(role.label)),
        `${role.label} missing from the accessible summary`,
      ).toBe(true);
    }
  });
});
