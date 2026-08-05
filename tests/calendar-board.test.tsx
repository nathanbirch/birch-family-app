import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarBoard } from "@/components/calendar/CalendarBoard";
import type { CalendarEvent } from "@/lib/calendar/events";
import { NAV_ITEMS, getNavBarItems } from "@/config/navigation";

/*
 * The board reads the *device's* date after mount, so these tests fix it: the
 * initial ISO date the server would send is 4 August 2026, a Tuesday.
 *
 * Rather than faking timers, each event is built from local `Date`s, which is
 * exactly how the component reads them back. The suite is therefore correct in
 * any machine timezone.
 */
const TODAY = new Date(2026, 7, 4, 9, 0);

/*
 * The board re-reads the device clock on mount, so the machine's real date
 * would otherwise decide which day the Day view lands on. Freeze it.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

function timed(title: string, day: number, hour: number): CalendarEvent {
  const start = new Date(2026, 7, day, hour).getTime();
  return {
    id: `${title}-${day}`,
    title,
    location: null,
    description: null,
    allDay: false,
    start,
    end: start + 60 * 60 * 1000,
    startDate: null,
    endDate: null,
  };
}

function allDayOn(title: string, iso: string): CalendarEvent {
  return {
    id: title,
    title,
    location: null,
    description: null,
    allDay: true,
    start: Date.parse(`${iso}T00:00:00Z`),
    end: Date.parse(`${iso}T00:00:00Z`) + 86400000,
    startDate: iso,
    endDate: iso,
  };
}

function renderBoard(events: CalendarEvent[] = []) {
  return render(
    <CalendarBoard
      events={events}
      initialDateIso="2026-08-04"
      windowStart="2026-07-01"
      windowEnd="2027-01-31"
      truncated={false}
    />,
  );
}

/** Leave the default Day view for the week. */
function showWeek() {
  fireEvent.click(screen.getByRole("tab", { name: "Week" }));
}

describe("the calendar board", () => {
  it("opens on the day view", () => {
    renderBoard();
    expect(
      screen.getByRole("tab", { name: "Day" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("shows only today until another view is asked for", () => {
    renderBoard([timed("piano", 4, 15), timed("swim", 8, 10)]);

    expect(screen.getByText("piano")).toBeTruthy();
    expect(screen.queryByText("swim")).toBeNull();
  });

  it("shows the whole Monday-to-Sunday week", () => {
    renderBoard([timed("piano", 4, 15), timed("swim", 8, 10)]);
    showWeek();

    // 4 August 2026 is a Tuesday, so the week runs 3rd to 9th and holds both.
    expect(screen.getByText("piano")).toBeTruthy();
    expect(screen.getByText("swim")).toBeTruthy();
  });

  it("leaves an event in a different week out", () => {
    renderBoard([timed("piano", 4, 15), timed("dentist", 20, 10)]);
    showWeek();
    expect(screen.queryByText("dentist")).toBeNull();
  });

  it("switches back to the day view and shows only that day", () => {
    renderBoard([timed("piano", 4, 15), timed("swim", 8, 10)]);

    showWeek();
    expect(screen.getByText("swim")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Day" }));

    expect(screen.getByText("piano")).toBeTruthy();
    expect(screen.queryByText("swim")).toBeNull();
  });

  it("switches to the month view and shows the whole month", () => {
    renderBoard([timed("piano", 4, 15), timed("dentist", 20, 10)]);

    fireEvent.click(screen.getByRole("tab", { name: "Month" }));

    expect(screen.getByText(/August 2026/)).toBeTruthy();
    expect(screen.getByText("dentist")).toBeTruthy();
  });

  it("opens a day when one is tapped in the week view", () => {
    renderBoard([timed("swim", 8, 10)]);
    showWeek();

    // Saturday the 8th.
    fireEvent.click(screen.getByRole("button", { name: /Open Saturday/ }));

    expect(
      screen.getByRole("tab", { name: "Day" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("swim")).toBeTruthy();
  });

  it("steps forward a week and back again", () => {
    renderBoard([timed("piano", 4, 15), timed("dentist", 20, 10)]);
    showWeek();

    const next = screen.getByRole("button", { name: "Next" });
    fireEvent.click(next);
    expect(screen.queryByText("piano")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("piano")).toBeTruthy();
  });

  it("offers a way back once you have navigated away", () => {
    renderBoard();
    expect(screen.queryByText("Back to today")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const back = screen.getByText("Back to today");

    fireEvent.click(back);
    expect(screen.queryByText("Back to today")).toBeNull();
  });

  it("disables the arrow at the edge of the expanded window", () => {
    render(
      <CalendarBoard
        events={[]}
        initialDateIso="2026-08-04"
        // A window of exactly the week being shown: neither arrow can move.
        windowStart="2026-08-03"
        windowEnd="2026-08-09"
        truncated={false}
      />,
    );
    showWeek();

    const previous = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });
    expect((previous as HTMLButtonElement).disabled).toBe(true);
    expect((next as HTMLButtonElement).disabled).toBe(true);
  });

  it("says so when the expansion was cut short", () => {
    render(
      <CalendarBoard
        events={[]}
        initialDateIso="2026-08-04"
        windowStart="2026-07-01"
        windowEnd="2027-01-31"
        truncated
      />,
    );
    expect(screen.getByText(/may be missing/)).toBeTruthy();
  });

  it("shows an empty day honestly rather than blankly", () => {
    renderBoard([]);
    expect(screen.getByText("Nothing on this day.")).toBeTruthy();
  });

  it("marks today in the week view", () => {
    renderBoard();
    showWeek();
    const tuesday = screen.getByRole("button", { name: /Open Tuesday, 4 August|Open Tuesday, August 4/ });
    expect(within(tuesday).getByText("4")).toBeTruthy();
  });
});

describe("the list / timeline toggle", () => {
  /** Switch to the hour grid. */
  function showTimeline() {
    fireEvent.click(screen.getByRole("button", { name: "Timeline view" }));
  }

  it("starts on the list layout", () => {
    renderBoard();
    expect(
      screen.getByRole("button", { name: "List view" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByLabelText("This day, by time")).toBeNull();
  });

  it("switches the week to the hour grid", () => {
    renderBoard([timed("piano", 4, 15)]);
    showWeek();
    showTimeline();

    expect(screen.getByLabelText("This week, by time")).toBeTruthy();
    expect(screen.getByText("piano")).toBeTruthy();
  });

  it("switches the day to the hour grid", () => {
    renderBoard([timed("piano", 4, 15)]);
    showTimeline();

    expect(screen.getByLabelText("This day, by time")).toBeTruthy();
  });

  it("keeps the choice when moving between Day and Week", () => {
    // The layout is a property of the calendar, not of the view you are on.
    renderBoard();
    showTimeline();
    expect(screen.getByLabelText("This day, by time")).toBeTruthy();

    showWeek();
    expect(screen.getByLabelText("This week, by time")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Day" }));
    expect(screen.getByLabelText("This day, by time")).toBeTruthy();
  });

  it("goes back to the list layout", () => {
    renderBoard([timed("piano", 4, 15)]);
    showWeek();
    showTimeline();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));

    expect(screen.queryByLabelText("This week, by time")).toBeNull();
    expect(screen.getByLabelText("This week")).toBeTruthy();
  });

  it("hides the toggle on Month, which has no time axis", () => {
    renderBoard();
    fireEvent.click(screen.getByRole("tab", { name: "Month" }));

    expect(screen.queryByRole("button", { name: "Timeline view" })).toBeNull();
  });

  it("still shows all-day events, above the axis", () => {
    renderBoard([allDayOn("Hannah's Night", "2026-08-05")]);
    showWeek();
    showTimeline();

    // Present, but not placed on the time grid — the layout excludes it.
    expect(screen.getByText("Hannah's Night")).toBeTruthy();
  });

  it("opens a day from a column heading", () => {
    renderBoard([timed("swim", 8, 10)]);
    showWeek();
    showTimeline();

    fireEvent.click(screen.getByRole("button", { name: /Open Saturday/ }));

    expect(
      screen.getByRole("tab", { name: "Day" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByLabelText("This day, by time")).toBeTruthy();
  });
});

describe("navigation", () => {
  it("lists the calendar as a real page, not a planned one", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(hrefs).toContain("/calendar");
  });

  it("keeps the bar within the five slots it can hold", () => {
    expect(getNavBarItems().length).toBeLessThanOrEqual(5);
  });

  it("gives every bar item a distinct slot", () => {
    // Only the *slotted* pages have to be distinct. `null` is not a slot, and
    // more than one page is reached from the dashboard alone — Mantras and
    // Healthy — so counting those in would fail for no good reason.
    const slots = NAV_ITEMS.map((item) => item.slot).filter(
      (slot) => slot !== null,
    );
    expect(new Set(slots).size).toBe(slots.length);
  });
});

/** `TODAY` is referenced by the fixtures above; assert it is the Tuesday. */
describe("the fixture", () => {
  it("is a Tuesday", () => {
    expect(TODAY.getDay()).toBe(2);
  });
});
