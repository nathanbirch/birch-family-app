import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AwardCeremony } from "@/components/report/AwardCeremony";
import { childSlideMs } from "@/components/report/timing";
import { CHORE_POOLS } from "@/config/chore-rotation";
import { SOUND_STORAGE_KEY } from "@/config/app";
import { CHILD_IDS, type ChildId } from "@/config/family";
import { starDayCount } from "@/config/stars";
import { parseLocalDate } from "@/lib/dates";
import type { WeekMarks } from "@/lib/stars/counting";
import { buildSpanReport, buildWeekReport } from "@/lib/stars/report";
import { getChartTasksForChild } from "@/lib/stars/tasks";

/**
 * The award ceremony.
 *
 * Three things are worth proving here, and all three are behaviour a family
 * would notice rather than implementation:
 *
 *   - It turns over by itself, on the clock in `timing.ts`, and it stops at
 *     the end rather than falling off it.
 *   - It can be dragged, and a drag that is really a scroll is left alone.
 *   - The music only ever starts from a button, and never when the device has
 *     asked for silence.
 */

const playback = vi.hoisted(() => ({
  startFanfare: vi.fn(),
  stopFanfare: vi.fn(),
  primeFanfare: vi.fn(),
}));
vi.mock("@/lib/stars/fanfare", () => playback);

/*
 * The playlist, mocked, and answering `false` unless a test says otherwise.
 *
 * `false` is "YouTube did not turn up" — no playlist configured, no network, a
 * private playlist — which is the case the ceremony has to survive, so it is
 * the default every test runs under.
 */
const music = vi.hoisted(() => ({
  primeCeremonyPlaylist: vi.fn(),
  startCeremonyPlaylist: vi.fn(),
  stopCeremonyPlaylist: vi.fn(),
}));
vi.mock("@/lib/stars/playlist", () => music);

const MONDAY = parseLocalDate("2026-08-03")!;
/* A Monday-to-Friday week: it predates `SATURDAY_FROM_WEEK`. */
const DAYS = starDayCount("2026-08-03");

function report() {
  const marks = Object.fromEntries(
    CHILD_IDS.map((id) => [id, {}]),
  ) as WeekMarks;

  // One filled chart, so there is something for the slides to count.
  for (const child of ["hannah", "james"] as ChildId[]) {
    for (const task of getChartTasksForChild(CHORE_POOLS, MONDAY, child, "hygiene")) {
      marks[child][task.id] = Array.from({ length: DAYS }, () => true);
    }
  }

  return buildWeekReport(CHORE_POOLS, MONDAY, marks);
}

function stage(): HTMLElement {
  return screen.getByRole("group", { name: /^Slide \d+ of \d+$/ });
}

/** Which slide is on stage, 1-based, read the way a screen reader would. */
function slideNumber(): number {
  const label = stage().getAttribute("aria-label") ?? "";
  return Number(/^Slide (\d+)/.exec(label)?.[1]);
}

/** How long the child's slide currently on stage runs for. */
function currentSlideMs(): number {
  const built = report();
  // Slide 1 is the title card, so the child at slide n is children[n - 2].
  return childSlideMs(built.children[slideNumber() - 2].charts.length);
}

function renderCeremony() {
  return render(<AwardCeremony report={report()} dateLabel="Aug 3 – Aug 7" />);
}

/** Drag the stage sideways by `dx` pixels and let go. */
function drag(dx: number, dy = 0) {
  const element = stage();
  // jsdom gives every element a zero width, and the drag threshold is a share
  // of it — so the width the component measures is stubbed here.
  vi.spyOn(element, "clientWidth", "get").mockReturnValue(400);

  fireEvent.pointerDown(element, { pointerId: 1, clientX: 200, clientY: 200 });
  // Two moves: the first crosses the lock threshold, the second is the travel.
  fireEvent.pointerMove(element, {
    pointerId: 1,
    clientX: 200 + Math.sign(dx) * 20,
    clientY: 200 + dy,
  });
  fireEvent.pointerMove(element, {
    pointerId: 1,
    clientX: 200 + dx,
    clientY: 200 + dy,
  });
  fireEvent.pointerUp(element, { pointerId: 1, clientX: 200 + dx, clientY: 200 + dy });
}

beforeEach(() => {
  vi.clearAllMocks();
  music.startCeremonyPlaylist.mockResolvedValue(false);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

/**
 * Let the music decision settle.
 *
 * Starting a song is asynchronous — YouTube's script, then the player, then
 * the playlist — so whether the fanfare plays instead is only known a
 * microtask after the press.
 */
async function settleMusic() {
  await act(async () => {});
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the curtain", () => {
  it("opens on the title card and waits to be told to start", () => {
    renderCeremony();

    expect(slideNumber()).toBe(1);
    expect(screen.getByRole("button", { name: /start the ceremony/i })).toBeTruthy();
    expect(playback.startFanfare).not.toHaveBeenCalled();
  });

  it("does not turn over on its own before it has been started", () => {
    renderCeremony();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(slideNumber()).toBe(1);
  });

  it("starts the music and the first award on one press", async () => {
    renderCeremony();

    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));

    // The slide turns immediately; the music is decided a beat later.
    expect(slideNumber()).toBe(2);
    await settleMusic();
    expect(playback.startFanfare).toHaveBeenCalledTimes(1);
  });

  it("plays a playlist song *instead of* the fanfare, never both", async () => {
    /*
     * The whole point of the fallback being a fallback. Two pieces of music at
     * once is not a richer ceremony, it is a mess — and it is the failure mode
     * an `await` in the wrong place produces.
     */
    music.startCeremonyPlaylist.mockResolvedValue(true);
    renderCeremony();

    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));
    await settleMusic();

    expect(music.startCeremonyPlaylist).toHaveBeenCalledTimes(1);
    expect(playback.startFanfare).not.toHaveBeenCalled();
  });

  it("falls back to the fanfare when YouTube does not turn up", async () => {
    // No playlist configured, no network, an ad-blocker, a private playlist:
    // all one answer here, and all of them end in brass rather than silence.
    music.startCeremonyPlaylist.mockResolvedValue(false);
    renderCeremony();

    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));
    await settleMusic();

    expect(playback.startFanfare).toHaveBeenCalledTimes(1);
  });

  it("does not start a song that arrived after the speaker was turned off", async () => {
    /*
     * The race a ref exists to close. A song takes a moment to fetch, and a
     * child can tap the speaker off inside that moment — React state would
     * still read `true` in the closure that is waiting, and the music would
     * arrive on top of the silence they just asked for.
     */
    let arrive: (started: boolean) => void = () => {};
    music.startCeremonyPlaylist.mockReturnValue(
      new Promise<boolean>((resolve) => {
        arrive = resolve;
      }),
    );
    renderCeremony();

    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));
    fireEvent.click(
      screen.getByRole("switch", { name: /turn the ceremony music off/i }),
    );

    await act(async () => {
      arrive(true);
    });

    expect(music.stopCeremonyPlaylist).toHaveBeenCalled();
    expect(playback.startFanfare).not.toHaveBeenCalled();
  });
});

describe("holding it while the room claps", () => {
  /*
   * The one thing the auto-advance timer cannot know is that everybody is
   * still clapping. Hold stops the clock and nothing else — the music carries
   * on, and letting go resumes the slide rather than restarting it.
   */

  function hold() {
    return screen.getByRole("button", { name: /^hold$/i });
  }
  function goOn() {
    return screen.getByRole("button", { name: /go on/i });
  }

  function begin() {
    renderCeremony();
    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));
  }

  it("is not offered before the ceremony has begun", () => {
    // There is no clock to hold on the title card.
    renderCeremony();
    expect(screen.queryByRole("button", { name: /^hold$/i })).toBeNull();
  });

  it("stops the slide turning over", () => {
    begin();
    const duration = currentSlideMs();
    fireEvent.click(hold());

    act(() => {
      vi.advanceTimersByTime(duration * 3);
    });
    expect(slideNumber()).toBe(2);
  });

  it("resumes with the time the slide had left, not a fresh slide", () => {
    /*
     * The bug the whole `remaining` ref exists to prevent. The reveals are CSS
     * and have already played by the time anybody presses Hold, so restarting
     * the clock is ten more seconds of the room looking at a finished slide.
     */
    begin();
    const duration = currentSlideMs();

    act(() => {
      vi.advanceTimersByTime(duration - 800);
    });
    fireEvent.click(hold());
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(slideNumber()).toBe(2);

    fireEvent.click(goOn());
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(slideNumber()).toBe(3);
  });

  it("gives the next slide its whole duration, not the last one's remainder", () => {
    begin();
    const first = currentSlideMs();

    // Hold almost at the end of slide one, then let it turn.
    act(() => {
      vi.advanceTimersByTime(first - 500);
    });
    fireEvent.click(hold());
    fireEvent.click(goOn());
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(slideNumber()).toBe(3);

    // The new slide must not inherit the 500ms that was left of the old one.
    const second = currentSlideMs();
    act(() => {
      vi.advanceTimersByTime(second - 1000);
    });
    expect(slideNumber()).toBe(3);
  });

  it("lets go when somebody moves on by hand", () => {
    // Otherwise the next child's slide sits there until somebody remembers a
    // button they pressed two minutes ago.
    begin();
    fireEvent.click(hold());
    drag(-200);

    expect(screen.queryByRole("button", { name: /go on/i })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(currentSlideMs() + 100);
    });
    expect(slideNumber()).toBe(4);
  });

  it("leaves the music alone", async () => {
    /*
     * The whole point of calling it Hold rather than Pause. Somebody stopping
     * the slides to let a four-year-old take a bow has not asked for silence.
     */
    begin();
    await settleMusic();
    vi.clearAllMocks();

    fireEvent.click(hold());
    fireEvent.click(goOn());

    expect(playback.stopFanfare).not.toHaveBeenCalled();
    expect(music.stopCeremonyPlaylist).not.toHaveBeenCalled();
    expect(playback.startFanfare).not.toHaveBeenCalled();
  });
});

describe("turning over by itself", () => {
  it("holds a child's slide for its whole choreography, then moves on", () => {
    renderCeremony();
    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));

    const duration = currentSlideMs();

    // A second before the end, the same child is still on stage — the five
    // seconds after the total lands is the point of the whole thing.
    act(() => {
      vi.advanceTimersByTime(duration - 1000);
    });
    expect(slideNumber()).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1001);
    });
    expect(slideNumber()).toBe(3);
  });

  it("walks all the way to the family finale and stops there", () => {
    const built = report();
    renderCeremony();
    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));

    // Every child, one after another.
    for (let position = 0; position < built.children.length; position += 1) {
      act(() => {
        vi.advanceTimersByTime(currentSlideMs() + 50);
      });
    }

    const finale = built.children.length + 2;
    expect(slideNumber()).toBe(finale);

    // And it stays there. A ceremony that looped would take the ending away.
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(slideNumber()).toBe(finale);
  });
});

describe("dragging through it by hand", () => {
  it("moves on when dragged far enough to the left", () => {
    renderCeremony();

    drag(-160);

    expect(slideNumber()).toBe(2);
  });

  it("goes back when dragged the other way", () => {
    renderCeremony();
    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));

    drag(160);

    expect(slideNumber()).toBe(1);
  });

  it("snaps back when the drag was only a nudge", () => {
    renderCeremony();

    // Under the fifth of the width that counts as a decision.
    drag(-50);

    expect(slideNumber()).toBe(1);
  });

  it("leaves a vertical scroll alone", () => {
    renderCeremony();

    // Mostly down the screen: this is somebody scrolling the page, and the
    // report must not be the one page in the app that cannot be scrolled.
    drag(-30, 200);

    expect(slideNumber()).toBe(1);
  });

  it("cannot be dragged off either end", () => {
    renderCeremony();

    drag(300);
    expect(slideNumber()).toBe(1);
  });

  it("starts the slides turning, but never the music", () => {
    renderCeremony();

    drag(-160);

    act(() => {
      vi.advanceTimersByTime(currentSlideMs() + 50);
    });
    expect(slideNumber()).toBe(3);
    // A swipe is a navigation. Brass arriving out of a page somebody was
    // quietly looking through is how an app gets closed.
    expect(playback.startFanfare).not.toHaveBeenCalled();
  });
});

describe("jumping about", () => {
  it("goes straight to a child from the rail", () => {
    renderCeremony();
    const built = report();
    const last = built.children[built.children.length - 1];

    fireEvent.click(screen.getByRole("button", { name: `Go to ${last.name}` }));

    expect(slideNumber()).toBe(built.children.length + 1);
  });

  it("moves with the arrow keys", () => {
    renderCeremony();

    fireEvent.keyDown(stage(), { key: "ArrowRight" });
    expect(slideNumber()).toBe(2);

    fireEvent.keyDown(stage(), { key: "ArrowLeft" });
    expect(slideNumber()).toBe(1);

    fireEvent.keyDown(stage(), { key: "End" });
    expect(slideNumber()).toBe(report().children.length + 2);
  });
});

describe("the music", () => {
  it("stays silent on a device that has turned the sound off", () => {
    window.localStorage.setItem(SOUND_STORAGE_KEY, "off");
    renderCeremony();

    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));

    expect(playback.startFanfare).not.toHaveBeenCalled();
    // …and the slides still run. Silence is a preference, not a fault.
    expect(slideNumber()).toBe(2);
  });

  it("can be switched on and off from the speaker, mid-ceremony", async () => {
    renderCeremony();

    const speaker = screen.getByRole("switch", {
      name: /turn the ceremony music off/i,
    });
    fireEvent.click(speaker);
    expect(playback.stopFanfare).toHaveBeenCalled();
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe("off");

    fireEvent.click(
      screen.getByRole("switch", { name: /turn the ceremony music on/i }),
    );
    await settleMusic();
    expect(playback.startFanfare).toHaveBeenCalled();
  });

  it("takes the music with it when the page is left", () => {
    const view = renderCeremony();
    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));

    view.unmount();

    // Otherwise the fanfare plays on over the star charts.
    expect(playback.stopFanfare).toHaveBeenCalled();
  });
});

describe("what a screen reader is told", () => {
  it("announces the slide on stage, and only that one", () => {
    renderCeremony();
    fireEvent.click(screen.getByRole("button", { name: /start the ceremony/i }));

    const first = report().children[0];
    const status = screen.getByRole("status");
    expect(status.textContent).toContain(first.name);
    expect(status.textContent).toContain(`${first.earned} stars in total`);

    // The other slides are off stage and hidden — six copies of "63 stars"
    // read out in a row is not a ceremony.
    const hidden = stage().querySelectorAll('[aria-hidden="true"][inert]');
    expect(hidden.length).toBe(report().children.length + 1);
  });
});

describe("a ceremony that spans several weeks", () => {
  /** The same three weeks the "Summer So Far" ceremony covers. */
  const WEEKS = ["2026-07-20", "2026-07-27", "2026-08-03"];

  function spanReport() {
    return buildSpanReport(
      CHORE_POOLS,
      "summer-so-far",
      WEEKS.map((week) => {
        const monday = parseLocalDate(week)!;
        const marks = Object.fromEntries(
          CHILD_IDS.map((id) => [id, {}]),
        ) as WeekMarks;
        for (const task of getChartTasksForChild(
          CHORE_POOLS,
          monday,
          "hannah",
          "hygiene",
        )) {
          marks.hannah[task.id] = Array.from(
            { length: DAYS },
            () => true,
          );
        }
        return { monday, marks };
      }),
    );
  }

  function renderSpan() {
    return render(
      <AwardCeremony
        report={spanReport()}
        dateLabel="Jul 20 – Aug 7"
        title="Summer So Far"
      />,
    );
  }

  it("takes its own name on the title card", () => {
    // A ceremony somebody put together for one evening is not "The Birch
    // Family Star Awards" — the name is the reason it exists.
    renderSpan();
    expect(screen.getByText("Summer So Far")).toBeTruthy();
    expect(screen.queryByText(/Star Awards/)).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Summer So Far");
  });

  it("says how long it covers rather than calling it a week", () => {
    const built = spanReport();
    renderSpan();

    // Straight to the finale: the caption under the family's total is the one
    // line in the ceremony that names the period out loud.
    fireEvent.click(screen.getByRole("button", { name: /the family total/i }));
    expect(screen.getByText("stars in 3 weeks")).toBeTruthy();
    expect(screen.queryByText("stars this week")).toBeNull();
    expect(built.weekCount).toBe(3);
  });

  it("still gives every child exactly one slide", () => {
    renderSpan();
    // Title, five children, finale — the shape of the ceremony does not change
    // because the period did.
    expect(slideNumber()).toBe(1);
    expect(stage().getAttribute("aria-label")).toBe(
      `Slide 1 of ${spanReport().children.length + 2}`,
    );
  });
});
