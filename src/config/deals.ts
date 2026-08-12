/**
 * Star Deals — one super star a day, worth three.
 *
 * ---------------------------------------------------------------------------
 * WHAT A DEAL IS
 * ---------------------------------------------------------------------------
 * The three charts on the fridge are the same rows every week: tidy your room,
 * brush your teeth, twenty minutes of reading. They are the floor, and they are
 * meant to be. A deal is the opposite — one job a day, different for every
 * child, that nobody was expecting when they woke up, and that is worth
 * `DEAL_STAR_VALUE` ordinary stars when it is done.
 *
 * Everything below is the app's *own* writing. That makes this file the one
 * piece of star content that is not a transcription: `config/stars.ts` and
 * `config/health.ts` both follow paper that already exists, and nothing on the
 * wall says any of this. Reword a deal freely — but see the dealing order
 * below before you *move* one.
 *
 * ---------------------------------------------------------------------------
 * TIERS, NOT AGES
 * ---------------------------------------------------------------------------
 * The youngest child in this house is four, and "clean the kids' bathroom" is
 * not a thing to hand a four-year-old on a Tuesday. So every deal names the
 * children it suits, through one of three tiers.
 *
 * They are **lists of children, not computed ages**, and deliberately so —
 * exactly like a `fixed` star task. A birthday should not silently move a job
 * onto a child in the middle of a week; somebody decides that William is old
 * enough for the bathrooms now, and that is a deploy. One table to edit, at the
 * top of this file.
 *
 * ---------------------------------------------------------------------------
 * `STAR_DEALS` IS A DEALING ORDER
 * ---------------------------------------------------------------------------
 * Same warning as `chores` in `config/chore-rotation.ts`, for the same reason.
 * Each day takes a **window of five consecutive deals** out of this list and
 * matches them to the five children, so what sits next to a deal decides who
 * can be offered it that day. The list is therefore *interleaved by tier* in a
 * strict repeating pattern:
 *
 *     everyone · school-age · big-kids · everyone · school-age    (× 10)
 *     everyone · big-kids   · everyone                            (the last 3)
 *
 * which guarantees that every window of five — including the three that wrap
 * round the end of the list — contains at least two `everyone` deals and at
 * least three that William can do. That is precisely what makes a complete
 * five-way match *always* possible, so no child can ever be left without a deal
 * because the day's window was full of bathrooms.
 *
 * **Adding, removing or reordering a deal can break that**, which is why
 * `tests/stars-deals.test.ts` checks all fifty-three windows rather than
 * trusting the pattern to survive an edit. Add deals five at a time, in the
 * pattern, and the test stays green.
 *
 * ---------------------------------------------------------------------------
 * WHY FIFTY-THREE
 * ---------------------------------------------------------------------------
 * Not for its own sake: the window steps forward by five chart-days at a time,
 * so the list length must be **coprime with five** or the windows would land on
 * the same handful of deals for ever and most of this list would never be
 * offered to anybody. Fifty-three is prime, so the windows walk the whole list
 * and every deal comes round. Adding a fifty-fourth is fine; a fifty-fifth is
 * not, and the test says so.
 */

import { CHILD_IDS, type ChildId } from "./family";
import type { Chart } from "./stars";

/**
 * What a deal is worth, in ordinary stars.
 *
 * Three, because it has to be worth interrupting the day for. The charts pay
 * one star for one job; a deal is a bigger job, it is only on offer once, and
 * at three stars — fifteen cents — it is the largest single thing a child can
 * earn in a day. It is the only number in the app that turns one tick into more
 * than one star, and `lib/stars/counting.ts` is the only place that applies it.
 */
export const DEAL_STAR_VALUE = 3;

/**
 * Who a deal suits.
 *
 * Three tiers rather than a list per deal, so a birthday is one edit here
 * rather than fifty-three. The tiers are **nested** — every `big-kids` child is
 * also a `school-age` child, and every child is in `everyone` — and the
 * matching in `lib/stars/deals.ts` does not depend on that, but the interleaved
 * ordering of `STAR_DEALS` was worked out assuming it. Breaking the nesting
 * means re-checking the windows.
 */
export type DealTier = "everyone" | "school-age" | "big-kids";

/**
 * The children each tier means, today.
 *
 * `CHILD_IDS` is oldest first: Hannah, Emily, Clara, William, James.
 */
export const DEAL_TIERS: Record<DealTier, readonly ChildId[]> = {
  /** All five. */
  everyone: CHILD_IDS,
  /** Everybody but James, who is four. */
  "school-age": ["hannah", "emily", "clara", "william"],
  /** The three eldest — bathrooms, ovens, and being trusted alone with them. */
  "big-kids": ["hannah", "emily", "clara"],
};

export type StarDeal = {
  /**
   * Stable key, and — like a star task's id — **permanent**. A deal a child has
   * done is filed against this string in the `starWeeks` collection, so
   * renaming one orphans the star. Change the `label` instead.
   *
   * Every one starts `deal-`, which is what keeps them from ever colliding with
   * a task id in the same `marks` object. Kebab-case and no dots: these become
   * field names inside a MongoDB document.
   */
  id: string;
  /** What the child reads. Ours — reword it whenever it reads better. */
  label: string;
  tier: DealTier;
};

/**
 * The fifty-three, in dealing order. See the note above before moving one.
 *
 * They are grouped by tier pattern rather than by subject, so a day's five
 * deals tend to come from five different corners of family life — a bathroom,
 * a kindness, something to make, something to eat, something to read.
 */
export const STAR_DEALS: readonly StarDeal[] = [
  /* --- Block 1 ------------------------------------------------------ */
  { id: "deal-playroom", label: "Organise the toys in the playroom, properly", tier: "everyone" },
  { id: "deal-car-clean", label: "Clear all the rubbish out of the car", tier: "school-age" },
  { id: "deal-downstairs-bath", label: "Clean the downstairs bathroom", tier: "big-kids" },
  { id: "deal-shoe-pile", label: "Sort out the shoes and coats by the door", tier: "everyone" },
  { id: "deal-mirrors", label: "Clean every mirror and glass door in the house", tier: "school-age" },

  /* --- Block 2 ------------------------------------------------------ */
  { id: "deal-book-shelf", label: "Put every book in the house back on a shelf", tier: "everyone" },
  { id: "deal-sibling-chore", label: "Do one of a sibling’s chores for them, without being asked", tier: "school-age" },
  { id: "deal-main-bath", label: "Clean the main floor bathroom", tier: "big-kids" },
  { id: "deal-sock-drawer", label: "Match every odd sock in the laundry", tier: "everyone" },
  { id: "deal-read-to-little", label: "Read a whole book out loud to one of the little ones", tier: "school-age" },

  /* --- Block 3 ------------------------------------------------------ */
  { id: "deal-serve-two-siblings", label: "Do a secret act of service for two of your siblings", tier: "everyone" },
  { id: "deal-teach-something", label: "Teach a sibling something you know how to do", tier: "school-age" },
  { id: "deal-kids-bath", label: "Clean the kids’ bathroom", tier: "big-kids" },
  { id: "deal-make-a-bed", label: "Make somebody else’s bed", tier: "everyone" },
  { id: "deal-set-table", label: "Set the whole table nicely for dinner — every place", tier: "school-age" },

  /* --- Block 4 ------------------------------------------------------ */
  { id: "deal-play-their-game", label: "Play the game they choose with a sibling, for 20 minutes", tier: "everyone" },
  { id: "deal-write-letter", label: "Write a real letter to someone and post it", tier: "school-age" },
  { id: "deal-fridge-wipe", label: "Wipe down the fridge shelves and throw out anything old", tier: "big-kids" },
  { id: "deal-parent-job", label: "Ask Mommy or Daddy for a job and do it all the way", tier: "everyone" },
  { id: "deal-thank-you-note", label: "Write a thank-you note to somebody who won’t expect one", tier: "school-age" },

  /* --- Block 5 ------------------------------------------------------ */
  { id: "deal-grandparent-call", label: "Ring a grandparent and ask them three questions about their life", tier: "everyone" },
  { id: "deal-neighbour-service", label: "Do something kind for a neighbour", tier: "school-age" },
  { id: "deal-dishes-alone", label: "Do the dinner dishes on your own tonight", tier: "big-kids" },
  { id: "deal-make-something-nice", label: "Make something nice for someone else and give it away", tier: "everyone" },
  { id: "deal-give-away", label: "Choose something of your own that you still like, and give it to someone who’d love it", tier: "school-age" },

  /* --- Block 6 ------------------------------------------------------ */
  { id: "deal-say-it-now", label: "Say it now: tell three people something true and good about them, out loud", tier: "everyone" },
  { id: "deal-cook-dinner-help", label: "Help cook dinner from start to finish", tier: "school-age" },
  { id: "deal-bless-the-one", label: "Bless the one: find the person in this house having the hardest day, and help them", tier: "big-kids" },
  { id: "deal-five-and-five", label: "Five servings of fruit and five of vegetables, all in one day", tier: "everyone" },
  { id: "deal-water-eight", label: "Eight cups of water throughout the day", tier: "school-age" },

  /* --- Block 7 ------------------------------------------------------ */
  { id: "deal-outside-hour", label: "A whole hour outside, moving", tier: "everyone" },
  { id: "deal-learn-something-new", label: "Learn something brand new and teach it to a family member", tier: "school-age" },
  { id: "deal-missionary-letter", label: "Write to a missionary", tier: "big-kids" },
  { id: "deal-family-walk", label: "Take a walk with at least one member of the family", tier: "everyone" },
  { id: "deal-double-reading", label: "Read double your reading time today", tier: "school-age" },

  /* --- Block 8 ------------------------------------------------------ */
  { id: "deal-early-bed", label: "Get yourself ready for bed early, with nobody reminding you", tier: "everyone" },
  { id: "deal-memorise", label: "Memorise a scripture, a poem, or a family mantra and say it at dinner", tier: "school-age" },
  { id: "deal-make-dessert", label: "Make a dessert to share with the whole family", tier: "big-kids" },
  { id: "deal-draw-something", label: "Draw or build something for someone else", tier: "everyone" },
  { id: "deal-gratitude-ten", label: "Write down ten things you’re grateful for", tier: "school-age" },

  /* --- Block 9 ------------------------------------------------------ */
  { id: "deal-ask-daddy", label: "Interview Mommy or Daddy about something you’ve always wondered", tier: "everyone" },
  { id: "deal-journal", label: "Write a page in your journal", tier: "school-age" },
  { id: "deal-quiet-ponder", label: "Ten minutes of quiet pondering — no screen, no noise", tier: "big-kids" },
  { id: "deal-lead-prayer", label: "Lead family prayer today", tier: "everyone" },
  { id: "deal-peacemaker", label: "Peacemaker on purpose: end an argument today without having to win it", tier: "school-age" },

  /* --- Block 10 ----------------------------------------------------- */
  { id: "deal-say-sorry", label: "Say sorry for something nobody made you say sorry for", tier: "everyone" },
  { id: "deal-dog-adventure", label: "Take Bella out and give her a proper adventure", tier: "school-age" },
  { id: "deal-lead-scriptures", label: "Lead the Book of Mormon reading and say what it means to you", tier: "big-kids" },
  { id: "deal-make-family-laugh", label: "Plan something that makes the whole family laugh tonight", tier: "everyone" },
  { id: "deal-photo-story", label: "Take five photos of today and tell the family the story of it at dinner", tier: "school-age" },

  /* --- The last three, which wrap round onto the first two ---------- */
  { id: "deal-record-video", label: "Record a video for our family", tier: "everyone" },
  { id: "deal-somebodys-angel", label: "Be somebody’s angel today — do the thing they needed before they asked", tier: "big-kids" },
  { id: "deal-leave-it-better", label: "Leave a place better than you found it (outside or inside)", tier: "everyone" },
] as const;

/**
 * The Monday deals started being offered, `YYYY-MM-DD`.
 *
 * Unlike the chore rotation's anchor this one is genuinely a *start date* and
 * not "a week whose answer is known", because there is no laminated chart to
 * disagree with: a deal is derived from the calendar and nothing else, so the
 * sum is as true for a week last March as for this one. Running it backwards
 * therefore recovers a real answer rather than inventing one, and a ceremony
 * for an old week shows exactly the deals that were on offer that week.
 *
 * Moving this reshuffles which deal lands on which day, for ever, in both
 * directions. There is no reason to.
 */
export const DEAL_ANCHOR_WEEK = "2026-08-10";

const DEALS_BY_ID = new Map(STAR_DEALS.map((deal) => [deal.id, deal]));

export function getStarDeal(id: string): StarDeal | undefined {
  return DEALS_BY_ID.get(id);
}

/** `true` when `id` names a deal that actually exists. */
export function isStarDealId(id: string): boolean {
  return DEALS_BY_ID.has(id);
}

/** Whether this deal is one this child could be offered at all. */
export function dealSuitsChild(deal: StarDeal, childId: ChildId): boolean {
  return DEAL_TIERS[deal.tier].includes(childId);
}

/**
 * The deals section, shaped like one of the three charts.
 *
 * It is *not* in `CHARTS` — that list is the three sheets on the fridge and
 * their titles are transcriptions of what is printed across the top of them.
 * This is ours. Keeping it out of `CHARTS` is what stops a deal ever being
 * mistaken for a printed row, while sharing the `Chart` type is what lets the
 * ceremony slide put it in the same column of results without a second shape.
 */
export const DEALS_CHART: Chart = {
  id: "deals",
  title: "Star Deals",
  tagline: "One a day • Nobody else gets yours • Worth three",
  blurb: "Today’s special — worth three stars.",
};
