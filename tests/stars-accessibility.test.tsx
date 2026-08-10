import { render, screen, within, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NavIcon } from "@/components/nav/NavIcon";
import { ChildBackdrop } from "@/components/stars/ChildBackdrop";
import { Confetti } from "@/components/stars/Confetti";
import { SoundToggle } from "@/components/stars/SoundToggle";
import { StarsBoard } from "@/components/stars/StarsBoard";
import { CHORE_POOLS } from "@/config/chore-rotation";
import { CHILD_IDS, FAMILY, getChildren } from "@/config/family";
import { STAR_DAY_NAMES, STAR_TASKS } from "@/config/stars";
import type { WeekMarks } from "@/lib/stars/counting";

/**
 * Accessibility, responsiveness and kid-proofing.
 *
 * The youngest person using this page is four and cannot read; the oldest
 * device it runs on is a phone held one-handed. Those two facts drive almost
 * every assertion here — a star has to be findable without reading, hittable
 * without aiming, and impossible to break by hammering.
 */

const setStar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stars/actions", () => ({ setStar }));
const playCheer = vi.hoisted(() => vi.fn());
const primeCheer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stars/cheer", () => ({ playCheer, primeCheer }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const WEEK_START = "2026-08-03";
/**
 * The board is rendered *on* the Monday of the week it shows.
 *
 * Only the day that is actually happening can be coloured in — see
 * `openDayIndex()` — so a test that taps a star has to be standing on that
 * day. `useCurrentDate` reaches for the real `Date` a tick after mount, which
 * is why the clock below is faked rather than only passed in as a prop.
 */
const MONDAY = "2026-08-03";

function blankWeek(): WeekMarks {
  return Object.fromEntries(CHILD_IDS.map((id) => [id, {}])) as WeekMarks;
}

function renderBoard(marks: WeekMarks = blankWeek()) {
  return render(
    <StarsBoard
      initialDateIso={MONDAY}
      weekStart={WEEK_START}
      pools={CHORE_POOLS}
      marks={marks}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 3, 12, 0, 0, 0));
  setStar.mockReset();
  playCheer.mockReset();
  primeCheer.mockReset();
  refresh.mockReset();
  setStar.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/* Accessibility                                                       */
/* ------------------------------------------------------------------ */

describe("accessibility", () => {
  it("gives every star a name that says the task and the day", () => {
    renderBoard();

    for (const star of screen.getAllByRole("switch")) {
      const name = star.getAttribute("aria-label") ?? "";
      // The sound toggle is a switch too, and is named differently.
      if (name.startsWith("Turn the cheering")) continue;
      // A locked star says why, after its day — the day is still the end of
      // the part that names it.
      expect(name).toMatch(
        new RegExp(
          `^.+ on (${STAR_DAY_NAMES.join("|")})( — only today can be coloured in)?$`,
        ),
      );
    }
  });

  it("names every star uniquely, so 'that one' is never ambiguous", () => {
    renderBoard();
    const names = screen
      .getAllByRole("switch")
      .map((node) => node.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
  });

  it("reports each star's state as a switch, not as a picture", () => {
    const marks = blankWeek();
    marks.hannah = { piano: [true, false, false, false, false] };
    renderBoard(marks);

    const [monday, tuesday] = screen.getAllByRole("switch", {
      name: /^Piano practice on/,
    });
    expect(monday.getAttribute("aria-checked")).toBe("true");
    expect(tuesday.getAttribute("aria-checked")).toBe("false");
  });

  it("keeps decoration out of the accessibility tree", () => {
    renderBoard();

    // The backdrop, the day-letter row, and every icon: all decorative, all
    // duplicated by text that is already announced.
    for (const node of document.querySelectorAll("svg")) {
      expect(node.getAttribute("aria-hidden")).toBe("true");
    }
    expect(
      document.querySelector("[data-child]")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("announces the running total politely rather than interrupting", () => {
    renderBoard();
    const total = screen.getByText(/Hannah has \d+ of \d+ stars/);
    expect(total.getAttribute("aria-live")).toBe("polite");
  });

  it("announces a celebration in words, for anyone who cannot see confetti", async () => {
    const marks = blankWeek();
    const hygiene = STAR_TASKS.filter((task) => task.chart === "hygiene");
    marks.hannah = Object.fromEntries(
      hygiene.slice(0, -1).map((task) => [task.id, [true, false, false, false, false]]),
    );
    renderBoard(marks);

    await act(async () => {
      screen
        .getAllByRole("switch", {
          name: new RegExp(`^${hygiene[hygiene.length - 1].label} on Monday$`),
        })[0]
        .click();
    });

    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/Monday/);
    expect(status.textContent).toMatch(/Hygiene Chart/);
  });

  it("gives the page one first-level heading, and it names the child", () => {
    renderBoard();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toMatch(/^Hannah/);
  });

  it("names each chart with a second-level heading, in reading order", () => {
    renderBoard();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Chore Chart", "Summer Learning Chart", "Hygiene Chart"]);
  });

  it("labels the child picker as a tab list, with one tab selected", () => {
    renderBoard();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    expect(
      tabs.filter((tab) => tab.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1);
    expect(screen.getByRole("tablist").getAttribute("aria-label")).toBeTruthy();
  });

  it("says what the speaker button will do, not what it is", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SoundToggle on onChange={onChange} />);
    expect(
      screen.getByRole("switch", { name: "Turn the cheering off" }),
    ).toBeTruthy();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");

    rerender(<SoundToggle on={false} onChange={onChange} />);
    expect(
      screen.getByRole("switch", { name: "Turn the cheering on" }),
    ).toBeTruthy();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");

    screen.getByRole("switch").click();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("makes every control reachable by keyboard", () => {
    renderBoard();
    // Real <button>s throughout: nothing is a div with an onClick, so tab
    // order and Enter/Space come for free.
    for (const control of [
      ...screen.getAllByRole("switch"),
      ...screen.getAllByRole("tab"),
    ]) {
      expect(control.tagName).toBe("BUTTON");
      expect(control.getAttribute("type")).toBe("button");
      expect(control.getAttribute("tabindex")).not.toBe("-1");
    }

    /*
     * The one deliberate exception: the four columns that are not today are
     * `disabled`, which takes them out of the tab order on purpose. A closed
     * day should not be somewhere the keyboard stops — and today's column,
     * which is the only one anybody can act on, must still be reachable.
     */
    for (const star of screen.getAllByRole("switch", { name: / on Monday$/ })) {
      expect(star.hasAttribute("disabled")).toBe(false);
    }
    for (const star of screen.getAllByRole("switch", { name: / on Friday/ })) {
      expect(star.hasAttribute("disabled")).toBe(true);
    }
  });

  it("draws every icon in the set without an accessible name", () => {
    // Icons are always paired with text; a name here would be read twice.
    const { container } = render(
      <>
        {(
          [
            "seats",
            "health",
            "home",
            "account",
            "report",
            "rewards",
            "stars",
            "chores",
            "mantras",
            "calendar",
          ] as const
        ).map((name) => (
          <NavIcon key={name} name={name} />
        ))}
      </>,
    );

    const icons = container.querySelectorAll("svg");
    expect(icons).toHaveLength(10);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
      expect(icon.getAttribute("stroke")).toBe("currentColor");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Kid-proofing                                                        */
/* ------------------------------------------------------------------ */

describe("kid-proofing", () => {
  it("survives the same star being hammered", async () => {
    renderBoard();
    setStar.mockReturnValue(new Promise(() => {}));

    const star = () =>
      screen.getAllByRole("switch", { name: /^Piano practice on Monday$/ })[0];

    await act(async () => {
      for (let i = 0; i < 12; i += 1) star().click();
    });

    /*
     * Twelve taps inside one frame. They all read the same rendered state, so
     * they all ask for the same thing — the star ends ON rather than landing
     * wherever twelve coin flips left it. That is the kind behaviour for a
     * four-year-old drumming on a star, and it is only safe because each call
     * carries the value it wants rather than saying "flip": replay them in any
     * order, or twice, and the answer is the same.
     */
    expect(setStar).toHaveBeenCalledTimes(12);
    expect(star().getAttribute("aria-checked")).toBe("true");
    for (const [call] of setStar.mock.calls) {
      expect(call.value).toBe(true);
    }
  });

  it("survives the last star of a row being hammered", async () => {
    /*
     * A row can no longer be filled in one sitting — four of its five stars
     * belong to days that have already happened — so the fast thumb this
     * guards against is the one finishing Monday's star on a row that was
     * waiting for it.
     */
    const marks = blankWeek();
    marks.hannah = { "tidy-room": [false, true, true, true, true] };
    renderBoard(marks);

    const star = () =>
      screen.getAllByRole("switch", { name: /^Tidy room on Monday$/ })[0];

    await act(async () => {
      for (let i = 0; i < 6; i += 1) star().click();
    });

    expect(star().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/Whole row/)).toBeTruthy();
  });

  it("survives switching child mid-tap", async () => {
    renderBoard();
    setStar.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      screen.getAllByRole("switch", { name: /^Tidy room on Monday$/ })[0].click();
      screen.getByRole("tab", { name: /James/ }).click();
    });

    // The write still went to the child whose chart was open when it was
    // tapped, not to whoever is on screen when it lands.
    expect(setStar).toHaveBeenCalledWith(
      expect.objectContaining({ childId: "hannah", taskId: "tidy-room" }),
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^James/);
  });

  it("survives every child being switched through at speed", async () => {
    renderBoard();

    await act(async () => {
      for (const child of getChildren()) {
        screen.getByRole("tab", { name: new RegExp(child.name) }).click();
      }
    });

    // One chart, one heading, one backdrop — nothing accumulates.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.querySelectorAll("[data-child]")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
  });

  it("clears the confetti when it has finished falling", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const marks = blankWeek();
      const hygiene = STAR_TASKS.filter((task) => task.chart === "hygiene");
      marks.hannah = Object.fromEntries(
        hygiene
          .slice(0, -1)
          .map((task) => [task.id, [true, false, false, false, false]]),
      );
      renderBoard(marks);

      await act(async () => {
        screen
          .getAllByRole("switch", {
            name: new RegExp(`^${hygiene[hygiene.length - 1].label} on Monday$`),
          })[0]
          .click();
      });

      expect(document.querySelector("[data-confetti]")).not.toBeNull();
      expect(screen.getByRole("status")).toBeTruthy();

      // Sooner and the paper vanishes mid-air; later and an invisible overlay
      // sits on the page for no reason.
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(document.querySelector("[data-confetti]")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cannot be made to celebrate twice for the same column", async () => {
    const marks = blankWeek();
    const hygiene = STAR_TASKS.filter((task) => task.chart === "hygiene");
    marks.hannah = Object.fromEntries(
      hygiene.map((task) => [task.id, [true, false, false, false, false]]),
    );
    renderBoard(marks);

    const last = () =>
      screen.getAllByRole("switch", {
        name: new RegExp(`^${hygiene[hygiene.length - 1].label} on Monday$`),
      })[0];

    // Untick and retick: the column is briefly incomplete, so the retick is a
    // genuine completion — but the untick itself must celebrate nothing.
    await act(async () => last().click());
    expect(playCheer).not.toHaveBeenCalled();

    await act(async () => last().click());
    expect(playCheer).toHaveBeenCalledTimes(1);
  });

  it("keeps working when every single write fails", async () => {
    setStar.mockResolvedValue({ ok: false, message: "That star could not be saved." });
    renderBoard();

    await act(async () => {
      screen.getAllByRole("switch", { name: / on Monday$/ })[0].click();
    });
    await act(async () => {
      screen.getAllByRole("switch", { name: / on Monday$/ })[1].click();
    });

    // One message, not two stacked, and the chart is still tappable.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getAllByRole("switch").length).toBeGreaterThan(20);
  });

  it("clears the last failure when the next tap succeeds", async () => {
    setStar.mockResolvedValueOnce({ ok: false, message: "Nope." });
    renderBoard();

    await act(async () => {
      screen.getAllByRole("switch", { name: / on Monday$/ })[0].click();
    });
    expect(screen.getByRole("status").textContent).toContain("Nope.");

    setStar.mockResolvedValue({ ok: true });
    await act(async () => {
      screen.getAllByRole("switch", { name: / on Monday$/ })[1].click();
    });
    expect(screen.queryByText("Nope.")).toBeNull();
  });

  it("shows a chart at all when the database gave nothing back", () => {
    // Every child, no marks: this is what a first run, or an unreachable
    // database, looks like. It must render a full empty chart rather than
    // nothing.
    renderBoard(blankWeek());
    expect(screen.getAllByRole("switch").length).toBeGreaterThan(20);
    expect(screen.getByText(/Hannah has 0 of \d+ stars/)).toBeTruthy();
  });

  it("survives marks for a child who is not on the roster", () => {
    const marks = { ...blankWeek(), gandalf: { piano: [true] } } as WeekMarks;
    expect(() => renderBoard(marks)).not.toThrow();
  });

  it("survives a task in storage that no longer exists on the chart", () => {
    const marks = blankWeek();
    marks.hannah = { "polish-the-cat": [true, true, true, true, true] };
    renderBoard(marks);

    // It is not rendered, and it does not count towards the total.
    expect(screen.queryByText(/polish/i)).toBeNull();
    expect(screen.getByText(/Hannah has 0 of \d+ stars/)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Responsiveness                                                      */
/* ------------------------------------------------------------------ */

describe("responsiveness", () => {
  it("gives every star a 44px tap target", () => {
    renderBoard();
    // h-11 w-11 is 2.75rem = 44px, the smallest square a thumb hits
    // reliably — and this page is filled in by a four-year-old.
    for (const star of screen.getAllByRole("switch", { name: / on / })) {
      expect(star.className).toContain("h-11");
      expect(star.className).toContain("w-11");
    }
  });

  it("shows one child at a time rather than five columns", () => {
    renderBoard();
    // Five columns of five stars on a 390px phone would be 14px each. The
    // whole design rests on this: the tab list has five entries, the chart
    // shows one child's rows.
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(
      screen.getAllByRole("switch", { name: /^Tidy room on/ }),
    ).toHaveLength(5);
    expect(
      screen.queryAllByRole("switch", { name: /^Write alphabet on/ }),
    ).toHaveLength(0);
  });

  it("scales up from phone to tablet rather than being fixed", () => {
    const { container } = renderBoard();
    const markup = container.innerHTML;
    // Responsive prefixes must be present: a fixed layout would have none.
    expect(markup).toMatch(/\bsm:/);
    expect(container.querySelector("h1")?.className).toMatch(/sm:text-4xl/);
  });

  it("lets long task names wrap instead of pushing the stars off screen", () => {
    renderBoard();
    // "Clear & clean kitchen island & table" is the longest label on the
    // chart. Its row keeps the stars fixed-width and gives the label the rest.
    const label = screen.getByText("Clear & clean kitchen island & table");
    expect(label.className).toMatch(/leading-snug/);
    const row = label.closest("li")!;
    expect(row.querySelector(".min-w-0")).not.toBeNull();
    expect(row.querySelector(".shrink-0")).not.toBeNull();
  });

  it("keeps the five children on one line without scrolling", () => {
    renderBoard();
    const tablist = screen.getByRole("tablist");
    expect(tablist.className).toMatch(/flex/);
    expect(tablist.className).not.toMatch(/overflow-x-auto/);
    for (const tab of screen.getAllByRole("tab")) {
      // Each takes an equal share and truncates its own name rather than
      // pushing its neighbours around.
      expect(tab.className).toMatch(/flex-1/);
      expect(tab.className).toMatch(/min-w-0/);
    }
  });

  it("covers the viewport with the page burst and the card with a section burst", () => {
    const { container, rerender } = render(
      <Confetti scope="page" colors={["#fff"]} />,
    );
    const page = container.querySelector("[data-confetti]")!;
    expect(page.className).toMatch(/fixed/);
    expect(page.className).toMatch(/inset-0/);

    rerender(<Confetti scope="section" colors={["#fff"]} />);
    const section = container.querySelector("[data-confetti]")!;
    expect(section.className).toMatch(/absolute/);
    // Clipped to the card, so paper never falls across the rest of the page.
    expect(section.className).toMatch(/overflow-hidden/);
  });

  it("throws four times as much paper at the whole day as at one chart", () => {
    const { container: page } = render(<Confetti scope="page" colors={["#fff"]} />);
    const { container: card } = render(
      <Confetti scope="section" colors={["#fff"]} />,
    );

    const pieces = (root: HTMLElement) =>
      root.querySelectorAll(".confetti-piece").length;

    expect(pieces(page)).toBe(280);
    expect(pieces(card)).toBe(136);
    expect(pieces(page)).toBeGreaterThan(pieces(card));
  });

  it("gives each piece its own fall, drift and spin", () => {
    const { container } = render(<Confetti scope="section" colors={["#f5b301"]} />);
    const pieces = [...container.querySelectorAll<HTMLElement>(".confetti-piece")];

    const falls = new Set(pieces.map((p) => p.style.getPropertyValue("--confetti-fall")));
    expect(falls.size).toBeGreaterThan(10);
    for (const fall of falls) {
      // Pixels, not percent — a percentage in `translate3d` resolves against
      // the element's own box and the paper barely moves.
      expect(fall).toMatch(/px$/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The backdrop                                                        */
/* ------------------------------------------------------------------ */

describe("the child backdrop", () => {
  /** "#a855f7" -> "rgba(168, 85, 247" — the form jsdom stores it in. */
  function asRgbPrefix(hex: string): string {
    const value = Number.parseInt(hex.slice(1), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
  }

  it("renders a layer per child, with one visible", () => {
    const { container } = render(<ChildBackdrop selected="clara" />);
    const layers = [...container.querySelectorAll<HTMLElement>("[data-child] > div")];

    expect(layers).toHaveLength(5);
    expect(layers.filter((layer) => layer.style.opacity === "1")).toHaveLength(1);
  });

  it("shows two copies of the selected child's face", () => {
    const { container } = render(<ChildBackdrop selected="clara" />);
    const clara = FAMILY.find((member) => member.id === "clara")!;
    const images = [...container.querySelectorAll("img")].filter((img) =>
      img.getAttribute("src")?.includes(clara.imageSrc!.split("/").pop()!.split(".")[0]),
    );
    expect(images.length).toBeGreaterThanOrEqual(2);
  });

  it("washes every layer in that child's own colour", () => {
    const { container } = render(<ChildBackdrop selected="james" />);
    const washes = [
      ...container.querySelectorAll<HTMLElement>("[data-child] > div > div"),
    ]
      .map((node) => node.getAttribute("style") ?? "")
      .filter((style) => style.includes("gradient"));

    // One wash per child, and each one carries that child's own colour.
    // Compared as rgb, because jsdom rewrites the `#rrggbbaa` in a gradient
    // into `rgba(...)` — the hex would never match.
    expect(washes).toHaveLength(5);
    for (const child of getChildren()) {
      expect(washes.some((wash) => wash.includes(asRgbPrefix(child.avatarColor)))).toBe(
        true,
      );
    }
  });

  it("sits behind the content and ignores taps", () => {
    const { container } = render(<ChildBackdrop selected="emily" />);
    const backdrop = container.querySelector("[data-child]")!;
    expect(backdrop.className).toMatch(/pointer-events-none/);
    expect(backdrop.className).toMatch(/-z-10/);
    expect(backdrop.className).toMatch(/fixed/);
  });
});

/* ------------------------------------------------------------------ */
/* Rolling over into a new week                                        */
/* ------------------------------------------------------------------ */

describe("a device that has been left open", () => {
  /*
   * `useCurrentDate` switches to the *device's* real clock immediately after
   * mount — that is its job — so these have to pin the clock. Without that
   * they pass on the day they are written and fail at the next midnight,
   * which is exactly the trap the calendar tests fell into.
   */
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // The Wednesday of the week *after* the one the page was rendered for.
    vi.setSystemTime(new Date(2026, 7, 12, 9, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks the server for fresh marks once the week has turned", () => {
    // The page was rendered on the Tuesday; the device now says the following
    // Monday. The marks in hand are last week's, so showing them against this
    // week's chart would credit stars nobody earned.
    render(
      <StarsBoard
        initialDateIso="2026-08-10"
        weekStart={WEEK_START}
        pools={CHORE_POOLS}
        marks={blankWeek()}
      />,
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("does not refresh while the week still matches", () => {
    // Same pinned clock, but the page was rendered for the week that clock is
    // actually in — nothing to re-fetch.
    render(
      <StarsBoard
        initialDateIso="2026-08-12"
        weekStart="2026-08-10"
        pools={CHORE_POOLS}
        marks={blankWeek()}
      />,
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("marks no column as today when the week is not the current one", () => {
    render(
      <StarsBoard
        initialDateIso="2026-08-10"
        weekStart={WEEK_START}
        pools={CHORE_POOLS}
        marks={blankWeek()}
      />,
    );
    // Every star is still tappable — a parent catching up on Saturday — but
    // nothing is highlighted as "now".
    const highlighted = screen
      .getAllByRole("switch", { name: / on / })
      .filter((star) => star.style.backgroundColor !== "transparent");
    expect(highlighted).toHaveLength(0);
  });
});

describe("the chart card", () => {
  it("shows how many of that chart's stars are earned", () => {
    const marks = blankWeek();
    marks.hannah = { "tidy-room": [true, true, true, false, false] };
    renderBoard(marks);

    const chores = screen.getByRole("heading", { name: "Chore Chart" }).closest("section")!;
    // Four rows of five, three ticked.
    expect(within(chores).getByText("3/20")).toBeTruthy();
  });

  it("repeats the day letters on every card, so the columns stay labelled", () => {
    renderBoard();
    for (const heading of screen.getAllByRole("heading", { level: 2 })) {
      const card = heading.closest("section")!;
      const letters = [...card.querySelectorAll("[aria-hidden='true'] span")]
        .map((node) => node.textContent)
        .filter((text) => text && text.length === 1);
      expect(letters.slice(0, 5)).toEqual(["M", "T", "W", "T", "F"]);
    }
  });
});
