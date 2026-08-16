import { describe, expect, it } from "vitest";

import {
  DASHBOARD_ITEMS,
  DASHBOARD_PAGES,
  DASHBOARD_TOOLS,
  NAV_ITEMS,
  PLANNED_FEATURES,
  getNavBarItems,
  isActivePath,
} from "@/config/navigation";

/*
 * The bottom bar and the dashboard are both generated from `NAV_ITEMS`, so
 * these tests are really about keeping that one list well-formed — a bad entry
 * would break navigation everywhere at once.
 */

describe("navigation items", () => {
  it("gives every page a unique route", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("has exactly one home, and it is the dashboard", () => {
    const home = NAV_ITEMS.filter((item) => item.slot === "home");
    expect(home).toHaveLength(1);
    expect(home[0].href).toBe("/");
  });

  it("puts at most one page in each side slot", () => {
    for (const slot of ["far-left", "left", "right", "far-right"] as const) {
      expect(NAV_ITEMS.filter((item) => item.slot === slot).length).toBeLessThanOrEqual(1);
    }
  });

  it("starts every route at the root", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
    }
  });

  it("keeps bar labels short enough to fit a phone", () => {
    /*
     * A tab is about 69px wide on a 360px phone, and "Calendar" — eight
     * characters at 0.7rem — is already most of it. The label truncates inside
     * its own tab rather than pushing its neighbours around, and ten is the
     * point past which the ellipsis would start eating real letters.
     */
    for (const item of NAV_ITEMS) {
      expect(item.label.length).toBeLessThanOrEqual(10);
    }
  });

  it("stays within the five destinations a bottom bar can hold", () => {
    // Pages with no slot are reached from the dashboard and cost the bar
    // nothing; it is the *tabs* that have to stay at five or fewer, because
    // past that the targets are too narrow for a thumb.
    const tabs = NAV_ITEMS.filter((item) => item.slot !== null);
    expect(tabs.length).toBeLessThanOrEqual(5);
  });

  it("keeps dashboard-only pages off the bar but on the dashboard", () => {
    const offBar = NAV_ITEMS.filter((item) => item.slot === null);
    const barHrefs = getNavBarItems().map((item) => item.href);
    const cardHrefs = DASHBOARD_ITEMS.map((item) => item.href);
    for (const item of offBar) {
      expect(barHrefs).not.toContain(item.href);
      // Otherwise the page would be unreachable by tapping anything at all.
      expect(cardHrefs).toContain(item.href);
    }
  });
});

describe("bar ordering", () => {
  it("returns the slots in left-to-right order, skipping empty ones", () => {
    const order = ["far-left", "left", "home", "right", "far-right"];
    const slots = getNavBarItems().map((item) => item.slot);
    // Whatever is configured, the bar must come out in bar order — and the
    // one empty slot must simply not appear rather than leaving a gap.
    expect(slots).toEqual([...slots].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(slots).toContain("home");
  });

  it("renders every page that asked for a slot", () => {
    const slotted = NAV_ITEMS.filter((item) => item.slot !== null);
    expect(getNavBarItems()).toHaveLength(slotted.length);
  });
});

describe("dashboard cards", () => {
  it("lists every page except the dashboard itself", () => {
    expect(DASHBOARD_ITEMS.map((item) => item.href)).not.toContain("/");
    expect(DASHBOARD_ITEMS).toHaveLength(NAV_ITEMS.length - 1);
  });

  it("gives every card a title and a description", () => {
    for (const item of [...DASHBOARD_ITEMS, ...PLANNED_FEATURES]) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it("splits the cards into pages and tools, losing none of either", () => {
    // The two sections are a rendering decision, not a second source of truth:
    // together they must still be exactly what the dashboard used to show.
    expect([...DASHBOARD_PAGES, ...DASHBOARD_TOOLS].map((item) => item.href).sort()).toEqual(
      DASHBOARD_ITEMS.map((item) => item.href).sort(),
    );
    expect(DASHBOARD_PAGES.some((item) => item.group === "tool")).toBe(false);
    expect(DASHBOARD_TOOLS.every((item) => item.group === "tool")).toBe(true);
  });

  it("keeps the page list short enough not to need scrolling past", () => {
    /*
     * The reason `NavGroup` exists. Every page card is full width and about
     * 88px tall; past eight of them, Account — which is at the bottom — falls
     * below the fold on a phone, and the dashboard stops being a screen you
     * take in at a glance. If this fails, the next thing to build is the
     * "More" sheet that `config/navigation.ts` has been putting off.
     */
    expect(DASHBOARD_PAGES.length).toBeLessThanOrEqual(8);
  });

  it("never puts a tool in the bottom bar", () => {
    // A tool is something you pick up from the dashboard. Giving one a tab
    // would spend one of five slots on something opened once a week.
    for (const item of DASHBOARD_TOOLS) {
      expect(item.slot).toBeNull();
    }
  });

  it("does not promise a feature that already exists", () => {
    const shipped = new Set(NAV_ITEMS.map((item) => item.title.toLowerCase()));
    for (const planned of PLANNED_FEATURES) {
      expect(shipped.has(planned.title.toLowerCase())).toBe(false);
    }
  });
});

describe("the sign-out escape hatch", () => {
  /*
   * `/signed-out` clears a stale session cookie. It is reached exactly when the
   * cookie's signature is valid but its session is gone — revoked server-side,
   * or expired and swept by the TTL index.
   *
   * It must never appear in the navigation, and must never be treated as a
   * page. It exists only to break this loop, which was a real bug:
   *
   *   /turns -> proxy allows (valid signature) -> requireUser redirects to
   *   /login -> proxy redirects to / (valid signature) -> requireUser
   *   redirects to /login -> ... ERR_TOO_MANY_REDIRECTS
   */
  it("is not a navigable page", () => {
    expect(NAV_ITEMS.map((item) => item.href)).not.toContain("/signed-out");
    expect(DASHBOARD_ITEMS.map((item) => item.href)).not.toContain("/signed-out");
  });

  it("does not light up any tab", () => {
    for (const item of NAV_ITEMS) {
      expect(isActivePath(item.href, "/signed-out")).toBe(false);
    }
  });
});

describe("active tab highlighting", () => {
  it("matches a page exactly", () => {
    expect(isActivePath("/turns", "/turns")).toBe(true);
    expect(isActivePath("/turns", "/account")).toBe(false);
  });

  it("matches a page's sub-routes, so /turns/history still lights up Turns", () => {
    expect(isActivePath("/turns", "/turns/history")).toBe(true);
  });

  it("does not let /turns match /turns-plan", () => {
    // Naive `startsWith` would wrongly claim this one.
    expect(isActivePath("/turns", "/turns-plan")).toBe(false);
  });

  it("only lights up Home on Home", () => {
    // Every path starts with "/", so an exact match is the only correct rule.
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/", "/turns")).toBe(false);
    expect(isActivePath("/", "/account")).toBe(false);
  });
});
