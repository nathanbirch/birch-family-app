/**
 * Everything the app knows about its own pages.
 *
 * The bottom navigation bar and the dashboard cards are both generated from
 * this one list, so adding a feature is a single edit here plus the page
 * itself — the nav and the dashboard pick it up automatically and stay in
 * step with each other.
 *
 * ---------------------------------------------------------------------------
 * WHY A BOTTOM BAR
 * ---------------------------------------------------------------------------
 * This is used almost entirely on phones, held one-handed. On a modern phone
 * the top of the screen is out of comfortable thumb reach, and both iOS and
 * Android put primary navigation at the bottom for exactly that reason. A
 * bottom bar also survives the on-screen keyboard and the browser chrome that
 * hides and reappears as you scroll, which a sticky top bar does not.
 *
 * The bar holds up to five destinations. Past that, tap targets get too narrow
 * to hit reliably and the pattern should change to a "More" sheet.
 */

/**
 * Which slot an item takes in the bar, in left-to-right order.
 *
 * Home keeps its own slot name because it is the anchor, not because it is
 * always the geometric middle: with an even number of pages something has to
 * sit off-centre. Home is placed just right of centre, which on a phone held
 * one-handed is the easiest point on the bar to reach, not the hardest.
 */
export type NavSlot = "far-left" | "left" | "home" | "right" | "far-right";

export type NavItem = {
  /** Route path. Must match a real page under `src/app/(app)/`. */
  href: string;
  /** Bottom-bar label. Keep to one short word — space is tight. */
  label: string;
  /** Dashboard card title. May be longer than `label`. */
  title: string;
  /** One line on the dashboard card explaining what the page is for. */
  description: string;
  /**
   * Which bar position this occupies, or `null` for a page that is reached
   * from the dashboard only. See the note on `NAV_ITEMS` — the bar is full,
   * and a sixth tab would make every tap target too narrow to hit.
   */
  slot: NavSlot | null;
  /** Key into `NAV_ICONS`. */
  icon: NavIconName;
  /**
   * Which section of the dashboard this belongs to. Omitted means `"page"`,
   * which is what nearly everything is — see `NavGroup`.
   */
  group?: NavGroup;
};

/**
 * A destination, or a thing you pick up.
 *
 * Every entry in `NAV_ITEMS` was a **page** until the Note and the Finger
 * Picker arrived. Those two are not pages in the sense the rest are: you do
 * not go to them to find something out. You open one, use it for a minute in
 * the room you are standing in, and close it. The Note is a pad you scribble
 * on; the Picker settles an argument about who goes first.
 *
 * That distinction earns its own word because it is what finally answers the
 * "More sheet" argument written out at length below. The sheet was overdue on
 * the count of dashboard-only *pages*; it is not the answer for a **tool**,
 * because a tool wants to be grabbed, not navigated to. Tools get their own
 * compact row on the dashboard — two across, like Coming Soon — which keeps
 * the page list from growing to ten full-width cards you have to scroll.
 */
export type NavGroup = "page" | "tool";

export type NavIconName =
  | "seats"
  | "mantras"
  | "home"
  | "calendar"
  | "account"
  | "health"
  | "bored"
  | "stars"
  | "report"
  | "note"
  | "picker";

/**
 * The live pages.
 *
 * The bar is full: five slots, five tabs. When Healthy arrived it became the
 * first page with `slot: null` — it is on the dashboard, and reached from
 * there, but it is not in the bar. That was chosen over displacing an existing
 * tab because the four it would push against are all things you open *and
 * close* in a few seconds (where do I sit, what's on today, sign out), whereas
 * Healthy is a page you sit and read. It is also the honest option: squeezing
 * a sixth tab in would take every target below the size a thumb reliably hits,
 * which is the whole reason the limit exists.
 *
 * Stars then took the second tab off Mantras rather than becoming a second
 * dashboard-only page, by the criteria in the paragraph above: it is opened
 * every single day by five children, several times a day, and it is the only
 * page in the app you go to in order to *do* something rather than to read
 * something. Mantras is a page you sit with occasionally, which is exactly the
 * profile Healthy has, so it now sits beside it on the dashboard.
 *
 * If a seventh page ever needs a home, that is the point to build the "More"
 * sheet rather than pushing a third page onto the dashboard alone.
 *
 * ---------------------------------------------------------------------------
 * THAT POINT HAS NOW ARRIVED, AND THE SHEET STILL IS NOT BUILT
 * ---------------------------------------------------------------------------
 * Bored is the third dashboard-only page, which is exactly the threshold the
 * paragraph above names. It shipped without the sheet anyway, deliberately, and
 * the reasoning is worth writing down rather than leaving as an oversight:
 *
 * The dashboard is not a consolation prize for Bored — it is the better home
 * for it. The bar is for the pages you open with an intention already formed
 * ("where do I sit", "what's on today"). A bored child has no intention; they
 * have opened the app precisely because they do not know what they want. The
 * home screen is where they land, so the card is already in front of them
 * without a tap, and a "More" sheet would put it one tap *further* away than
 * it is now.
 *
 * So the rule stands and the count is real — three is where a "More" sheet
 * becomes the right answer. The next page to need a home is the one that
 * should build it, and by then there will be four candidates to put in it
 * rather than three, which makes the sheet easier to justify and better to
 * design. See docs/bored.md.
 *
 * ---------------------------------------------------------------------------
 * THE FOURTH ONE HAS NOW ARRIVED TOO, AND STILL NO SHEET
 * ---------------------------------------------------------------------------
 * Ceremonies is the fourth dashboard-only page. It has the profile the
 * paragraph above describes for a sheet — but it also has a shape none of the
 * others do: it is looked at *once a week*, on a Monday, and never twice. A
 * tab (or a slot in a sheet) is for somewhere you go repeatedly; a card on the
 * home screen is exactly right for somewhere you go when it is new, because
 * the home screen is where you land and the card is already in front of you.
 *
 * The sheet is therefore still unbuilt, and this is now the second page in a
 * row to have said so. That is worth reading as a warning: if a *fifth*
 * dashboard-only page turns up and the reasoning has to be written a third
 * time, the reasoning is wrong and the sheet is overdue.
 *
 * ---------------------------------------------------------------------------
 * THE FIFTH AND SIXTH ARRIVED, AND THE WARNING ABOVE WAS RIGHT
 * ---------------------------------------------------------------------------
 * The Note and the Finger Picker are entries five and six. By the rule written
 * directly above, that is where the excuses stop.
 *
 * They stop here in a different way than expected, though. The honest reading
 * of those two is that they are not pages at all — see `NavGroup`. A "More"
 * sheet is a list of *destinations* that did not fit; putting a scribble pad
 * behind two taps and a slide-up would be the worst possible home for it, and
 * the Picker gets opened mid-argument with five children shouting, which is
 * not the moment for a menu.
 *
 * So: four dashboard-only pages, unchanged, and the sheet is still the right
 * answer for the *fifth page*. What shipped instead is a second, smaller shelf
 * on the dashboard for the two tools, which costs the page list nothing.
 *
 * That is a real answer, not a third excuse — but it is only an answer for
 * tools. If a fifth dashboard-only **page** turns up, build the sheet.
 *
 * Account sits at the far right rather than beside Home. It is the one tab
 * nobody opens daily, so it takes the least reachable corner and Calendar —
 * which is checked constantly — takes the slot next to Home.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/turns",
    label: "Turns",
    title: "Whose Turn",
    description:
      "Whose turn for which seat this week, and for Bella and Leia tonight.",
    slot: "far-left",
    icon: "seats",
  },
  {
    href: "/stars",
    label: "Stars",
    title: "Star Charts",
    description:
      "Chores, learning and hygiene — every star, all in one place.",
    slot: "left",
    icon: "stars",
  },
  {
    href: "/mantras",
    label: "Mantras",
    title: "Family Mantras",
    description: "The things we say to each other, and where they came from.",
    slot: null,
    icon: "mantras",
  },
  {
    href: "/",
    label: "Home",
    title: "Home",
    description: "Everything, all in one place.",
    slot: "home",
    icon: "home",
  },
  {
    href: "/calendar",
    label: "Calendar",
    title: "Calendar",
    description: "The family's Google Calendar, by day, week or month.",
    slot: "right",
    icon: "calendar",
  },
  {
    href: "/health",
    label: "Healthy",
    title: "Healthy Birches",
    description:
      "The five lists off the wall: body, mind, feelings, spirit and home.",
    slot: null,
    icon: "health",
  },
  {
    href: "/bored",
    label: "Bored",
    title: "Bored?",
    description: "Inside, outside, or earn some Dad Bucks.",
    slot: null,
    icon: "bored",
  },
  {
    href: "/ceremonies",
    label: "Ceremony",
    title: "Ceremonies",
    description: "Last week's award ceremony: every star, and what it was worth.",
    slot: null,
    icon: "report",
  },
  {
    href: "/note",
    label: "Note",
    title: "The Note",
    description: "A pad on the fridge. Write on it with the pencil; it stays until it is cleared.",
    slot: null,
    icon: "note",
    group: "tool",
  },
  {
    href: "/picker",
    label: "Picker",
    title: "Finger Picker",
    description: "Everyone puts a finger on the screen. After five, it picks one.",
    slot: null,
    icon: "picker",
    group: "tool",
  },
  {
    href: "/account",
    label: "Account",
    title: "Account",
    description: "Theme, sign out, and what this app is.",
    slot: "far-right",
    icon: "account",
  },
] as const;

/** The dashboard lists every page except the dashboard itself. */
export const DASHBOARD_ITEMS: readonly NavItem[] = NAV_ITEMS.filter(
  (item) => item.slot !== "home",
);

/**
 * The full-width cards: somewhere to go.
 *
 * Still one card per page, still in `NAV_ITEMS` order, still exactly what the
 * dashboard rendered before tools existed.
 */
export const DASHBOARD_PAGES: readonly NavItem[] = DASHBOARD_ITEMS.filter(
  (item) => (item.group ?? "page") === "page",
);

/**
 * The small cards: something to pick up.
 *
 * Two across, below the pages and above Coming Soon. They are deliberately the
 * same shape as the Coming Soon cards rather than a shrunken page card — the
 * dashboard already says "small square card = not a destination", and reusing
 * that shape means the tools read as a drawer of implements at a glance.
 */
export const DASHBOARD_TOOLS: readonly NavItem[] = DASHBOARD_ITEMS.filter(
  (item) => item.group === "tool",
);

/**
 * Features that are planned but not built.
 *
 * Shown on the dashboard as muted, non-interactive cards. This is honest with
 * whoever opens the app — the app says what it will become rather than
 * pretending the roadmap does not exist — and it doubles as the to-do list for
 * whoever picks this up next. Delete an entry as you add the real page to
 * `NAV_ITEMS`.
 */
export type PlannedFeature = {
  title: string;
  description: string;
  icon: PlannedIconName;
};

/*
 * `report` used to live here. It moved to `NavIconName` when the weekly report
 * stopped being a promise on the dashboard and became a page — the drawing did
 * not change, only what it points at.
 */
export type PlannedIconName = "rewards";

/**
 * Icons that belong to no page at all.
 *
 * The mantra cards illustrate themselves from the same icon set, and one of
 * them uses the checklist that used to stand for the planned Chore Charts
 * page. The page shipped as Stars, but the drawing is still the right picture
 * for "the jobs list", so it stays in the set under its own name rather than
 * being deleted or pretending to be a destination.
 */
export type DecorativeIconName = "chores";

export const PLANNED_FEATURES: readonly PlannedFeature[] = [
  {
    title: "Rewards",
    description: "What all those stars add up to, and what has been paid out.",
    icon: "rewards",
  },
] as const;

/**
 * Ordered for the bar, left to right. Missing slots are simply absent, and a
 * page with no slot at all never appears here.
 */
export function getNavBarItems(): readonly BarNavItem[] {
  const order: NavSlot[] = ["far-left", "left", "home", "right", "far-right"];
  return order
    .map((slot) => NAV_ITEMS.find((item) => item.slot === slot))
    .filter((item): item is BarNavItem => item !== undefined);
}

/** A page that actually has a place in the bar. */
export type BarNavItem = NavItem & { slot: NavSlot };

/**
 * Whether `href` is the page currently shown.
 *
 * Home only matches exactly — otherwise it would light up on every page, since
 * every path starts with "/". Everything else matches its own sub-tree, so a
 * future `/turns/history` still highlights Turns.
 */
export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
