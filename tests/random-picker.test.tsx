import { act, fireEvent, render, screen } from "@testing-library/react";
import confetti from "canvas-confetti";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RandomPicker } from "@/components/RandomPicker";
import { FAMILY } from "@/config/family";

/*
 * The card's whole point is timing: two seconds of losers wiping off, two
 * seconds of the winner filling the screen, then back to normal. `game.ts`
 * doesn't exist for this feature the way it does for the finger picker — the
 * draw is one `Math.random()` call — so what is worth pinning down here is the
 * sequence, not the odds. The bounce physics itself (`step()`) isn't asserted
 * on directly — jsdom has no real layout, so every avatar's measured side is
 * 0 and the interesting part, where they actually end up, can't be observed
 * here. What matters to a caller is that a round still runs correctly with no
 * measured canvas, which every test below already exercises incidentally.
 */

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

const mockConfetti = vi.mocked(confetti);

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function tapCard() {
  const card = screen.getByRole("button", { name: /tap to randomly pick/i });
  fireEvent.click(card, { clientX: 120, clientY: 240 });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockConfetti.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("before a tap", () => {
  it("shows all seven family members on the card", () => {
    render(<RandomPicker />);
    for (const member of FAMILY) {
      expect(screen.getAllByText(member.name.charAt(0)).length).toBeGreaterThan(0);
    }
  });

  it("shows no winner overlay yet", () => {
    render(<RandomPicker />);
    expect(screen.queryByText(/!$/)).toBeNull();
  });
});

describe("tapping the card", () => {
  it("fires three confetti waves from the tap point and vibrates once", async () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });

    render(<RandomPicker />);
    tapCard();

    // Vibration happens synchronously in the click handler; the confetti
    // waves are staggered a beat apart (see the `[0, 260, 620]` delays in
    // `RandomPicker.tsx`), so they need time advanced before they have all
    // fired.
    expect(vibrate).toHaveBeenCalledTimes(1);

    await advance(700);
    expect(mockConfetti).toHaveBeenCalledTimes(3);
    expect(mockConfetti.mock.calls[0][0]).toMatchObject({
      origin: { x: expect.any(Number), y: expect.any(Number) },
    });
  });

  it("ignores a second tap while a round is already running", async () => {
    render(<RandomPicker />);
    tapCard();
    tapCard();
    tapCard();
    await advance(700);
    expect(mockConfetti).toHaveBeenCalledTimes(3);
  });

  it("reveals exactly one winner two seconds after the two-second explosion", async () => {
    render(<RandomPicker />);
    tapCard();

    await advance(1999);
    expect(screen.queryByText(/!$/)).toBeNull();

    await advance(1);
    const winnerLine = screen.getByText(/!$/);
    const winnerName = winnerLine.textContent?.replace("!", "");
    expect(FAMILY.map((member) => member.name)).toContain(winnerName);

    await advance(1999);
    expect(screen.queryByText(/!$/)).not.toBeNull();

    await advance(1);
    expect(screen.queryByText(/!$/)).toBeNull();
  });

  it("is tappable again once the round resets", async () => {
    render(<RandomPicker />);
    tapCard();
    await advance(5000);

    tapCard();
    await advance(700);
    expect(mockConfetti).toHaveBeenCalledTimes(6);
  });
});

describe("reduced motion", () => {
  const realMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it("skips confetti and vibration, but still picks and reveals someone", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });

    render(<RandomPicker />);
    tapCard();

    expect(mockConfetti).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();

    // Reduced motion drops the vibration, the confetti and the bounce/wipe
    // animations, but keeps the same timing as a full round: someone is
    // still picked, and still held on screen for a beat before the card
    // resets — just without anything moving to get there.
    await advance(2000);
    expect(screen.queryByText(/!$/)).not.toBeNull();
  });
});
