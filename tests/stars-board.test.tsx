import { render, screen, within, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StarsBoard } from "@/components/stars/StarsBoard";
import { CHORE_POOLS } from "@/config/chore-rotation";
import { CHILD_IDS } from "@/config/family";
import type { WeekMarks } from "@/lib/stars/counting";

/*
 * The Server Action cannot run in jsdom — it is a POST endpoint, not a plain
 * function — so it is mocked, and these tests assert on what the board *asks*
 * it to do plus what the child sees before any answer comes back.
 */
const setStar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stars/actions", () => ({ setStar }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

/** Monday of the week the charts were photographed, and the Tuesday after it. */
const WEEK_START = "2026-08-03";
const TUESDAY = "2026-08-04";

function blankWeek(): WeekMarks {
  return Object.fromEntries(CHILD_IDS.map((id) => [id, {}])) as WeekMarks;
}

function renderBoard(marks: WeekMarks = blankWeek()) {
  return render(
    <StarsBoard
      initialDateIso={TUESDAY}
      weekStart={WEEK_START}
      pools={CHORE_POOLS}
      marks={marks}
    />,
  );
}

/** The five stars belonging to one task row, Monday first. */
function starsFor(label: string): HTMLElement[] {
  return screen.getAllByRole("switch", {
    name: new RegExp(`^${escapeRegExp(label)} on `),
  });
}

function isFilled(star: HTMLElement): boolean {
  return star.getAttribute("aria-checked") === "true";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

beforeEach(() => {
  setStar.mockReset();
  // A promise that never settles: the optimistic state is what a child sees
  // while the write is in flight, and that is what most of these assert.
  setStar.mockReturnValue(new Promise(() => {}));
});

describe("the chart on screen", () => {
  it("opens on the first child, with all three charts", () => {
    renderBoard();

    expect(
      screen.getByRole("tab", { name: /Hannah/ }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("heading", { name: "Chore Chart" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Summer Learning Chart" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Hygiene Chart" })).toBeTruthy();
  });

  it("gives every task five stars, one per weekday", () => {
    renderBoard();

    const cello = starsFor("Cello practice");
    expect(cello).toHaveLength(5);
    expect(cello[2].getAttribute("aria-label")).toBe(
      "Cello practice on Wednesday",
    );
  });

  it("shows the chores that child has this month, and not the others", () => {
    renderBoard();

    // August 2026: Hannah has the kitchen island and the bath trash.
    expect(starsFor("Clear & clean kitchen island & table")).toHaveLength(5);
    expect(
      screen.queryByRole("switch", { name: /Unload & load dishwasher on/ }),
    ).toBeNull();
  });

  it("switches to another child's chart", async () => {
    renderBoard();

    await act(async () => {
      screen.getByRole("tab", { name: /James/ }).click();
    });

    expect(starsFor("Write alphabet")).toHaveLength(5);
    expect(screen.queryByRole("switch", { name: /Cello practice on/ })).toBeNull();
    // James feeds Bella in August; the wooden floor is William's.
    expect(starsFor("Feed Bella")).toHaveLength(5);
    expect(
      screen.queryByRole("switch", { name: /vacuum wooden floor on/ }),
    ).toBeNull();
  });
});

describe("whose page this is", () => {
  /*
   * Five children share one phone and the three charts look alike, so a star
   * ticked on the wrong page is a star somebody else did not earn. These are
   * the signals that stop that happening — and the heading is the one that
   * matters most, because it is the only one that still works for a reader who
   * cannot tell the five colours apart.
   */
  function backdrop(): HTMLElement {
    const element = document.querySelector("[data-child]");
    if (!(element instanceof HTMLElement)) throw new Error("No backdrop");
    return element;
  }

  it("says whose chart it is in words, not only in colour", () => {
    renderBoard();
    expect(
      screen.getByRole("heading", { level: 1 }).textContent,
    ).toMatch(/^Hannah/);
  });

  it("changes the heading and the backdrop together", async () => {
    renderBoard();
    expect(backdrop().getAttribute("data-child")).toBe("hannah");

    await act(async () => {
      screen.getByRole("tab", { name: /Clara/ }).click();
    });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /^Clara/,
    );
    expect(backdrop().getAttribute("data-child")).toBe("clara");
  });

  it("leaves no trace of the child you switched away from", () => {
    // The header and the charts are both keyed on the child. When those two
    // keys were the same string, React treated them as duplicate siblings and
    // kept the outgoing header mounted — Hannah's name sat above Clara's
    // chart, which is precisely the confusion the colour is there to prevent.
    renderBoard();

    act(() => {
      screen.getByRole("tab", { name: /Emily/ }).click();
    });

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.querySelectorAll("[data-child]")).toHaveLength(1);
  });

  it("keeps the backdrop out of the accessibility tree", () => {
    renderBoard();
    // It is decoration: the heading already carries the meaning, and five
    // stacked layers of faces would be noise read aloud.
    expect(backdrop().getAttribute("aria-hidden")).toBe("true");
  });
});

describe("colouring in a star", () => {
  it("fills immediately, before the server has answered", async () => {
    renderBoard();
    expect(isFilled(starsFor("Piano practice")[2])).toBe(false);

    await act(async () => {
      starsFor("Piano practice")[2].click();
    });

    expect(isFilled(starsFor("Piano practice")[2])).toBe(true);
    // …and only that one.
    expect(isFilled(starsFor("Piano practice")[1])).toBe(false);
  });

  it("tells the server which child, week, task and day", async () => {
    renderBoard();

    await act(async () => {
      starsFor("Piano practice")[2].click();
    });

    expect(setStar).toHaveBeenCalledWith({
      childId: "hannah",
      weekStart: WEEK_START,
      taskId: "piano",
      dayIndex: 2,
      value: true,
    });
  });

  it("sets a value rather than flipping one, so a retry cannot undo it", async () => {
    const marks = blankWeek();
    marks.hannah = { piano: [false, false, true, false, false] };
    renderBoard(marks);

    await act(async () => {
      starsFor("Piano practice")[2].click();
    });

    expect(setStar).toHaveBeenCalledWith(
      expect.objectContaining({ value: false }),
    );
  });

  it("celebrates a whole row", async () => {
    const marks = blankWeek();
    marks.hannah = { "tidy-room": [true, true, true, true, false] };
    renderBoard(marks);

    expect(screen.queryByText(/Whole row/)).toBeNull();

    await act(async () => {
      starsFor("Tidy room")[4].click();
    });

    expect(screen.getByText(/Whole row/)).toBeTruthy();
  });

  it("counts the week as it goes", async () => {
    const marks = blankWeek();
    marks.hannah = { "tidy-room": [true, true, false, false, false] };
    renderBoard(marks);

    expect(screen.getByText(/Hannah has 2 of \d+ stars/)).toBeTruthy();

    await act(async () => {
      starsFor("Tidy room")[2].click();
    });

    expect(screen.getByText(/Hannah has 3 of \d+ stars/)).toBeTruthy();
  });

  it("says so when the star could not be saved", async () => {
    setStar.mockResolvedValue({
      ok: false,
      message: "That star could not be saved.",
    });
    renderBoard();

    await act(async () => {
      starsFor("Piano practice")[0].click();
    });

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("That star could not be saved.");
  });
});

describe("the week", () => {
  it("shows the Monday-to-Friday range it is filling in", () => {
    renderBoard();
    expect(screen.getByText(/Aug 3 – Aug 7/)).toBeTruthy();
  });

  it("counts down to the chores changing hands", () => {
    renderBoard();
    /*
     * Deliberately not pinned to a number. `useCurrentDate` switches to the
     * *device's* real date immediately after mount — that is its whole job —
     * so a hardcoded count here would pass today and fail tomorrow. The
     * arithmetic itself is pinned in `chore-rotation.test.ts`.
     */
    expect(screen.getByText(/New chores in \d+ days?/)).toBeTruthy();
  });
});

describe("every child", () => {
  it("has a tab with their own star count", () => {
    const marks = blankWeek();
    marks.clara = { "tidy-room": [true, true, true, false, false] };
    renderBoard(marks);

    const tab = screen.getByRole("tab", { name: /Clara/ });
    expect(within(tab).getByText(/3 ⭐/)).toBeTruthy();
  });
});
