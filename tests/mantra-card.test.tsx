import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MantraCard } from "@/components/mantras/MantraCard";
import { MantraOfDay } from "@/components/mantras/MantraOfDay";
import { getMantra, getMantraOfDay } from "@/config/mantras";

const MANTRA = getMantra("keep-walking");

describe("a mantra card", () => {
  it("shows what we say and what we mean by it", () => {
    render(<MantraCard mantra={MANTRA} />);
    expect(screen.getByRole("heading", { name: MANTRA.text })).toBeTruthy();
    expect(screen.getByText(MANTRA.meaning)).toBeTruthy();
  });

  it("marks the quote up as a quotation, not just italic text", () => {
    // This is what tells a screen reader where the family's voice stops and
    // Elder Holland's begins — the whole point of the card's layout.
    const { container } = render(<MantraCard mantra={MANTRA} />);
    const quote = container.querySelector("blockquote");
    expect(quote).not.toBeNull();
    expect(quote?.textContent).toContain(MANTRA.quote);
    expect(quote?.getAttribute("cite")).toBe(MANTRA.source.url);
  });

  it("names the speaker and their calling", () => {
    const { container } = render(<MantraCard mantra={MANTRA} />);
    const cite = container.querySelector("cite");
    expect(cite?.textContent).toContain(MANTRA.source.author);
    expect(cite?.textContent).toContain(MANTRA.source.role);
  });

  it("links to the talk so anyone can go and check it", () => {
    render(<MantraCard mantra={MANTRA} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(MANTRA.source.url);
    // Opening the talk must not hand the church's site a window handle back
    // into a page that is behind this family's login.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("puts the mantra above the quote in the reading order", () => {
    const { container } = render(<MantraCard mantra={MANTRA} />);
    const text = container.textContent ?? "";
    expect(text.indexOf(MANTRA.text)).toBeLessThan(text.indexOf(MANTRA.quote));
  });

  it("can drop a level so the page outline stays sane", () => {
    render(<MantraCard mantra={MANTRA} headingLevel={3} />);
    expect(screen.getByRole("heading", { level: 3 })).toBeTruthy();
  });
});

describe("today's mantra", () => {
  /*
   * The clock is pinned. `useCurrentDate` corrects itself to the real device
   * date immediately after mount, so without this the assertions below would
   * quietly start failing tomorrow — the classic test that passes on the day
   * it was written and nowhere else.
   */
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4, 9, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the mantra for that day", () => {
    const expected = getMantraOfDay(new Date(2026, 7, 4, 12));
    render(<MantraOfDay initialDateIso="2026-08-04" />);
    expect(screen.getByRole("heading", { name: expected.text })).toBeTruthy();
  });

  it("shows the date it is talking about", () => {
    render(<MantraOfDay initialDateIso="2026-08-04" />);
    const today = screen.getByRole("region", { name: "Today" });
    expect(within(today).getByText(/August 4/)).toBeTruthy();
  });

  it("is not just echoing the date it was handed", () => {
    // A different day must produce a different card, or the "mantra of the
    // day" is decorative rather than real.
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0, 0));
    render(<MantraOfDay initialDateIso="2026-08-05" />);
    const expected = getMantraOfDay(new Date(2026, 7, 5, 12));
    expect(screen.getByRole("heading", { name: expected.text })).toBeTruthy();
    expect(expected.text).not.toBe(getMantraOfDay(new Date(2026, 7, 4, 12)).text);
  });
});
