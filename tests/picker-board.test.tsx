import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FingerPicker } from "@/components/picker/FingerPicker";
import { PICKER_SECONDS } from "@/config/picker";

/*
 * The round, as it behaves under hands that come and go.
 *
 * `lib/picker/game.ts` covers the draw itself — that it is fair, and that it
 * can never point at a finger which is not there. What it cannot cover is the
 * rule the component owns: **the deadline does not move**. A round starts once
 * and ends five seconds later whatever happens in between, and the draw is
 * made from whoever is on the glass at that last instant.
 */

/**
 * Render the picker and hand back the surface every touch goes to.
 *
 * The component *is* the full-screen overlay — the `<main>` around it belongs
 * to the page — so the target is simply its root element.
 */
function renderPicker(): HTMLElement {
  const { container } = render(<FingerPicker />);
  return container.firstElementChild as HTMLElement;
}

/** A `TouchEvent`-shaped payload. React only ever reads `touches`. */
function touches(...ids: number[]) {
  return {
    touches: ids.map((id) => ({
      identifier: id,
      clientX: 100 + id * 40,
      clientY: 200,
    })),
  };
}

/** What the big number says. */
function counter(): string {
  return screen.getByText(/^\d$/).textContent ?? "";
}

/** The sr-only line, which is the only place the state is in words. */
function said(): string {
  return document.querySelector("p.sr-only")?.textContent ?? "";
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("starting a round", () => {
  it("waits, unlit, until the first finger", () => {
    renderPicker();
    expect(counter()).toBe(String(PICKER_SECONDS));
    expect(said()).toContain("Waiting");
  });

  it("starts the clock on the first finger and counts down", async () => {
    const surface = renderPicker();
    fireEvent.touchStart(surface, touches(1));

    await advance(1100);
    expect(counter()).toBe("4");
    await advance(1000);
    expect(counter()).toBe("3");
  });
});

describe("hands coming and going", () => {
  it("does not restart when another finger arrives", async () => {
    const surface = renderPicker();
    fireEvent.touchStart(surface, touches(1));
    await advance(2100);
    expect(counter()).toBe("3");

    // A second child joins two seconds in. The clock is theirs too, not a
    // fresh five seconds for everybody.
    fireEvent.touchStart(surface, touches(1, 2));
    await advance(100);
    expect(counter()).toBe("3");
    expect(said()).toContain("2 on the screen");
  });

  it("does not restart when the last finger leaves and comes back", async () => {
    /*
     * The bug this file exists for. Lifting the only finger used to cancel the
     * round outright, so putting it back began another five seconds — which to
     * anybody watching is "I moved my finger and it started over".
     */
    const surface = renderPicker();
    fireEvent.touchStart(surface, touches(1));
    await advance(2100);
    expect(counter()).toBe("3");

    fireEvent.touchEnd(surface, touches());
    await advance(100);
    // Still counting the original five seconds, on an empty screen.
    expect(counter()).toBe("3");

    fireEvent.touchStart(surface, touches(7));
    await advance(100);
    expect(counter()).toBe("3");
  });

  it("keeps the number falling while nobody is touching it", async () => {
    const surface = renderPicker();
    fireEvent.touchStart(surface, touches(1));
    fireEvent.touchEnd(surface, touches());

    await advance(1100);
    expect(counter()).toBe("4");
    await advance(2000);
    expect(counter()).toBe("2");
  });

  it("says what to do while the screen is empty", async () => {
    // A number ticking down over nothing would read as a fault without it.
    const surface = renderPicker();
    fireEvent.touchStart(surface, touches(1));
    fireEvent.touchEnd(surface, touches());
    await advance(500);
    expect(screen.getByText(/put a finger on the screen/i)).toBeDefined();
  });
});

describe("who is in the draw", () => {
  it("draws from the fingers that are down at the end, not at the start", async () => {
    const surface = renderPicker();

    // One child starts the round and then gives up on it.
    fireEvent.touchStart(surface, touches(1));
    await advance(1000);
    fireEvent.touchEnd(surface, touches());

    // Another arrives with a second to spare, and is the only candidate.
    await advance(3200);
    fireEvent.touchStart(surface, touches(9));

    await advance(1200);
    expect(said()).toMatch(/wins\.$/);
  });

  it("crowns nobody when the screen is empty at zero", async () => {
    const surface = renderPicker();
    fireEvent.touchStart(surface, touches(1));
    fireEvent.touchEnd(surface, touches());

    await advance(PICKER_SECONDS * 1000 + 200);
    expect(said()).toContain("Waiting");
    expect(said()).not.toMatch(/wins/);
  });

  it("goes back to five once a round with no winner is over", async () => {
    const surface = renderPicker();
    fireEvent.touchStart(surface, touches(1));
    fireEvent.touchEnd(surface, touches());
    await advance(PICKER_SECONDS * 1000 + 200);

    expect(counter()).toBe(String(PICKER_SECONDS));

    // …and the next finger gets a full five seconds of its own.
    fireEvent.touchStart(surface, touches(2));
    await advance(1100);
    expect(counter()).toBe("4");
  });
});
