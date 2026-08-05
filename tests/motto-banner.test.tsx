import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MottoBanner } from "@/components/motto/MottoBanner";
import { getMottoOfWeek, getMottoWeek } from "@/lib/motto";

/*
 * The banner is seeded with the server's date so that the first paint already
 * shows the right motto — these render it exactly as the dashboard does, with
 * an ISO date rather than a live clock, so nothing here depends on when the
 * suite happens to run.
 */

function localDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

const MONDAY = "2026-08-03";
const MIDWEEK = "2026-08-05";

describe("the motto banner", () => {
  /*
   * The clock is pinned, for the reason the mantra tests pin theirs:
   * `useCurrentDate` corrects itself to the real device date immediately after
   * mount, so an unpinned test would assert against whatever week the suite
   * happened to be run in and start failing on some future Monday.
   */
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the week's motto and what we mean by it", () => {
    const motto = getMottoOfWeek(localDate(MIDWEEK));
    render(<MottoBanner initialDateIso={MIDWEEK} />);

    expect(screen.getByText(motto.text)).toBeTruthy();
    expect(screen.getByText(motto.meaning)).toBeTruthy();
  });

  it("says what it is, so nobody mistakes it for a card that failed to open", () => {
    render(<MottoBanner initialDateIso={MIDWEEK} />);
    expect(
      screen.getByRole("heading", { name: /motto of the week/i }),
    ).toBeTruthy();
  });

  it("tells you when the motto changes", () => {
    render(<MottoBanner initialDateIso={MIDWEEK} />);
    expect(
      screen.getByText(getMottoWeek(localDate(MIDWEEK)).countdownLabel),
    ).toBeTruthy();
  });

  it("dates the week machine-readably, from its Monday", () => {
    const { container } = render(<MottoBanner initialDateIso={MIDWEEK} />);
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe(
      MONDAY,
    );
  });

  it("shows the next motto once the week turns over", () => {
    const thisWeek = getMottoOfWeek(localDate(MIDWEEK));
    const nextWeek = getMottoOfWeek(localDate("2026-08-10"));
    expect(nextWeek.id).not.toBe(thisWeek.id);

    vi.setSystemTime(new Date(2026, 7, 10, 9, 0, 0));
    render(<MottoBanner initialDateIso="2026-08-10" />);
    expect(screen.getByText(nextWeek.text)).toBeTruthy();
    expect(screen.queryByText(thisWeek.text)).toBeNull();
  });
});
