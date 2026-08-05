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
  /** Which of the three bar positions this occupies. */
  slot: NavSlot;
  /** Key into `NAV_ICONS`. */
  icon: NavIconName;
};

export type NavIconName =
  | "seats"
  | "mantras"
  | "home"
  | "calendar"
  | "account";

/**
 * The live pages.
 *
 * This is now five destinations, which is the most the bar holds — the note at
 * the top of this file about tap targets is no longer theoretical, and the
 * next page added here has to displace one of these or move the pattern to a
 * "More" sheet.
 *
 * Account sits at the far right rather than beside Home. It is the one tab
 * nobody opens daily, so it takes the least reachable corner and Calendar —
 * which is checked constantly — takes the slot next to Home.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/seating",
    label: "Seats",
    title: "Seating Rotation",
    description:
      "Who sits where at the dinner table and in the Expedition this week.",
    slot: "far-left",
    icon: "seats",
  },
  {
    href: "/mantras",
    label: "Mantras",
    title: "Family Mantras",
    description: "The things we say to each other, and where they came from.",
    slot: "left",
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

export type PlannedIconName = "chores" | "rewards" | "stars";

export const PLANNED_FEATURES: readonly PlannedFeature[] = [
  {
    title: "Chore Charts",
    description: "Who does what, and whether it actually got done.",
    icon: "chores",
  },
  {
    title: "Rewards",
    description: "What all those stars add up to.",
    icon: "rewards",
  },
  {
    title: "Stars",
    description: "Earned for chores, kindness and effort.",
    icon: "stars",
  },
] as const;

/** Ordered for the bar, left to right. Missing slots are simply absent. */
export function getNavBarItems(): readonly NavItem[] {
  const order: NavSlot[] = ["far-left", "left", "home", "right", "far-right"];
  return order
    .map((slot) => NAV_ITEMS.find((item) => item.slot === slot))
    .filter((item): item is NavItem => item !== undefined);
}

/**
 * Whether `href` is the page currently shown.
 *
 * Home only matches exactly — otherwise it would light up on every page, since
 * every path starts with "/". Everything else matches its own sub-tree, so a
 * future `/seating/history` still highlights Seats.
 */
export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
