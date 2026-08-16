import { render, screen, within, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StarsBoard } from "@/components/stars/StarsBoard";
import { CHORE_POOLS } from "@/config/chore-rotation";
import { SOUND_STORAGE_KEY } from "@/config/app";
import { CHILD_IDS } from "@/config/family";
import { SATURDAY_FROM_WEEK } from "@/config/stars";
import type { StarMarks, WeekMarks } from "@/lib/stars/counting";
import { getDealForChild } from "@/lib/stars/deals";
import { getTasksForChild } from "@/lib/stars/tasks";

/*
 * The Server Action cannot run in jsdom — it is a POST endpoint, not a plain
 * function — so it is mocked, and these tests assert on what the board *asks*
 * it to do plus what the child sees before any answer comes back.
 */
const setStar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stars/actions", () => ({ setStar }));

/*
 * jsdom has no Web Audio, so the real module would silently do nothing and
 * these tests could not tell "did not play" from "could not play". Mocked, so
 * the volume the board *asks* for is what is asserted.
 */
const playCheer = vi.hoisted(() => vi.fn());
const primeCheer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stars/cheer", () => ({ playCheer, primeCheer }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

/**
 * Monday of the week the charts were photographed, and the Wednesday in it.
 *
 * The day matters now: only today's column can be coloured in, so the board is
 * rendered *on* the Wednesday these tests tick. A test that clicks any other
 * column is asserting that it cannot be clicked.
 */
const WEEK_START = "2026-08-03";
const TODAY = "2026-08-05";
/** Wednesday's index in the Monday-to-Friday row. */
const WEDNESDAY = 2;

/** The same week as a Date, for asking the rotation what Hannah has. */
const AUGUST = new Date(2026, 7, 5, 12, 0, 0, 0);

function blankWeek(): WeekMarks {
  return Object.fromEntries(CHILD_IDS.map((id) => [id, {}])) as WeekMarks;
}

function renderBoard(marks: WeekMarks = blankWeek()) {
  return render(
    <StarsBoard
      initialDateIso={TODAY}
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
  /*
   * Only today's column can be coloured in, and `useCurrentDate` reaches for
   * the real `Date` a tick after mount — so the clock has to be faked as well
   * as passed in, or every tap below would land on a locked star.
   */
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 5, 12, 0, 0, 0));
  setStar.mockReset();
  playCheer.mockReset();
  primeCheer.mockReset();
  // A promise that never settles: the optimistic state is what a child sees
  // while the write is in flight, and that is what most of these assert.
  setStar.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.useRealTimers();
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

    const reading = starsFor("40 min reading");
    expect(reading).toHaveLength(5);
    expect(reading[2].getAttribute("aria-label")).toBe(
      "40 min reading on Wednesday",
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
    expect(screen.queryByRole("switch", { name: /40 min reading on/ })).toBeNull();
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
    marks.hannah = { "tidy-room": [true, true, false, true, true] };
    renderBoard(marks);

    expect(screen.queryByText(/Whole row/)).toBeNull();

    await act(async () => {
      starsFor("Tidy room")[WEDNESDAY].click();
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
      starsFor("Piano practice")[WEDNESDAY].click();
    });

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("That star could not be saved.");
  });
});

describe("celebrating a finished column", () => {
  /*
   * Confetti is thrown at columns, not rows: a row takes until Friday, a
   * column is everything owed for one day. The two sizes are two different
   * achievements, so these tests are mostly about not confusing them.
   */
  function confetti(): string[] {
    return Array.from(document.querySelectorAll("[data-confetti]")).map(
      (node) => node.getAttribute("data-confetti") ?? "",
    );
  }

  /** Every task on one chart ticked on Wednesday, bar one. */
  function allButOneOn(chart: "chores" | "learning" | "hygiene"): StarMarks {
    const tasks = getTasksForChild(CHORE_POOLS, AUGUST, "hannah").filter(
      (task) => task.chart === chart,
    );
    const marks: StarMarks = {};
    for (const task of tasks.slice(0, -1)) {
      marks[task.id] = [false, false, true, false, false];
    }
    return marks;
  }

  /**
   * Everything Hannah owes on Wednesday, bar the very last star.
   *
   * Including the Star Deal, which is part of the day rather than a bonus on
   * top of it — see `isDayComplete()`. Leave it out and "finished everything
   * for Wednesday" would be a sentence the app says while a fifteen-cent job
   * sits untouched at the top of the page.
   */
  function wholeDayButOne(): StarMarks {
    const tasks = getTasksForChild(CHORE_POOLS, AUGUST, "hannah");
    const marks: StarMarks = {};
    for (const task of tasks.slice(0, -1)) {
      marks[task.id] = [false, false, true, false, false];
    }
    const deal = getDealForChild(AUGUST, WEDNESDAY, "hannah");
    if (deal) marks[deal.id] = [false, false, true, false, false];
    return marks;
  }

  /** The label of the last task on a chart — the star that completes it. */
  function lastLabelOn(chart: "chores" | "learning" | "hygiene"): string {
    const tasks = getTasksForChild(CHORE_POOLS, AUGUST, "hannah").filter(
      (task) => task.chart === chart,
    );
    return tasks[tasks.length - 1].label;
  }

  it("throws nothing on an ordinary star", async () => {
    renderBoard();

    await act(async () => {
      starsFor("Piano practice")[WEDNESDAY].click();
    });

    expect(confetti()).toEqual([]);
  });

  it("showers the card when one chart's column is finished", async () => {
    const marks = blankWeek();
    marks.hannah = allButOneOn("hygiene");
    renderBoard(marks);

    await act(async () => {
      starsFor(lastLabelOn("hygiene"))[WEDNESDAY].click();
    });

    expect(confetti()).toEqual(["section"]);
    // …over the chart that was finished, and no other.
    const burst = document.querySelector("[data-confetti='section']");
    expect(burst?.closest("section")?.textContent).toContain("Hygiene Chart");
  });

  it("showers the whole page when the whole day is finished", async () => {
    const marks = blankWeek();
    marks.hannah = wholeDayButOne();
    renderBoard(marks);

    const tasks = getTasksForChild(CHORE_POOLS, AUGUST, "hannah");
    await act(async () => {
      starsFor(tasks[tasks.length - 1].label)[WEDNESDAY].click();
    });

    // The bigger celebration replaces the smaller one rather than joining it:
    // the last star of the day is also the last star of some chart.
    expect(confetti()).toEqual(["page"]);
  });

  it("says what was finished, for anyone who cannot see paper fall", async () => {
    const marks = blankWeek();
    marks.hannah = wholeDayButOne();
    renderBoard(marks);

    const tasks = getTasksForChild(CHORE_POOLS, AUGUST, "hannah");
    await act(async () => {
      starsFor(tasks[tasks.length - 1].label)[WEDNESDAY].click();
    });

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Hannah finished everything for Wednesday");
  });

  it("throws nothing when a star is rubbed out", async () => {
    const marks = blankWeek();
    const complete = allButOneOn("hygiene");
    const last = getTasksForChild(CHORE_POOLS, AUGUST, "hannah")
      .filter((task) => task.chart === "hygiene")
      .at(-1)!;
    complete[last.id] = [false, false, true, false, false];
    marks.hannah = complete;
    renderBoard(marks);

    // Unticking leaves the column incomplete; re-ticking it must not be a way
    // to farm confetti either, but that is the *next* tap — this asserts the
    // rub-out itself is silent.
    await act(async () => {
      starsFor(last.label)[WEDNESDAY].click();
    });

    expect(confetti()).toEqual([]);
  });

  it("keeps the paper out of the accessibility tree", async () => {
    const marks = blankWeek();
    marks.hannah = allButOneOn("hygiene");
    renderBoard(marks);

    await act(async () => {
      starsFor(lastLabelOn("hygiene"))[WEDNESDAY].click();
    });

    expect(
      document.querySelector("[data-confetti]")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
});

describe("the cheering", () => {

  /**
   * Everything Hannah owes on Wednesday, bar the very last star.
   *
   * Including the Star Deal, which is part of the day rather than a bonus on
   * top of it — see `isDayComplete()`. Leave it out and "finished everything
   * for Wednesday" would be a sentence the app says while a fifteen-cent job
   * sits untouched at the top of the page.
   */
  function wholeDayButOne(): StarMarks {
    const tasks = getTasksForChild(CHORE_POOLS, AUGUST, "hannah");
    const marks: StarMarks = {};
    for (const task of tasks.slice(0, -1)) {
      marks[task.id] = [false, false, true, false, false];
    }
    const deal = getDealForChild(AUGUST, WEDNESDAY, "hannah");
    if (deal) marks[deal.id] = [false, false, true, false, false];
    return marks;
  }

  function finishTheDay() {
    const tasks = getTasksForChild(CHORE_POOLS, AUGUST, "hannah");
    return starsFor(tasks[tasks.length - 1].label)[WEDNESDAY];
  }

  it("plays at full volume for a whole day", async () => {
    const marks = blankWeek();
    marks.hannah = wholeDayButOne();
    renderBoard(marks);

    await act(async () => {
      finishTheDay().click();
    });

    expect(playCheer).toHaveBeenCalledWith(1);
  });

  it("is quieter for one chart, so the two do not sound alike", async () => {
    const marks = blankWeek();
    const hygiene = getTasksForChild(CHORE_POOLS, AUGUST, "hannah").filter(
      (task) => task.chart === "hygiene",
    );
    const partial: StarMarks = {};
    for (const task of hygiene.slice(0, -1)) {
      partial[task.id] = [false, false, true, false, false];
    }
    marks.hannah = partial;
    renderBoard(marks);

    await act(async () => {
      starsFor(hygiene[hygiene.length - 1].label)[WEDNESDAY].click();
    });

    expect(playCheer).toHaveBeenCalledWith(0.6);
  });

  it("says nothing for an ordinary star", async () => {
    renderBoard();

    await act(async () => {
      starsFor("Piano practice")[WEDNESDAY].click();
    });

    expect(playCheer).not.toHaveBeenCalled();
  });

  it("warms the audio on every tap, inside the gesture iOS requires", async () => {
    renderBoard();

    await act(async () => {
      starsFor("Piano practice")[WEDNESDAY].click();
    });

    expect(primeCheer).toHaveBeenCalled();
  });

  it("stays silent once the speaker is switched off", async () => {
    const marks = blankWeek();
    marks.hannah = wholeDayButOne();
    renderBoard(marks);

    await act(async () => {
      screen.getByRole("switch", { name: /Turn the cheering off/ }).click();
    });

    await act(async () => {
      finishTheDay().click();
    });

    expect(playCheer).not.toHaveBeenCalled();
    // …and the confetti still falls. Muting the room is not muting the party.
    expect(document.querySelector("[data-confetti]")).not.toBeNull();
  });

  it("remembers the choice on this device", async () => {
    renderBoard();

    await act(async () => {
      screen.getByRole("switch", { name: /Turn the cheering off/ }).click();
    });

    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe("off");
    expect(
      screen.getByRole("switch", { name: /Turn the cheering on/ }),
    ).toBeTruthy();
  });

  it("starts on, for a device that has never said otherwise", () => {
    renderBoard();
    expect(
      screen.getByRole("switch", { name: /Turn the cheering off/ }),
    ).toBeTruthy();
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

  it("counts a Star Deal as three stars on the tab", () => {
    const marks = blankWeek();
    const deal = getDealForChild(AUGUST, 0, "clara")!;
    marks.clara = { [deal.id]: [true, false, false, false, false] };
    renderBoard(marks);

    const tab = screen.getByRole("tab", { name: /Clara/ });
    expect(within(tab).getByText(/3 ⭐/)).toBeTruthy();
  });
});

describe("the Star Deal", () => {
  /** Today's deal for whoever's page is open — Hannah, on the Wednesday. */
  function todaysDeal() {
    return getDealForChild(AUGUST, WEDNESDAY, "hannah")!;
  }

  function dealStar(): HTMLElement {
    return screen.getByRole("switch", { name: /today’s Star Deal/ });
  }

  it("shows one deal, for today, worth three stars", () => {
    renderBoard();

    const card = screen.getByText("Star Deals").closest("section")!;
    expect(within(card).getByText(todaysDeal().label)).toBeTruthy();
    expect(within(card).getByText(/Today’s deal · Wednesday/)).toBeTruthy();
    expect(within(card).getByText("Worth 3 stars")).toBeTruthy();
  });

  it("does not show the deals still to come", () => {
    // Thursday's deal shown on Wednesday is no longer a surprise — and it is
    // an invitation to do the job a day early and tick it late.
    renderBoard();

    const card = screen.getByText("Star Deals").closest("section")!;
    const thursday = getDealForChild(AUGUST, 3, "hannah")!;
    expect(within(card).queryByText(thursday.label)).toBeNull();
    // Monday's and Tuesday's are behind us, so they are on the card.
    const monday = getDealForChild(AUGUST, 0, "hannah")!;
    expect(within(card).getByText(monday.label)).toBeTruthy();
  });

  it("files the deal against its own id, on today's column", async () => {
    renderBoard();

    await act(async () => {
      dealStar().click();
    });

    expect(setStar).toHaveBeenCalledWith({
      childId: "hannah",
      weekStart: WEEK_START,
      taskId: todaysDeal().id,
      dayIndex: WEDNESDAY,
      value: true,
    });
  });

  it("fills the moment it is tapped, before the write comes back", async () => {
    renderBoard();
    expect(dealStar().getAttribute("aria-checked")).toBe("false");

    await act(async () => {
      dealStar().click();
    });

    expect(dealStar().getAttribute("aria-checked")).toBe("true");
  });

  it("celebrates on its own account, because it finishes no column", async () => {
    renderBoard();

    await act(async () => {
      dealStar().click();
    });

    expect(screen.getByRole("status").textContent).toContain(
      "Star Deal taken — 3 stars",
    );
  });

  it("gives every child a different deal on the same day", async () => {
    renderBoard();

    const labels = new Set<string>();
    for (const name of ["Hannah", "Emily", "Clara", "William", "James"]) {
      await act(async () => {
        screen.getByRole("tab", { name: new RegExp(name) }).click();
      });
      labels.add(dealStar().getAttribute("aria-label")!);
    }
    expect(labels.size).toBe(5);
  });
});

describe("how wide the week is drawn", () => {
  /*
   * The board is handed a `weekStart` and must draw the week that actually
   * was: five columns before Saturday was offered, six from then on. Getting
   * this from the week rather than from a constant is what stops an old week
   * growing a Saturday nobody could have earned — see `SATURDAY_FROM_WEEK`.
   */
  function columnsFor(weekStart: string): number {
    const view = render(
      <StarsBoard
        initialDateIso={weekStart}
        weekStart={weekStart}
        pools={CHORE_POOLS}
        marks={blankWeek()}
      />,
    );
    const stars = view.container.querySelectorAll(
      'button[aria-label*="Tidy room on"]',
    );
    const count = stars.length;
    view.unmount();
    return count;
  }

  it("draws five columns for a week that ran Monday to Friday", () => {
    expect(columnsFor("2026-08-10")).toBe(5);
  });

  it("draws six for a week that includes Saturday", () => {
    expect(columnsFor(SATURDAY_FROM_WEEK)).toBe(6);
  });

  it("names the sixth column Saturday, and never a seventh", () => {
    render(
      <StarsBoard
        initialDateIso={SATURDAY_FROM_WEEK}
        weekStart={SATURDAY_FROM_WEEK}
        pools={CHORE_POOLS}
        marks={blankWeek()}
      />,
    );
    expect(screen.getByLabelText(/Tidy room on Saturday/)).toBeDefined();
    expect(screen.queryByLabelText(/Tidy room on Sunday/)).toBeNull();
  });
});
