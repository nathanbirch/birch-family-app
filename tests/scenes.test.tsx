import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DinnerTable } from "@/components/DinnerTable";
import { Expedition } from "@/components/Expedition";
import { FAMILY, getPerson } from "@/config/family";
import {
  ARRIVAL_DURATION_MS,
  ARRIVAL_STEP_MS,
  ARRIVAL_TOTAL_MS,
  SEATS_PER_SCENE,
  TABLE_CHILD_SEATS,
  TABLE_LAYOUT,
  TABLE_PARENT_SEATS,
  VEHICLE_CHILD_SEATS,
  VEHICLE_LAYOUT,
  VEHICLE_PARENT_SEATS,
} from "@/config/seating";
import { getRotationStartDate, getWeeklyAssignments } from "@/lib/rotation";

const START = getRotationStartDate();
const WEEK_1 = getWeeklyAssignments(new Date(2026, 7, 3, 12), START);
const WEEK_1_SWAPPED = getWeeklyAssignments(new Date(2026, 7, 3, 12), START, undefined, {
  swapParents: true,
});

/**
 * The `<Seat>` wrapper of a named person: the element that carries the
 * position, the arrival timing and the doorway offset.
 */
function seatOf(container: HTMLElement, name: string): HTMLElement {
  const label = within(container).getByText(name);
  const seat = label.closest(".seat-glide");
  if (!(seat instanceof HTMLElement)) {
    throw new Error(`No seat found for ${name}`);
  }
  return seat;
}

function pct(seat: HTMLElement, prop: "left" | "top"): number {
  return Number.parseFloat(seat.style[prop]);
}

function cssVar(seat: HTMLElement, name: string): string {
  return seat.style.getPropertyValue(name);
}

function numericVar(seat: HTMLElement, name: string): number {
  return Number.parseFloat(cssVar(seat, name));
}

const SCENES = [
  {
    name: "Dinner Table",
    render: (swapping = false) =>
      render(<DinnerTable assignments={WEEK_1} swapping={swapping} arriving />),
    renderSwapped: () =>
      render(<DinnerTable assignments={WEEK_1_SWAPPED} swapping={false} arriving />),
    layout: TABLE_LAYOUT,
    parentSeats: TABLE_PARENT_SEATS,
    childSeats: TABLE_CHILD_SEATS,
    parents: WEEK_1.tableParents,
  },
  {
    name: "Ford Expedition",
    render: (swapping = false) =>
      render(<Expedition assignments={WEEK_1} swapping={swapping} arriving />),
    renderSwapped: () =>
      render(<Expedition assignments={WEEK_1_SWAPPED} swapping={false} arriving />),
    layout: VEHICLE_LAYOUT,
    parentSeats: VEHICLE_PARENT_SEATS,
    childSeats: VEHICLE_CHILD_SEATS,
    parents: WEEK_1.vehicleParents,
  },
] as const;

describe.each(SCENES)("$name scene", (scene) => {
  it("seats all seven people, each exactly once", () => {
    const { container } = scene.render();
    for (const member of FAMILY) {
      expect(
        within(container).getAllByText(member.name),
        `${member.name} should appear once`,
      ).toHaveLength(1);
    }
    expect(container.querySelectorAll(".seat-glide")).toHaveLength(
      SEATS_PER_SCENE,
    );
  });

  it("puts every person at their configured coordinates", () => {
    const { container } = scene.render();

    for (const seat of scene.parentSeats) {
      const name = getPerson(scene.parents[seat.key]).name;
      const el = seatOf(container, name);
      expect(pct(el, "left")).toBe(seat.x);
      expect(pct(el, "top")).toBe(seat.y);
    }

    for (const seat of scene.childSeats) {
      const childId = WEEK_1.children[seat.position - 1].childId;
      const el = seatOf(container, getPerson(childId).name);
      expect(pct(el, "left")).toBe(seat.x);
      expect(pct(el, "top")).toBe(seat.y);
    }
  });

  it("sizes every avatar identically", () => {
    const { container } = scene.render();
    const widths = new Set(
      [...container.querySelectorAll<HTMLElement>(".seat-glide")].map(
        (el) => el.style.width,
      ),
    );
    expect(widths).toEqual(new Set([`${scene.layout.avatarSize}cqh`]));
  });

  it("starts everyone at a doorway outside the scene", () => {
    const { container } = scene.render();

    for (const seat of scene.childSeats) {
      const childId = WEEK_1.children[seat.position - 1].childId;
      const el = seatOf(container, getPerson(childId).name);
      // The offset is stored relative to the seat, so adding it back must
      // land on the doorway the config declares.
      expect(numericVar(el, "--enter-x") + seat.x).toBeCloseTo(seat.entry.x, 5);
      expect(numericVar(el, "--enter-y") + seat.y).toBeCloseTo(seat.entry.y, 5);
      expect(cssVar(el, "--enter-x")).toContain("cqw");
      expect(cssVar(el, "--enter-y")).toContain("cqh");
    }
  });

  it("brings people in one at a time, finishing in three seconds", () => {
    const { container } = scene.render();
    const delays = [...container.querySelectorAll<HTMLElement>(".seat-glide")]
      .map((el) => numericVar(el, "--arrive-delay"))
      .sort((a, b) => a - b);

    // Seven distinct turns, evenly spaced.
    expect(new Set(delays).size).toBe(SEATS_PER_SCENE);
    delays.forEach((delay, index) => {
      expect(delay).toBe(index * ARRIVAL_STEP_MS);
    });
    expect(delays.at(-1)! + ARRIVAL_DURATION_MS).toBe(ARRIVAL_TOTAL_MS);
  });

  it("seats the parents first, then the children in position order", () => {
    const { container } = scene.render();
    const delayFor = (name: string) =>
      numericVar(seatOf(container, name), "--arrive-delay");

    const parentDelays = scene.parentSeats.map((seat) =>
      delayFor(getPerson(scene.parents[seat.key]).name),
    );
    const childDelays = scene.childSeats.map((seat) =>
      delayFor(getPerson(WEEK_1.children[seat.position - 1].childId).name),
    );

    expect(parentDelays).toEqual([0, ARRIVAL_STEP_MS]);
    expect(childDelays).toEqual(
      childDelays.map((_, i) => (scene.parentSeats.length + i) * ARRIVAL_STEP_MS),
    );
    // Every child arrives after every parent.
    expect(Math.min(...childDelays)).toBeGreaterThan(Math.max(...parentDelays));
  });

  it("keeps the rendered order stable so a swap cannot restart an animation", () => {
    const normal = scene.render();
    const order = [...normal.container.querySelectorAll(".seat-glide")].map(
      (el) => el.textContent,
    );
    normal.unmount();

    const swapped = scene.renderSwapped();
    const swappedOrder = [
      ...swapped.container.querySelectorAll(".seat-glide"),
    ].map((el) => el.textContent);

    expect(swappedOrder).toEqual(order);
  });

  it("moves the parents to each other's seats when swapped", () => {
    const normal = scene.render();
    const [seatA, seatB] = scene.parentSeats;
    const personA = getPerson(scene.parents[seatA.key]).name;
    const personB = getPerson(scene.parents[seatB.key]).name;

    expect(pct(seatOf(normal.container, personA), "left")).toBe(seatA.x);
    expect(pct(seatOf(normal.container, personB), "left")).toBe(seatB.x);
    normal.unmount();

    const swapped = scene.renderSwapped();
    expect(pct(seatOf(swapped.container, personA), "left")).toBe(seatB.x);
    expect(pct(seatOf(swapped.container, personA), "top")).toBe(seatB.y);
    expect(pct(seatOf(swapped.container, personB), "left")).toBe(seatA.x);
    expect(pct(seatOf(swapped.container, personB), "top")).toBe(seatA.y);
  });

  it("leaves the children where they were when the parents swap", () => {
    const normal = scene.render();
    const before = scene.childSeats.map((seat) => {
      const name = getPerson(WEEK_1.children[seat.position - 1].childId).name;
      return [name, pct(seatOf(normal.container, name), "top")] as const;
    });
    normal.unmount();

    const swapped = scene.renderSwapped();
    for (const [name, top] of before) {
      expect(pct(seatOf(swapped.container, name), "top")).toBe(top);
    }
  });

  it("arcs only the parents while a swap is in flight", () => {
    const { container } = scene.render(true);
    const arcing = [...container.querySelectorAll(".seat-swap-arc")].map((el) =>
      el.textContent?.replace(/[A-Z](?=[A-Z][a-z])/, ""),
    );
    expect(arcing).toHaveLength(2);

    const parentNames = scene.parentSeats.map(
      (seat) => getPerson(scene.parents[seat.key]).name,
    );
    for (const name of parentNames) {
      expect(
        seatOf(container, name).querySelector(".seat-swap-arc"),
        `${name} should arc`,
      ).not.toBeNull();
    }
  });

  it("does not arc anyone when nothing is being swapped", () => {
    const { container } = scene.render(false);
    expect(container.querySelectorAll(".seat-swap-arc")).toHaveLength(0);
  });

  it("describes the same seating for screen readers as it draws", () => {
    const { container } = scene.render();
    const summary = container.querySelector(".sr-only");
    expect(summary).not.toBeNull();

    const lines = [...summary!.querySelectorAll("li")].map(
      (li) => li.textContent ?? "",
    );
    expect(lines).toHaveLength(SEATS_PER_SCENE);

    // Every visible name is accounted for in the description.
    for (const member of FAMILY) {
      expect(
        lines.some((line) => line.startsWith(member.name)),
        `${member.name} missing from the accessible summary`,
      ).toBe(true);
    }
  });

  it("renders a local photograph as the backdrop", () => {
    const { container } = scene.render();
    const images = [...container.querySelectorAll("img")];
    const backdrop = images.find((img) => img.getAttribute("aria-hidden"));
    expect(backdrop).toBeDefined();
    expect(backdrop!.getAttribute("src")).not.toMatch(/^https?:/);
  });

  it("gives the scene a heading", () => {
    scene.render();
    expect(
      screen.getByRole("heading", { name: scene.name, level: 2 }),
    ).toBeTruthy();
  });
});

describe("both scenes together", () => {
  it("uses the same avatar size and shape in each", () => {
    const table = render(<DinnerTable assignments={WEEK_1} swapping={false} arriving />);
    const tableWidth = table.container
      .querySelector<HTMLElement>(".seat-glide")!
      .style.width;
    table.unmount();

    const car = render(<Expedition assignments={WEEK_1} swapping={false} arriving />);
    const carWidth = car.container
      .querySelector<HTMLElement>(".seat-glide")!
      .style.width;

    expect(tableWidth).toBe(carWidth);
    expect(TABLE_LAYOUT.aspect).toBe(VEHICLE_LAYOUT.aspect);
  });

  it("runs both arrivals off the same clock", () => {
    const table = render(<DinnerTable assignments={WEEK_1} swapping={false} arriving />);
    const tableDelays = [
      ...table.container.querySelectorAll<HTMLElement>(".seat-glide"),
    ]
      .map((el) => numericVar(el, "--arrive-delay"))
      .sort((a, b) => a - b);
    table.unmount();

    const car = render(<Expedition assignments={WEEK_1} swapping={false} arriving />);
    const carDelays = [
      ...car.container.querySelectorAll<HTMLElement>(".seat-glide"),
    ]
      .map((el) => numericVar(el, "--arrive-delay"))
      .sort((a, b) => a - b);

    expect(tableDelays).toEqual(carDelays);
  });

  it("gives a child the same position number in both scenes", () => {
    const table = render(<DinnerTable assignments={WEEK_1} swapping={false} arriving />);
    const tableTops = new Map(
      TABLE_CHILD_SEATS.map((seat) => [
        getPerson(WEEK_1.children[seat.position - 1].childId).name,
        seat.position,
      ]),
    );
    table.unmount();

    const car = render(<Expedition assignments={WEEK_1} swapping={false} arriving />);
    for (const seat of VEHICLE_CHILD_SEATS) {
      const name = getPerson(WEEK_1.children[seat.position - 1].childId).name;
      expect(tableTops.get(name)).toBe(seat.position);
      expect(seatOf(car.container, name)).toBeTruthy();
    }
  });
});
