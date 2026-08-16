import { describe, expect, it } from "vitest";

import { SATURDAY_FROM_WEEK, starDayCount } from "@/config/stars";
import { parseLocalDate } from "@/lib/dates";
import { getWeekStartIso, openDayIndex, parseWeekStart } from "@/lib/stars/week";

/*
 * Which day of a chart may be coloured in, which is the one rule the whole
 * star system rests on. It is checked in two places that must never disagree —
 * the buttons on the page, and the Server Action on the way in — so it is one
 * function, and this is where it is pinned down.
 */

const day = (iso: string) => parseLocalDate(iso)!;

/** The week Saturday first counted, and the one before it. */
const SIX_DAY = SATURDAY_FROM_WEEK; // Monday 2026-08-17
const FIVE_DAY = "2026-08-10";

describe("which week a date belongs to", () => {
  it("runs Monday to Sunday, so Sunday belongs to the week it closes", () => {
    expect(getWeekStartIso(day("2026-08-17"))).toBe("2026-08-17");
    expect(getWeekStartIso(day("2026-08-22"))).toBe("2026-08-17");
    // The Sunday. It is the seventh day of *this* week, not the first of next
    // — which is what makes it the day that week's ceremony is held.
    expect(getWeekStartIso(day("2026-08-23"))).toBe("2026-08-17");
    expect(getWeekStartIso(day("2026-08-24"))).toBe("2026-08-24");
  });

  it("accepts only a Monday as a week key", () => {
    expect(parseWeekStart("2026-08-17")).not.toBeNull();
    // Anything else would create a second, offset set of documents for the
    // same seven days.
    expect(parseWeekStart("2026-08-18")).toBeNull();
    expect(parseWeekStart("2026-08-23")).toBeNull();
    expect(parseWeekStart("not-a-date")).toBeNull();
  });
});

describe("which column may be coloured in", () => {
  it("opens each day of a six-day week in turn", () => {
    const monday = day(SIX_DAY);
    const expected = [
      ["2026-08-17", 0],
      ["2026-08-18", 1],
      ["2026-08-19", 2],
      ["2026-08-20", 3],
      ["2026-08-21", 4],
      ["2026-08-22", 5],
    ] as const;

    for (const [date, column] of expected) {
      expect(openDayIndex(monday, day(date))).toBe(column);
    }
  });

  it("opens Saturday, which is the whole point of a six-day week", () => {
    expect(openDayIndex(day(SIX_DAY), day("2026-08-22"))).toBe(5);
  });

  it("opens nothing at all on a Sunday", () => {
    /*
     * Sunday is the ceremony. A chart that could still be filled in during the
     * awards night is a chart the awards night cannot be trusted to have
     * counted — so the whole board goes read-only, for the week that is ending
     * and for the week about to start alike.
     */
    expect(openDayIndex(day(SIX_DAY), day("2026-08-23"))).toBe(-1);
    expect(openDayIndex(day("2026-08-24"), day("2026-08-23"))).toBe(-1);
  });

  it("leaves Saturday shut in a week that predates it", () => {
    // The Saturday of the old five-day week. Nobody was offered it at the
    // time, and going back to tick it now would invent a star.
    expect(openDayIndex(day(FIVE_DAY), day("2026-08-14"))).toBe(4);
    expect(openDayIndex(day(FIVE_DAY), day("2026-08-15"))).toBe(-1);
    expect(openDayIndex(day(FIVE_DAY), day("2026-08-16"))).toBe(-1);
  });

  it("shuts every column of a week that is not the current one", () => {
    // Ahead: Friday coloured in on Monday because the row looks better full.
    expect(openDayIndex(day("2026-08-24"), day(SIX_DAY))).toBe(-1);
    // Behind: Sunday-night catching up, a week reconstructed from memory.
    expect(openDayIndex(day(SIX_DAY), day("2026-08-26"))).toBe(-1);
  });

  it("agrees with the width the rest of the app uses", () => {
    // The two answers come from different places — one counts days from the
    // Monday, the other reads the anchor — and a week where they disagreed
    // would draw a column nobody could tap, or refuse one that was drawn.
    for (const week of [FIVE_DAY, SIX_DAY, "2026-07-20", "2026-09-07"]) {
      const monday = day(week);
      const columns = starDayCount(week);

      for (let offset = 0; offset < 7; offset += 1) {
        const date = new Date(monday);
        date.setDate(date.getDate() + offset);
        expect(openDayIndex(monday, date)).toBe(offset < columns ? offset : -1);
      }
    }
  });

  it("never opens a seventh column, however far the anchor moves", () => {
    // Sunday has no column and never will: `STAR_DAY_NAMES` has six entries
    // and this is the guard that stops a widened week reaching past them.
    for (const week of [FIVE_DAY, SIX_DAY, "2030-01-07"]) {
      const monday = day(week);
      expect(starDayCount(week)).toBeLessThanOrEqual(6);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      expect(sunday.getDay()).toBe(0);
      expect(openDayIndex(monday, sunday)).toBe(-1);
    }
  });
});
