import { describe, expect, it } from "vitest";

import { MOTTOS, MOTTO_COUNT, MOTTO_START_DATE } from "@/config/motto";
import { NAV_ITEMS, PLANNED_FEATURES } from "@/config/navigation";
import {
  getMottoCountdownLabel,
  getMottoIndex,
  getMottoOfWeek,
  getMottoStartDate,
  getMottoWeek,
  getMottoWeekOffset,
} from "@/lib/motto";

/*
 * The motto is the first thing on the home screen and it is derived from the
 * calendar alone, so the two things worth pinning down are: it must not change
 * mid-week (a motto that flips on a Wednesday is not a motto), and every phone
 * asking on the same day must get the same answer.
 */

function localDate(iso: string, hour = 12): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

const START = getMottoStartDate();

describe("the motto list", () => {
  it("has the two family mottos, in order", () => {
    expect(MOTTOS.map((motto) => motto.text)).toEqual([
      "Love Like Jesus.",
      "Think Celestial.",
    ]);
    expect(MOTTO_COUNT).toBe(2);
  });

  it("gives every motto a stable id, a meaning and a real icon", () => {
    // Every drawable icon: the nav pages, the planned features, and the
    // decorative ones that belong to no page (`DecorativeIconName`).
    const icons = new Set<string>([
      ...NAV_ITEMS.map((item) => item.icon),
      ...PLANNED_FEATURES.map((feature) => feature.icon),
      "chores",
    ]);

    for (const motto of MOTTOS) {
      expect(motto.id).toMatch(/^[a-z0-9-]+$/);
      expect(motto.text.length).toBeGreaterThan(0);
      expect(motto.meaning.length).toBeGreaterThan(0);
      expect(icons).toContain(motto.icon);
    }
  });

  it("keeps ids unique — they are React keys", () => {
    const ids = MOTTOS.map((motto) => motto.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is anchored to a Monday", () => {
    expect(localDate(MOTTO_START_DATE).getDay()).toBe(1);
    // The anchor snaps to its own Monday, so it survives a mid-week value.
    expect(getMottoStartDate("2026-08-05").getDay()).toBe(1);
  });

  it("throws in development on a malformed anchor", () => {
    expect(() => getMottoStartDate("not-a-date")).toThrow(/MOTTO_START_DATE/);
  });
});

describe("which motto is showing", () => {
  it("shows the first motto in the anchor week", () => {
    expect(getMottoOfWeek(localDate(MOTTO_START_DATE)).text).toBe(
      "Love Like Jesus.",
    );
  });

  it("does not change on any day of the same week", () => {
    // Monday 2026-08-03 through Sunday 2026-08-09.
    const week = [
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ];
    const ids = week.map((iso) => getMottoOfWeek(localDate(iso)).id);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe("love-like-jesus");
  });

  it("changes on Monday morning, not at any other boundary", () => {
    // Late Sunday and just-past-midnight Monday are different mottos.
    expect(getMottoOfWeek(localDate("2026-08-09", 23)).id).toBe(
      "love-like-jesus",
    );
    expect(getMottoOfWeek(localDate("2026-08-10", 0)).id).toBe(
      "think-celestial",
    );
  });

  it("alternates week by week and comes back round", () => {
    const mondays = [
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ];
    expect(mondays.map((iso) => getMottoOfWeek(localDate(iso)).text)).toEqual([
      "Love Like Jesus.",
      "Think Celestial.",
      "Love Like Jesus.",
      "Think Celestial.",
      "Love Like Jesus.",
    ]);
  });

  it("still shows a motto before the anchor, running the cycle backwards", () => {
    expect(getMottoWeekOffset(localDate("2026-07-27"), START)).toBe(-1);
    expect(getMottoWeekOffset(localDate("2026-07-20"), START)).toBe(-2);

    // The index is never out of range on either side of the anchor.
    for (const iso of ["2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10"]) {
      const index = getMottoIndex(localDate(iso));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(MOTTO_COUNT);
    }

    expect(getMottoOfWeek(localDate("2026-07-27")).id).toBe("think-celestial");
    expect(getMottoOfWeek(localDate("2026-07-20")).id).toBe("love-like-jesus");
  });

  it("survives a daylight-saving transition without skipping a week", () => {
    // US DST ends on 2026-11-01; these Mondays straddle it.
    expect(getMottoWeekOffset(localDate("2026-10-26"), START)).toBe(12);
    expect(getMottoWeekOffset(localDate("2026-11-02"), START)).toBe(13);
    expect(getMottoOfWeek(localDate("2026-10-26")).id).toBe("love-like-jesus");
    expect(getMottoOfWeek(localDate("2026-11-02")).id).toBe("think-celestial");
  });
});

describe("the banner's week", () => {
  it("reports Monday-to-Sunday and the motto that follows", () => {
    const week = getMottoWeek(localDate("2026-08-05"));

    expect(week.motto.id).toBe("love-like-jesus");
    expect(week.weekStart.getDay()).toBe(1);
    expect(week.weekEnd.getDay()).toBe(0);
    expect(week.nextChange.getDay()).toBe(1);
    expect(week.daysUntilChange).toBe(5);
    expect(week.nextMotto.id).toBe("think-celestial");
  });

  it("counts down to next Monday, never to zero", () => {
    for (const iso of [
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ]) {
      const week = getMottoWeek(localDate(iso));
      expect(week.daysUntilChange).toBeGreaterThan(0);
      expect(week.daysUntilChange).toBeLessThanOrEqual(7);
    }
  });

  it("says the right thing on each day", () => {
    expect(getMottoWeek(localDate("2026-08-03")).countdownLabel).toBe(
      "New motto today",
    );
    expect(getMottoWeek(localDate("2026-08-09")).countdownLabel).toBe(
      "New motto tomorrow",
    );
    expect(getMottoWeek(localDate("2026-08-05")).countdownLabel).toBe(
      "New motto in 5 days",
    );
  });

  it("never says '1 days'", () => {
    expect(getMottoCountdownLabel(localDate("2026-08-09"), 1)).toBe(
      "New motto tomorrow",
    );
  });
});
