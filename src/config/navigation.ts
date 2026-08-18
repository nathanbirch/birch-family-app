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
 * Home is pinned to the left of it and every other page sits in a strip beside
 * it that scrolls sideways — see the note on `NAV_ITEMS` for why it stopped
 * being five fixed slots.
 */

/**
 * Where an item sits in the bottom bar.
 *
 * `"home"` is the pinned button on the far left, which never moves and never
 * scrolls out of reach. A **number** is a place in the strip beside it,
 * lowest first. `null` means the bar does not carry it at all.
 *
 * The numbers are not indexes and do not have to be contiguous — they are sort
 * keys, so a page can be moved along the strip by changing one number rather
 * than by shuffling the whole list.
 */
export type NavBarPlace = "home" | number;

/**
 * How much vertical space the fixed bar occupies, as a CSS length.
 *
 * Almost every page in the app scrolls, so the bar only ever has to be *left
 * alone* — that is what `BottomNavSpacer` does, and it is the only consumer
 * that matters. The Note is the exception: it does not scroll, its pad has to
 * be the largest sheet that fits in what is left of the screen, and "what is
 * left" is a subtraction that has to know this number.
 *
 * It lives **here** rather than beside the bar it describes, and that is not
 * filing preference. `BottomNav.tsx` is a `"use client"` module, and every
 * export of one of those reaches a Server Component as a client *reference*
 * rather than as its value — so a page that imported the string from there
 * would interpolate an object into its stylesheet and silently get no height
 * at all. This file is plain configuration, importable from either side.
 */
export const BOTTOM_NAV_SPACE = "calc(4.5rem + env(safe-area-inset-bottom))";

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
   * Where this sits in the bottom bar, or `null` for something reached from
   * the dashboard only. See `NavBarPlace`.
   */
  bar: NavBarPlace | null;
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
  | "shopping"
  | "note"
  | "picker";

/**
 * The live pages.
 *
 * ---------------------------------------------------------------------------
 * THE BAR USED TO HOLD FIVE, AND MOST OF THIS FILE WAS THE ARGUMENT ABOUT IT
 * ---------------------------------------------------------------------------
 * For most of this app's life the bottom bar had five fixed slots, because
 * five is as many tap targets as fit across a phone before each one is too
 * narrow for a thumb. Every page after the fifth went on the dashboard
 * instead, and each time one did, the comment here grew another section
 * arguing about whether that was the moment to build a "More" sheet. Healthy,
 * then Bored, then Ceremonies, then the two tools — four rounds of it, ending
 * each time in "not yet".
 *
 * The sheet was never built and now never will be. The bar **scrolls**: Home
 * is pinned on the left where it cannot move, and every other page sits in a
 * strip beside it that slides sideways under a thumb. That answers the whole
 * argument rather than settling it, because the constraint the argument was
 * about — five targets across 360 pixels — is not a constraint on a strip that
 * is allowed to be wider than the screen.
 *
 * Two things the old rounds got right are kept, and are the reason the strip
 * has an order rather than just a list:
 *
 *   **Stars is first.** It is opened every day by five children, several times
 *   a day, and it is the only page you go to in order to *do* something rather
 *   than to read something.
 *   **Account is last.** It is the one nobody opens daily, so it takes the
 *   least reachable end — which on a strip is the far side of a scroll rather
 *   than a corner.
 *
 * About four tabs are visible before the strip needs pushing, so the first four
 * places are the only ones really worth arguing about. They are the three pages
 * somebody opens without having decided to — Stars, Shopping, Calendar — and
 * then Turns, which is glanced at once, at dinner, by somebody already looking
 * for it. Turns and Calendar traded places when the shopping list arrived, for
 * that reason and no other.
 *
 * ---------------------------------------------------------------------------
 * THE TOOLS ARE IN IT TOO
 * ---------------------------------------------------------------------------
 * The Note and the Finger Picker shipped with `bar: null`, on the argument that
 * they are not destinations — you do not navigate to a scribble pad, you pick
 * one up — so a tab would be claiming something about them that is not true.
 *
 * That argument was made while the bar was still a scarce resource, and it does
 * not survive the bar becoming a strip. A tab costs nothing now, and the case
 * against was never that a tab would *hurt*; it was that a tab was worth more
 * than they were. So they have places, near the end, and the Handy shelf on the
 * dashboard stays as well — the shelf is how somebody finds a tool the first
 * time, the tab is how they get back to it the twentieth.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/turns",
    label: "Turns",
    title: "Whose Turn",
    description:
      "Whose turn for which seat this week, and for Bella and Leia tonight.",
    bar: 4,
    icon: "seats",
  },
  {
    href: "/stars",
    label: "Stars",
    title: "Star Charts",
    description:
      "Chores, learning and hygiene — every star, all in one place.",
    bar: 1,
    icon: "stars",
  },
  /*
   * Second in the strip, behind Stars only, and third on the dashboard.
   *
   * That is a claim about how often it is opened rather than about how important
   * it is. Everything else in this list is read on a schedule — a week, a night,
   * a Sunday — and answers a question that has one answer. The shopping list is
   * opened whenever somebody notices the bread has run out and again whenever
   * somebody is standing in a shop, which is several times a day and never at a
   * predictable moment. It is also the only page where being one tap further away
   * has a cost you can measure in forgotten shopping.
   */
  {
    href: "/shopping",
    label: "Shopping",
    title: "Shopping List",
    description:
      "What we need. Anyone can add to it, and it updates on every phone at once.",
    bar: 2,
    icon: "shopping",
  },
  {
    href: "/mantras",
    label: "Mantras",
    title: "Family Mantras",
    description: "The things we say to each other, and where they came from.",
    bar: 8,
    icon: "mantras",
  },
  {
    href: "/",
    label: "Home",
    title: "Home",
    description: "Everything, all in one place.",
    bar: "home",
    icon: "home",
  },
  {
    href: "/calendar",
    label: "Calendar",
    title: "Calendar",
    description: "The family's Google Calendar, by day, week or month.",
    bar: 3,
    icon: "calendar",
  },
  {
    href: "/health",
    label: "Healthy",
    title: "Healthy Birches",
    description:
      "The five lists off the wall: body, mind, feelings, spirit and home.",
    bar: 7,
    icon: "health",
  },
  {
    href: "/bored",
    label: "Bored",
    title: "Bored?",
    description: "Inside, outside, or earn some Dad Bucks.",
    bar: 5,
    icon: "bored",
  },
  {
    href: "/ceremonies",
    label: "Ceremony",
    title: "Ceremonies",
    description: "Last week's award ceremony: every star, and what it was worth.",
    bar: 6,
    icon: "report",
  },
  {
    href: "/note",
    label: "Note",
    title: "The Note",
    description: "A pad on the fridge. Write on it with the pencil; it stays until it is cleared.",
    bar: 9,
    icon: "note",
    group: "tool",
  },
  {
    href: "/picker",
    label: "Picker",
    title: "Finger Picker",
    description: "Everyone puts a finger on the screen. After five, it picks one.",
    bar: 10,
    icon: "picker",
    group: "tool",
  },
  {
    href: "/account",
    label: "Account",
    title: "Account",
    description: "Theme, sign out, and what this app is.",
    bar: 11,
    icon: "account",
  },
] as const;

/** The dashboard lists every page except the dashboard itself. */
export const DASHBOARD_ITEMS: readonly NavItem[] = NAV_ITEMS.filter(
  (item) => item.bar !== "home",
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
 * The pinned button on the far left of the bar.
 *
 * Home is the only thing in the bar that is never scrolled away from, which is
 * what makes the strip beside it safe to scroll at all: however far along
 * somebody has pushed it, the way back to the middle of the app is exactly
 * where it always is.
 *
 * It throws rather than returning `undefined`. A bar with no Home is not a
 * degraded bar, it is a broken app, and failing at the point of the mistake is
 * more useful than rendering a strip with a hole on the left.
 */
export function getNavHome(): NavItem {
  const home = NAV_ITEMS.find((item) => item.bar === "home");
  if (!home) {
    throw new Error(
      'No NAV_ITEM has `bar: "home"`. The bottom bar needs a pinned Home ' +
        "button. Check config/navigation.ts.",
    );
  }
  return home;
}

/** A page with a numbered place in the scrolling strip. */
export type StripNavItem = NavItem & { bar: number };

/**
 * The scrolling strip, in order, left to right.
 *
 * Sorted by the number rather than by position in `NAV_ITEMS`, so the strip's
 * order and the dashboard's are free to differ — and they do. The dashboard is
 * a list you read down; the strip is a row you reach along, and the two do not
 * want the same order.
 */
export function getNavStripItems(): readonly StripNavItem[] {
  return NAV_ITEMS.filter(
    (item): item is StripNavItem => typeof item.bar === "number",
  ).sort((a, b) => a.bar - b.bar);
}

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
