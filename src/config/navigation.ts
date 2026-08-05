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
};

export type NavIconName =
  | "seats"
  | "mantras"
  | "home"
  | "calendar"
  | "account"
  | "health"
  | "stars";

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

export type PlannedIconName = "rewards" | "report";

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
    title: "Weekly Report",
    description: "Friday's celebration: confetti, and a slide for every child.",
    icon: "report",
  },
  {
    title: "Rewards",
    description: "What all those stars add up to.",
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
