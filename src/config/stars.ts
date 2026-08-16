/**
 * The three star charts off the fridge: Learning, Chores and Hygiene.
 *
 * ---------------------------------------------------------------------------
 * THESE ARE TRANSCRIPTIONS, NOT COPY
 * ---------------------------------------------------------------------------
 * Every `label` below was typed off a photograph of the laminated chart on the
 * fridge, word for word. Same rule as `config/health.ts`: **do not reword a
 * task to make it read better.** Change the chart first, then change this file
 * so the fridge and the phone never disagree. `tests/stars-config.test.ts`
 * locks the wording and the per-child task counts in place.
 *
 * (Chore titles are the one exception, and only once the edit feature lands:
 * a parent may rename a chore from inside the app, which is stored in the
 * database as an override on top of the label below. The compiled label stays
 * as the printed original.)
 *
 * ---------------------------------------------------------------------------
 * WHO DOES WHAT: THREE KINDS OF ASSIGNMENT
 * ---------------------------------------------------------------------------
 * Reading the three charts across, the rows fall into exactly three groups,
 * and this is the whole reason the model has an `assign` field rather than a
 * list of tasks per child:
 *
 *   `everyone`  — the same row on every child's column, forever. All four
 *                 hygiene rows, plus "Tidy room" and the laundry.
 *   `fixed`     — belongs to particular children because of their age or what
 *                 they are learning. Cello is Hannah's; "Write alphabet" is
 *                 James's, and so is feeding Bella. These change when a child
 *                 grows, which is a deploy, not a rotation.
 *   `rotating`  — the real chores, which swap between the children of a pair
 *                 every Monday morning. Which child has which is NOT stored
 *                 here — see `config/chore-rotation.ts` for the pools and the
 *                 anchor, and `lib/stars/rotation.ts` for the maths.
 *
 * A task with `kind: "rotating"` must appear in exactly one pool. The test
 * suite fails if one is left out, so a new chore cannot silently belong to
 * nobody.
 */

import type { ChildId } from "./family";

/**
 * The three printed charts, plus `deals`.
 *
 * `deals` is in the union but deliberately *not* in `CHARTS` below, and no
 * `StarTask` may carry it. It is the daily Star Deal — see `config/deals.ts`,
 * which owns its wording and exports `DEALS_CHART`. It lives in this union so
 * that a ceremony slide, a confetti burst and a card heading can all be
 * addressed by chart id without a second, parallel type for the one section
 * that did not come off the fridge.
 */
export type ChartId = "learning" | "chores" | "hygiene" | "deals";

export type Chart = {
  id: ChartId;
  /** The heading printed across the top of the chart. */
  title: string;
  /** The line printed under the heading. */
  tagline: string;
  /** Ours: one short line for the section header on the page. */
  blurb: string;
};

/** Order here is the order the sections appear on the page. */
export const CHARTS: readonly Chart[] = [
  {
    id: "chores",
    title: "Our Family Chore Chart",
    tagline: "Crush your chores • Earn your stars • Rule the week",
    blurb: "Jobs that keep the house running.",
  },
  {
    id: "learning",
    title: "Summer Learning Chart",
    tagline: "Learn every day • Earn your stars • Grow your brain",
    blurb: "Reading, maths and music practice.",
  },
  {
    id: "hygiene",
    title: "Our Family Hygiene Chart",
    tagline: "Stay fresh • Stay clean • Earn your stars",
    blurb: "Hands, teeth, every single day.",
  },
] as const;

/**
 * How a task finds its way onto a child's chart.
 *
 * `rotating` carries no children at all — that is the point. It is a promise
 * that somebody in a pool owns this chore this week, and the pool decides
 * who.
 */
export type StarAssignment =
  | { kind: "everyone" }
  | { kind: "fixed"; children: readonly ChildId[] }
  | { kind: "rotating" };

export type StarTask = {
  /**
   * Stable key. **Never change one of these** — every star anybody has ever
   * earned is filed against it in the `starWeeks` collection, and renaming an
   * id silently orphans a child's history. Change the `label` instead.
   *
   * Kebab-case, and no dots: these become field names inside a MongoDB
   * document, where a dot would be read as a path separator.
   */
  id: string;
  chart: ChartId;
  /** Verbatim off the chart. */
  label: string;
  assign: StarAssignment;
};

/**
 * Every star that can be earned, in chart order.
 *
 * Within a chart the order here is the order the rows appear on a child's
 * page, so it is worth keeping it close to the printed chart's top-to-bottom
 * order — with the caveat that the rotating chores are ordered for *dealing*
 * rather than for reading; see `config/chore-rotation.ts`.
 */
export const STAR_TASKS: readonly StarTask[] = [
  /* --- Chores ------------------------------------------------------- */

  {
    id: "tidy-room",
    chart: "chores",
    label: "Tidy room",
    assign: { kind: "everyone" },
  },
  {
    id: "pick-up-toys",
    chart: "chores",
    label: "Pick up toys",
    // The two youngest have this row and the three eldest do not. It is not in
    // the rotation because it is not a job that moves — it is their own toys.
    assign: { kind: "fixed", children: ["william", "james"] },
  },
  {
    id: "feed-bella",
    chart: "chores",
    label: "Feed Bella",
    /*
     * James's, and staying his. He used to swap it with William month by
     * month; William now swaps with Clara instead, which leaves James with no
     * one to trade with — and feeding the dog is the job he knows. A `fixed`
     * row is exactly that promise: it moves when we decide it moves, not when
     * the calendar does.
     */
    assign: { kind: "fixed", children: ["james"] },
  },
  {
    id: "vacuum-wooden-floor",
    chart: "chores",
    label: "Pick up & vacuum wooden floor",
    assign: { kind: "rotating" },
  },
  {
    id: "pick-up-living-room",
    chart: "chores",
    label: "Pick up living room floor",
    assign: { kind: "rotating" },
  },
  {
    id: "dishwasher",
    chart: "chores",
    label: "Unload & load dishwasher",
    assign: { kind: "rotating" },
  },
  {
    id: "kitchen-island",
    chart: "chores",
    label: "Clear & clean kitchen island & table",
    assign: { kind: "rotating" },
  },
  {
    id: "vacuum-living-room",
    chart: "chores",
    label: "Vacuum living room floor",
    assign: { kind: "rotating" },
  },
  {
    id: "yard-pickup",
    chart: "chores",
    label: "Pick up 5 things in the yard",
    assign: { kind: "rotating" },
  },
  {
    id: "bath-trash",
    chart: "chores",
    label: "Take out upstairs bath trash",
    assign: { kind: "rotating" },
  },
  {
    id: "laundry-upstairs",
    chart: "chores",
    /*
     * The one row whose wording is *ahead* of the fridge rather than copied
     * off it. The printed chart says "Take laundry upstairs & put away", which
     * only describes the end of the job; the star is now earned by either half
     * of it. Write it onto the laminate in pen and the two agree again.
     */
    label: "Put away laundry, or do a load of laundry",
    assign: { kind: "everyone" },
  },

  /* --- Learning ----------------------------------------------------- */

  {
    id: "write-name",
    chart: "learning",
    label: "Write name",
    assign: { kind: "fixed", children: ["james"] },
  },
  {
    id: "write-numbers",
    chart: "learning",
    label: "Write numbers",
    assign: { kind: "fixed", children: ["james"] },
  },
  {
    id: "write-alphabet",
    chart: "learning",
    label: "Write alphabet",
    assign: { kind: "fixed", children: ["james"] },
  },
  {
    id: "reading-com-lesson",
    chart: "learning",
    label: "1 Reading.com lesson",
    assign: { kind: "fixed", children: ["james"] },
  },
  {
    id: "ixl-math",
    chart: "learning",
    label: "IXL Math & fluency practice",
    assign: { kind: "fixed", children: ["william", "clara", "emily", "hannah"] },
  },
  {
    id: "ixl-language-arts",
    chart: "learning",
    label: "IXL Language Arts",
    assign: { kind: "fixed", children: ["william", "clara", "emily", "hannah"] },
  },
  {
    id: "reading-com",
    chart: "learning",
    label: "Reading.com",
    assign: { kind: "fixed", children: ["william"] },
  },
  /*
   * The three reading rows are three separate tasks rather than one task with
   * a per-child number, because the number is the point: twenty minutes is a
   * whole star for Clara and two thirds of one for Hannah. Filing them
   * separately also means a child moving up from 20 to 30 minutes starts a
   * fresh row rather than rewriting what "reading" meant last spring.
   */
  {
    id: "reading-20",
    chart: "learning",
    label: "20 min reading",
    assign: { kind: "fixed", children: ["clara"] },
  },
  {
    id: "reading-30",
    chart: "learning",
    label: "30 min reading",
    assign: { kind: "fixed", children: ["emily"] },
  },
  {
    id: "reading-40",
    chart: "learning",
    label: "40 min reading",
    assign: { kind: "fixed", children: ["hannah"] },
  },
  {
    id: "piano",
    chart: "learning",
    label: "Piano practice",
    assign: { kind: "fixed", children: ["william", "clara", "emily", "hannah"] },
  },
  /*
   * Cello practice used to sit here, as Hannah's alone. It is gone because it
   * is gone off the fridge: the row is scored out in red pen on the chart, and
   * this file follows the chart.
   *
   * Deleted rather than kept and hidden, and the id `cello` is now retired for
   * good — never reuse it for something else. Any star already filed against
   * it stays in the database and is simply dropped on the way out by
   * `normaliseMarks()`, which is the same forgiveness that lets a row be added
   * without a migration. If the cello comes back, it comes back as a new row.
   */

  /* --- Hygiene ------------------------------------------------------ */

  {
    id: "wash-hands-bathroom",
    chart: "hygiene",
    label: "Wash hands after bathroom",
    assign: { kind: "everyone" },
  },
  {
    id: "wash-hands-dinner",
    chart: "hygiene",
    label: "Wash hands before dinner",
    assign: { kind: "everyone" },
  },
  {
    id: "brush-morning",
    chart: "hygiene",
    label: "Brush teeth in the morning",
    assign: { kind: "everyone" },
  },
  {
    id: "brush-floss-bed",
    chart: "hygiene",
    label: "Brush & floss before bed",
    assign: { kind: "everyone" },
  },
] as const;

/**
 * The widest a chart week ever is: Monday to Saturday.
 *
 * This is the *storage* width and the validation ceiling, not the number of
 * columns any particular week has — see `starDayCount`. Rows are always kept
 * this wide so that one shape comes out of the database whatever week it came
 * from, and a week that is narrower than this simply never looks at the last
 * column.
 *
 * Sunday has no column and never will. It is the day the ceremony happens, and
 * a chart you could still be filling in during your own awards night is a
 * chart the awards night cannot be trusted to have counted.
 */
export const STAR_MAX_DAY_COUNT = 6;

/**
 * The Monday from which Saturday counts.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A DATE AND NOT SIMPLY A SIX
 * ---------------------------------------------------------------------------
 * The charts ran Monday to Friday until this. Saturday was added because the
 * family wanted it, and the obvious change — make the constant a 6 and be done
 * — would have quietly rewritten every week already earned.
 *
 * Not the stars themselves: those are stored per day and none of them moves.
 * What moves is everything measured *against* the width of a week. A child who
 * filled a row all the way across in July would stop having filled it, because
 * five is no longer all the way; every past week's "possible" would grow by a
 * fifth, so every past percentage would fall; and `praiseFor` would downgrade
 * a perfect week to "What a week!" for a Saturday nobody was ever offered.
 *
 * The first ceremony to run under this change covers a week that ran Monday to
 * Friday, so that is not a hypothetical — it is what the family would have
 * watched.
 *
 * So the width is a property of the *week*, anchored here, exactly as the
 * rotation start date and the chore anchor are. Weeks before this Monday are
 * five days wide for ever; weeks from it are six.
 */
export const SATURDAY_FROM_WEEK = "2026-08-17";

/**
 * How many columns the week beginning `weekStartIso` has.
 *
 * A plain string comparison, which is exact rather than lax: ISO dates sort as
 * strings precisely as they sort as calendar days, so this needs no parsing
 * and cannot pick up a timezone on the way.
 */
export function starDayCount(weekStartIso: string): number {
  return weekStartIso >= SATURDAY_FROM_WEEK ? STAR_MAX_DAY_COUNT : 5;
}

/**
 * Column headings, exactly as printed. Index 0 is Monday.
 *
 * The full six. A narrower week takes `.slice(0, starDayCount(week))` rather
 * than having a list of its own, so there is one place a day is named.
 */
export const STAR_DAY_LABELS = ["M", "T", "W", "T", "F", "S"] as const;

/** Full day names, for screen readers and the report. */
export const STAR_DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const TASKS_BY_ID = new Map(STAR_TASKS.map((task) => [task.id, task]));

export function getStarTask(id: string): StarTask | undefined {
  return TASKS_BY_ID.get(id);
}

/** `true` when `id` names a task that actually exists. */
export function isStarTaskId(id: string): boolean {
  return TASKS_BY_ID.has(id);
}

export function getChart(id: ChartId): Chart {
  const chart = CHARTS.find((entry) => entry.id === id);
  if (!chart) {
    throw new Error(`Unknown chart id: "${id}". Check config/stars.ts.`);
  }
  return chart;
}

/** Every task on one chart, in configured order. */
export function getChartTasks(chart: ChartId): readonly StarTask[] {
  return STAR_TASKS.filter((task) => task.chart === chart);
}

/** The chores that move between children each Monday, in dealing order. */
export function getRotatingTasks(): readonly StarTask[] {
  return STAR_TASKS.filter((task) => task.assign.kind === "rotating");
}
