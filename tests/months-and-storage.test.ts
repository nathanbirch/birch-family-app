import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LAST_PAGE_STORAGE_KEY,
  PARENTS_STORAGE_KEY,
  SOUND_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "@/config/app";
import {
  differenceInCalendarMonths,
  formatMonthYear,
  parseLocalMonth,
  startOfNextMonth,
} from "@/lib/dates";
import { readLastPage, writeLastPage } from "@/lib/last-page-storage";
import { readParentsSwapped, writeParentsSwapped } from "@/lib/parent-storage";
import { readSoundOn, writeSoundOn } from "@/lib/sound-storage";
import { readStoredTheme, writeStoredTheme } from "@/lib/theme-storage";

/**
 * The month arithmetic the chore rotation rests on, and the four device
 * preferences.
 *
 * The preferences share one rule that is easy to state and easy to forget:
 * **storage is allowed to fail**. Safari private mode and locked-down
 * enterprise browsers throw on `localStorage`, and losing a saved theme must
 * never take a page down with it. Each of them is checked against a throwing
 * store here rather than trusted.
 */

function localDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("parsing a month", () => {
  it("reads YYYY-MM as the first of that month, at noon", () => {
    const august = parseLocalMonth("2026-08");
    expect(august?.getFullYear()).toBe(2026);
    expect(august?.getMonth()).toBe(7);
    expect(august?.getDate()).toBe(1);
    // Noon, so that DST never moves it into the previous month.
    expect(august?.getHours()).toBe(12);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseLocalMonth("  2026-08  ")?.getMonth()).toBe(7);
  });

  it("refuses everything that is not a month", () => {
    for (const rubbish of [
      "",
      "2026",
      "2026-",
      "2026-8",
      "26-08",
      "2026-00",
      "2026-13",
      "2026-08-04",
      "August",
      "not a month",
    ]) {
      expect(parseLocalMonth(rubbish)).toBeNull();
    }
  });
});

describe("counting months", () => {
  it("ignores the day of the month entirely", () => {
    // This is what makes the chore rotation turn over at midnight on the 1st
    // and at no other moment.
    expect(
      differenceInCalendarMonths(localDate("2026-01-31"), localDate("2026-02-01")),
    ).toBe(1);
    expect(
      differenceInCalendarMonths(localDate("2026-01-01"), localDate("2026-01-31")),
    ).toBe(0);
  });

  it("counts backwards as readily as forwards", () => {
    expect(
      differenceInCalendarMonths(localDate("2026-08-04"), localDate("2026-05-04")),
    ).toBe(-3);
  });

  it("crosses years", () => {
    expect(
      differenceInCalendarMonths(localDate("2026-08-04"), localDate("2027-08-04")),
    ).toBe(12);
    expect(
      differenceInCalendarMonths(localDate("2024-02-29"), localDate("2026-08-04")),
    ).toBe(30);
  });

  it("finds the first of next month, including over a year end", () => {
    expect(startOfNextMonth(localDate("2026-08-20")).getMonth()).toBe(8);
    expect(startOfNextMonth(localDate("2026-01-31")).getMonth()).toBe(1);

    const january = startOfNextMonth(localDate("2026-12-31"));
    expect(january.getFullYear()).toBe(2027);
    expect(january.getMonth()).toBe(0);
    expect(january.getDate()).toBe(1);
  });

  it("names a month for a human", () => {
    expect(formatMonthYear(localDate("2026-08-04"))).toMatch(/2026/);
    expect(formatMonthYear(localDate("2026-08-04"))).toMatch(/Aug/);
  });
});

/* ------------------------------------------------------------------ */

/** Make every `localStorage` call throw, as a locked-down browser does. */
function breakStorage() {
  const message = "SecurityError: storage is disabled";
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error(message);
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error(message);
  });
}

describe("device preferences survive storage being unavailable", () => {
  it("the theme falls back to the default", () => {
    breakStorage();
    expect(() => writeStoredTheme("forest")).not.toThrow();
    expect(readStoredTheme()).toBeTruthy();
  });

  it("the parent swap falls back to 'not swapped'", () => {
    breakStorage();
    expect(() => writeParentsSwapped(true)).not.toThrow();
    expect(readParentsSwapped()).toBe(false);
  });

  it("the last page falls back to 'nothing saved'", () => {
    breakStorage();
    expect(() => writeLastPage("/stars")).not.toThrow();
    expect(readLastPage()).toBeNull();
  });

  it("the cheer falls back to on", () => {
    breakStorage();
    expect(() => writeSoundOn(false)).not.toThrow();
    expect(readSoundOn()).toBe(true);
  });
});

describe("device preferences round-trip when storage works", () => {
  it("keeps each preference under its own key", () => {
    writeStoredTheme("forest");
    writeParentsSwapped(true);
    writeLastPage("/stars");
    writeSoundOn(false);

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("forest");
    expect(window.localStorage.getItem(PARENTS_STORAGE_KEY)).toBeTruthy();
    expect(window.localStorage.getItem(LAST_PAGE_STORAGE_KEY)).toBe("/stars");
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe("off");

    expect(readStoredTheme()).toBe("forest");
    expect(readParentsSwapped()).toBe(true);
    expect(readLastPage()).toBe("/stars");
    expect(readSoundOn()).toBe(false);
  });

  it("ignores a stored value that is no longer valid", () => {
    // A theme that was deleted from the config, and a page that was renamed
    // out of the app: both must fall back rather than pin a device to a
    // 404 or an unstyled page.
    window.localStorage.setItem(THEME_STORAGE_KEY, "disco-inferno");
    window.localStorage.setItem(LAST_PAGE_STORAGE_KEY, "/chores");

    expect(readStoredTheme()).not.toBe("disco-inferno");
    expect(readLastPage()).toBeNull();
  });

  it("follows a page that has been renamed", () => {
    // The seating page has had three names; a device holding an old one is
    // sent to where it went rather than being forgotten.
    window.localStorage.setItem(LAST_PAGE_STORAGE_KEY, "/seating");
    expect(readLastPage()).toBe("/turns");
  });
});
