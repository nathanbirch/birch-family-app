import { describe, expect, it } from "vitest";

import {
  DEAL_ANCHOR_WEEK,
  DEAL_STAR_VALUE,
  DEAL_TIERS,
  DEALS_CHART,
  STAR_DEALS,
  dealSuitsChild,
  getStarDeal,
  isStarDealId,
  type DealTier,
} from "@/config/deals";
import { CHILD_IDS } from "@/config/family";
import { CHARTS, STAR_DAY_COUNT, STAR_TASKS, isStarTaskId } from "@/config/stars";
import { parseLocalDate, startOfWeekMonday, toIsoDate } from "@/lib/dates";
import { tallyDeals, isDealTaken, isDayComplete } from "@/lib/stars/counting";
import {
  DEAL_WINDOW,
  dealDayNumber,
  dealWindow,
  dealsForDay,
  getDealForChild,
  getWeekDealsForChild,
  isDealForChild,
} from "@/lib/stars/deals";
import { getTasksForChild } from "@/lib/stars/tasks";
import { CHORE_POOLS } from "@/config/chore-rotation";

/**
 * Star Deals.
 *
 * Two of these describe promises made to the family rather than properties of
 * the code — nobody shares a deal on the same day, and nobody repeats one the
 * next day — and both are checked across a whole cycle of the list rather than
 * on a sample, because a rule that holds on Tuesday and fails in November is
 * not a rule.
 */

function localDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

const ANCHOR = localDate(DEAL_ANCHOR_WEEK);
/** Monday of the week the charts were photographed. */
const AUGUST = localDate("2026-08-10");

/** A whole cycle of the list and a bit, in chart-days. */
const CYCLE = STAR_DEALS.length;

describe("the deal list", () => {
  it("gives every deal a unique id, prefixed so it can never be a task", () => {
    const ids = STAR_DEALS.map((deal) => deal.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      // These become field names inside a `starWeeks` document — a dot would
      // be read as a path separator.
      expect(id).toMatch(/^deal-[a-z0-9-]+$/);
      // The prefix is what lets deals and chart rows share one `marks` object.
      expect(isStarTaskId(id)).toBe(false);
    }

    for (const task of STAR_TASKS) {
      expect(isStarDealId(task.id)).toBe(false);
    }
  });

  it("finds a deal by id, and admits when there is no such deal", () => {
    expect(getStarDeal("deal-playroom")?.tier).toBe("everyone");
    expect(getStarDeal("nope")).toBeUndefined();
    expect(isStarDealId("deal-playroom")).toBe(true);
    // The id check is what stands between a request and a MongoDB field name.
    expect(isStarDealId("marks.deal-playroom")).toBe(false);
    expect(isStarDealId("__proto__")).toBe(false);
  });

  it("gives every deal a label and a tier that means somebody", () => {
    for (const deal of STAR_DEALS) {
      expect(deal.label.trim().length).toBeGreaterThan(0);
      expect(DEAL_TIERS[deal.tier].length).toBeGreaterThan(0);
      for (const childId of DEAL_TIERS[deal.tier]) {
        expect(CHILD_IDS).toContain(childId);
      }
    }
  });

  it("keeps the tiers nested, youngest outwards", () => {
    // Not required by the matching, which backtracks — but the interleaved
    // ordering of `STAR_DEALS` was worked out assuming it, so a tier that cut
    // across the ages should fail here and be re-checked rather than quietly
    // change which windows are fillable.
    const big = new Set<string>(DEAL_TIERS["big-kids"]);
    const school = new Set<string>(DEAL_TIERS["school-age"]);
    for (const childId of big) expect(school.has(childId)).toBe(true);
    for (const childId of school) expect(DEAL_TIERS.everyone).toContain(childId);
    expect([...DEAL_TIERS.everyone].sort()).toEqual([...CHILD_IDS].sort());
  });

  it("keeps the list length coprime with the window, so every deal comes round", () => {
    // The window steps forward by `DEAL_WINDOW` a day. Share a factor with the
    // list length and the windows would land on the same handful of deals for
    // ever — most of this file would never be offered to anybody.
    expect(gcd(STAR_DEALS.length, DEAL_WINDOW)).toBe(1);
    expect(DEAL_WINDOW).toBe(CHILD_IDS.length);
  });

  it("is not one of the three printed charts, but is shaped like one", () => {
    // The ceremony puts it in the same column of results; `CHARTS` stays the
    // three sheets on the fridge, whose titles are transcriptions.
    expect(CHARTS.map((chart) => chart.id)).not.toContain("deals");
    expect(DEALS_CHART.id).toBe("deals");
    expect(DEALS_CHART.title.length).toBeGreaterThan(0);
  });

  it("is worth three ordinary stars", () => {
    expect(DEAL_STAR_VALUE).toBe(3);
  });
});

describe("the dealing order", () => {
  /*
   * The one invariant that everything else rests on. Every window of five
   * consecutive deals — all fifty-three of them, wrap-around included — has to
   * admit a complete five-way match against the five children. Break it and
   * somebody goes without a deal on a day the list was full of bathrooms.
   *
   * This is why `STAR_DEALS` is interleaved by tier rather than grouped by
   * subject, and why adding deals five at a time in the pattern keeps it true.
   */
  it("can fill every window of five, for all five children", () => {
    for (let dayNumber = 0; dayNumber < CYCLE; dayNumber += 1) {
      const window = dealWindow(dayNumber);
      expect(window).toHaveLength(DEAL_WINDOW);
      expect(new Set(window.map((deal) => deal.id)).size).toBe(DEAL_WINDOW);

      const deals = dealsForDay(dayNumber);
      for (const childId of CHILD_IDS) {
        const deal = deals[childId];
        expect(deal, `nobody for ${childId} on day ${dayNumber}`).not.toBeNull();
        expect(dealSuitsChild(deal!, childId)).toBe(true);
        expect(window.map((entry) => entry.id)).toContain(deal!.id);
      }
    }
  });

  it("holds the tier pattern the windows depend on", () => {
    // Ten blocks of everyone / school-age / big-kids / everyone / school-age,
    // then everyone / big-kids / everyone. Written out rather than derived, so
    // that changing the pattern is a deliberate edit to this line too.
    const pattern: DealTier[] = [];
    for (let block = 0; block < 10; block += 1) {
      pattern.push("everyone", "school-age", "big-kids", "everyone", "school-age");
    }
    pattern.push("everyone", "big-kids", "everyone");

    expect(STAR_DEALS.map((deal) => deal.tier)).toEqual(pattern);
    expect(STAR_DEALS).toHaveLength(pattern.length);
  });

  it("offers every deal in the list to somebody, over a cycle", () => {
    const offered = new Set<string>();
    for (let dayNumber = 0; dayNumber < CYCLE; dayNumber += 1) {
      for (const deal of Object.values(dealsForDay(dayNumber))) {
        if (deal) offered.add(deal.id);
      }
    }
    expect(offered.size).toBe(STAR_DEALS.length);
  });
});

describe("the two promises", () => {
  it("never gives two children the same deal on the same day", () => {
    for (let dayNumber = -CYCLE; dayNumber < CYCLE * 2; dayNumber += 1) {
      const ids = Object.values(dealsForDay(dayNumber))
        .filter((deal) => deal !== null)
        .map((deal) => deal!.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("never gives a child the same deal two days running", () => {
    for (let dayNumber = -CYCLE; dayNumber < CYCLE * 2; dayNumber += 1) {
      const today = dealsForDay(dayNumber);
      const tomorrow = dealsForDay(dayNumber + 1);
      for (const childId of CHILD_IDS) {
        expect(today[childId]!.id).not.toBe(tomorrow[childId]!.id);
      }
    }
  });

  it("keeps a whole school week free of repeats, which is stronger than asked", () => {
    // Consecutive windows are disjoint sets, so five chart-days is twenty-five
    // different deals and nobody sees one twice inside a week.
    for (let dayNumber = 0; dayNumber < CYCLE; dayNumber += 1) {
      for (const childId of CHILD_IDS) {
        const week = Array.from(
          { length: STAR_DAY_COUNT },
          (_, offset) => dealsForDay(dayNumber + offset)[childId]!.id,
        );
        expect(new Set(week).size).toBe(STAR_DAY_COUNT);
      }
    }
  });
});

describe("which day is which", () => {
  it("counts in chart days, so weekends never swallow a deal", () => {
    // Monday to Friday of the anchor week is 0-4, and the next Monday is 5 —
    // not 7. Count over the calendar and two sevenths of the list would never
    // be offered to anybody.
    expect(dealDayNumber(ANCHOR, 0)).toBe(0);
    expect(dealDayNumber(ANCHOR, 4)).toBe(4);
    expect(dealDayNumber(localDate("2026-08-17"), 0)).toBe(5);
    expect(dealDayNumber(localDate("2026-08-24"), 2)).toBe(12);
  });

  it("runs backwards, because a past week has a real answer", () => {
    // Unlike the chore rotation there is no laminated chart to disagree with:
    // a deal is derived from the calendar, so a ceremony for an old week shows
    // exactly what was on offer that week rather than inventing a history.
    expect(dealDayNumber(localDate("2026-08-03"), 0)).toBe(-5);
    const before = dealsForDay(-5);
    for (const childId of CHILD_IDS) expect(before[childId]).not.toBeNull();
  });

  it("gives the same answer to the page, the action and the ceremony", () => {
    for (const childId of CHILD_IDS) {
      const slots = getWeekDealsForChild(AUGUST, childId);
      expect(slots).toHaveLength(STAR_DAY_COUNT);

      for (const slot of slots) {
        expect(getDealForChild(AUGUST, slot.dayIndex, childId)!.id).toBe(
          slot.deal.id,
        );
        expect(isDealForChild(AUGUST, slot.dayIndex, childId, slot.deal.id)).toBe(
          true,
        );
      }
    }
  });

  it("refuses a deal that is not this child's, on this day", () => {
    const hannah = getDealForChild(AUGUST, 2, "hannah")!;
    const emily = getDealForChild(AUGUST, 2, "emily")!;

    // A sibling's deal…
    expect(isDealForChild(AUGUST, 2, "hannah", emily.id)).toBe(false);
    // …her own, but on the wrong day…
    expect(isDealForChild(AUGUST, 3, "hannah", hannah.id)).toBe(false);
    // …the pick of the whole list…
    expect(isDealForChild(AUGUST, 2, "hannah", "deal-make-a-bed")).toBe(
      hannah.id === "deal-make-a-bed",
    );
    // …and something that is not a deal at all.
    expect(isDealForChild(AUGUST, 2, "hannah", "tidy-room")).toBe(false);
  });

  it("has no deal outside the Monday-to-Friday week", () => {
    expect(getDealForChild(AUGUST, -1, "hannah")).toBeNull();
    expect(getDealForChild(AUGUST, STAR_DAY_COUNT, "hannah")).toBeNull();
  });

  it("asks about the week's own Monday, whatever day it is handed", () => {
    const wednesday = localDate("2026-08-12");
    expect(toIsoDate(startOfWeekMonday(wednesday))).toBe("2026-08-10");
    expect(dealDayNumber(wednesday, 0)).toBe(dealDayNumber(AUGUST, 0));
  });

  it("keeps the anchor a real Monday", () => {
    const anchor = parseLocalDate(DEAL_ANCHOR_WEEK);
    expect(anchor).not.toBeNull();
    expect(toIsoDate(startOfWeekMonday(anchor!))).toBe(DEAL_ANCHOR_WEEK);
  });
});

describe("what a deal is worth", () => {
  const slots = getWeekDealsForChild(AUGUST, "clara");

  it("counts nothing when nothing was taken", () => {
    expect(tallyDeals({}, slots)).toEqual({
      earned: 0,
      possible: STAR_DAY_COUNT * DEAL_STAR_VALUE,
      taken: 0,
      offered: STAR_DAY_COUNT,
    });
  });

  it("counts three stars a deal", () => {
    const marks = {
      [slots[0].deal.id]: [true, false, false, false, false],
      [slots[3].deal.id]: [false, false, false, true, false],
    };
    const result = tallyDeals(marks, slots);
    expect(result.taken).toBe(2);
    expect(result.earned).toBe(6);
  });

  it("reads only the day the deal was offered on", () => {
    // Monday's deal ticked on Friday is not a star. A deal is one day wide,
    // and the other four columns of its row mean nothing.
    const marks = { [slots[0].deal.id]: [false, false, false, false, true] };
    expect(tallyDeals(marks, slots).taken).toBe(0);
    expect(isDealTaken(marks, slots[0])).toBe(false);
    expect(isDealTaken(marks, null)).toBe(false);
  });
});

describe("finishing a whole day", () => {
  const MONDAY_INDEX = 0;
  const tasks = getTasksForChild(CHORE_POOLS, AUGUST, "hannah");
  const deal = getDealForChild(AUGUST, MONDAY_INDEX, "hannah")!;

  function everyTask(): Record<string, boolean[]> {
    const marks: Record<string, boolean[]> = {};
    for (const task of tasks) marks[task.id] = [true, false, false, false, false];
    return marks;
  }

  it("is not finished while the deal is still on the table", () => {
    // The deal is the biggest star of the day, so "finished everything for
    // Monday" cannot be true with it untouched.
    expect(
      isDayComplete(everyTask(), tasks, { dayIndex: MONDAY_INDEX, deal }, MONDAY_INDEX),
    ).toBe(false);
  });

  it("is finished once the charts and the deal are both done", () => {
    const marks = everyTask();
    marks[deal.id] = [true, false, false, false, false];
    expect(
      isDayComplete(marks, tasks, { dayIndex: MONDAY_INDEX, deal }, MONDAY_INDEX),
    ).toBe(true);
  });

  it("falls back to the charts on a day with no deal", () => {
    expect(isDayComplete(everyTask(), tasks, null, MONDAY_INDEX)).toBe(true);
  });
});

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
