/**
 * Whose Star Deal is whose, on any given day.
 *
 * Pure, and deliberately free of `server-only`: the card in the browser, the
 * Server Action that accepts the tick, and the ceremony that reads the week
 * back months later all have to agree about what was on offer on a Wednesday,
 * so there is one function and not three.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS STORED, AND NOTHING NEEDS TO BE
 * ---------------------------------------------------------------------------
 * There is no `starDeals` collection. A day's five deals are derived from the
 * calendar exactly as the mantra of the day and the seating rotation are, which
 * means every phone in the house lands on the same answer without syncing,
 * the page works offline, and a ceremony for a week in March recomputes March's
 * deals rather than trusting a record of them.
 *
 * ---------------------------------------------------------------------------
 * THE TWO PROMISES, AND WHY THEY CANNOT BE BROKEN
 * ---------------------------------------------------------------------------
 * The family asked for two rules, and both are structural here rather than
 * checked afterwards:
 *
 *   **No two children get the same deal on the same day.** Each day takes a
 *   *window* of five consecutive deals out of `STAR_DEALS` and matches them
 *   one-to-one onto the five children. Five deals, five children, a matching:
 *   a collision is not something the code avoids, it is something it cannot
 *   express.
 *
 *   **Nobody gets the same deal two days running.** The window steps forward
 *   by exactly five each chart-day, so today's window and tomorrow's are
 *   *disjoint sets* — no overlap to repeat out of. In fact it is much stronger
 *   than the promise: consecutive windows do not touch again until they wrap
 *   round the list, so with fifty-three deals no child sees the same one twice
 *   inside eleven school days, and every child works through all fifty-three
 *   before any of them comes back.
 *
 * Neither promise needs yesterday's answer to be looked up, which is the point.
 * A rule enforced by remembering what happened yesterday needs somewhere to
 * remember it, and then needs an answer for the day the memory is missing.
 *
 * ---------------------------------------------------------------------------
 * THE CHART-DAY NUMBER
 * ---------------------------------------------------------------------------
 * Days are counted in *chart* days, not calendar days: five to a week, Monday
 * to Friday, because that is the only kind of day a star can be earned on. If
 * the count ran over the calendar, every weekend would silently skip two deals
 * and two sevenths of this list would never be offered to anybody.
 */

import {
  DEAL_ANCHOR_WEEK,
  STAR_DEALS,
  dealSuitsChild,
  type StarDeal,
} from "@/config/deals";
import { CHILD_IDS, type ChildId } from "@/config/family";
import { STAR_DAY_COUNT } from "@/config/stars";
import { differenceInCalendarWeeks, parseLocalDate } from "@/lib/dates";

/** One child's deal for one day of the week. */
export type DealSlot = {
  /** 0 = Monday. */
  dayIndex: number;
  deal: StarDeal;
};

/**
 * How many deals are dealt at once: one per child, which is the window width.
 *
 * This is the number the window steps forward by each day, and it is what has
 * to stay coprime with `STAR_DEALS.length`. See `config/deals.ts`.
 */
export const DEAL_WINDOW = CHILD_IDS.length;

/**
 * Which chart-day `dayIndex` of the week beginning `monday` is, counting from
 * the anchor. Negative before it, which is fine and correct — see
 * `DEAL_ANCHOR_WEEK`.
 */
export function dealDayNumber(monday: Date, dayIndex: number): number {
  const anchor = parseLocalDate(DEAL_ANCHOR_WEEK);
  if (!anchor) {
    throw new Error(
      `DEAL_ANCHOR_WEEK is "${DEAL_ANCHOR_WEEK}", which is not a YYYY-MM-DD ` +
        `date. Check config/deals.ts.`,
    );
  }
  return differenceInCalendarWeeks(anchor, monday) * STAR_DAY_COUNT + dayIndex;
}

/**
 * The five deals on offer on chart-day `dayNumber`, in list order.
 *
 * `%` in JavaScript keeps the sign of the left operand, so the extra `+ n` is
 * what makes a day before the anchor land on a real index instead of a
 * negative one.
 */
export function dealWindow(dayNumber: number): StarDeal[] {
  const n = STAR_DEALS.length;
  const start = (((dayNumber * DEAL_WINDOW) % n) + n) % n;
  return Array.from(
    { length: DEAL_WINDOW },
    (_, offset) => STAR_DEALS[(start + offset) % n],
  );
}

/**
 * Who gets which of the day's five deals.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A MATCHING AND NOT A SHUFFLE
 * ---------------------------------------------------------------------------
 * If every deal suited every child, this would be one line — deal them out in
 * order. They do not: the bathrooms and the oven belong to the big three, and
 * the youngest in this house is four. So the day's window has to be *matched*
 * against the five children rather than dealt, and a matching can fail where a
 * deal cannot.
 *
 * It never fails here, and that is guaranteed by the *ordering* of
 * `STAR_DEALS` rather than by anything in this function: the tiers are
 * interleaved so that every window of five contains at least two deals anybody
 * can do. `tests/stars-deals.test.ts` checks all fifty-three windows against
 * all five children, which is the whole space.
 *
 * Should a bad edit break that anyway, the child who cannot be matched gets
 * `null` — no deal today — rather than the page throwing in front of them.
 *
 * **Most-constrained child first.** James can be offered two of the five, and
 * Hannah any of them, so James choosing first is what stops Hannah taking the
 * one deal he could have had. Among children with equally wide choice the
 * order rotates with the day, so the eldest three are not permanently ranked
 * against each other by the order of the roster.
 */
export function dealsForDay(dayNumber: number): Record<ChildId, StarDeal | null> {
  const window = dealWindow(dayNumber);

  const eligibility = new Map<ChildId, StarDeal[]>(
    CHILD_IDS.map((childId) => [
      childId,
      window.filter((deal) => dealSuitsChild(deal, childId)),
    ]),
  );

  /*
   * Youngest first, because youngest is most constrained — and rotated by the
   * day among children whose choice is equally wide, so that "Clara picks
   * before Emily" is not a permanent fact about the app.
   */
  const youngestFirst = [...CHILD_IDS].reverse();
  const order = youngestFirst
    .map((childId, position) => ({
      childId,
      choices: eligibility.get(childId)!.length,
      rotated: (position + dayNumber) % youngestFirst.length,
    }))
    .sort((a, b) => a.choices - b.choices || a.rotated - b.rotated)
    .map((entry) => entry.childId);

  const assigned: Record<string, StarDeal | null> = {};
  for (const childId of CHILD_IDS) assigned[childId] = null;

  const taken = new Set<string>();

  /*
   * Backtracking rather than a single greedy pass. Greedy is in fact enough
   * for the tiers as they stand — they are nested, so a child's choices are
   * always a superset of every younger child's — but that is a property of
   * today's `DEAL_TIERS`, not of the code, and a future tier that cuts across
   * the ages would quietly start leaving somebody out. Five children is at
   * most 120 arrangements; it costs nothing to be right whatever the tiers say.
   */
  function assign(index: number): boolean {
    if (index >= order.length) return true;
    const childId = order[index];

    for (const deal of eligibility.get(childId)!) {
      if (taken.has(deal.id)) continue;
      taken.add(deal.id);
      assigned[childId] = deal;
      if (assign(index + 1)) return true;
      taken.delete(deal.id);
      assigned[childId] = null;
    }

    // Every arrangement from here on leaves this child out. Say so, so the
    // caller above tries a different deal for *itself* rather than accepting
    // the first arrangement it stumbles into.
    return false;
  }

  if (assign(0)) return assigned as Record<ChildId, StarDeal | null>;

  /*
   * Unreachable with the shipped list — see the note above — and reached only
   * by an edit that breaks the interleaving. Fill greedily and leave whoever
   * cannot be placed without a deal: four children with one is a better
   * Tuesday than a page that throws in front of the fifth.
   */
  taken.clear();
  for (const childId of order) {
    const deal = eligibility
      .get(childId)!
      .find((candidate) => !taken.has(candidate.id));
    assigned[childId] = deal ?? null;
    if (deal) taken.add(deal.id);
  }

  return assigned as Record<ChildId, StarDeal | null>;
}

/** One child's deal on one day of one week, or `null` if they have none. */
export function getDealForChild(
  monday: Date,
  dayIndex: number,
  childId: ChildId,
): StarDeal | null {
  if (dayIndex < 0 || dayIndex >= STAR_DAY_COUNT) return null;
  return dealsForDay(dealDayNumber(monday, dayIndex))[childId];
}

/**
 * One child's five deals for the week beginning `monday`, Monday first.
 *
 * A day the matching could not fill is simply absent, so this is normally five
 * long and never longer. The ceremony counts what is here; the chart on the
 * page shows only the days that have already happened, because a deal a child
 * can read on Monday is not a deal that pops up on Thursday.
 */
export function getWeekDealsForChild(
  monday: Date,
  childId: ChildId,
): DealSlot[] {
  const slots: DealSlot[] = [];
  for (let dayIndex = 0; dayIndex < STAR_DAY_COUNT; dayIndex += 1) {
    const deal = getDealForChild(monday, dayIndex, childId);
    if (deal) slots.push({ dayIndex, deal });
  }
  return slots;
}

/**
 * Whether `dealId` is the deal this child was offered on this day.
 *
 * The check the Server Action needs, and the reason a deal id is safe to
 * accept from a POST at all: a child cannot file yesterday's deal against
 * today, take a sibling's, or pick the easiest one off the list.
 */
export function isDealForChild(
  monday: Date,
  dayIndex: number,
  childId: ChildId,
  dealId: string,
): boolean {
  return getDealForChild(monday, dayIndex, childId)?.id === dealId;
}
