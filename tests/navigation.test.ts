import { describe, expect, it } from "vitest";

import {
  DASHBOARD_ITEMS,
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
    // Past about ten characters the label wraps or truncates in a tab.
    for (const item of NAV_ITEMS) {
      expect(item.label.length).toBeLessThanOrEqual(10);
    }
  });

  it("stays within the five destinations a bottom bar can hold", () => {
    expect(NAV_ITEMS.length).toBeLessThanOrEqual(5);
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

  it("renders every configured page", () => {
    expect(getNavBarItems()).toHaveLength(NAV_ITEMS.length);
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
   *   /seating -> proxy allows (valid signature) -> requireUser redirects to
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
    expect(isActivePath("/seating", "/seating")).toBe(true);
    expect(isActivePath("/seating", "/account")).toBe(false);
  });

  it("matches a page's sub-routes, so /seating/history still lights up Seats", () => {
    expect(isActivePath("/seating", "/seating/history")).toBe(true);
  });

  it("does not let /seating match /seating-plan", () => {
    // Naive `startsWith` would wrongly claim this one.
    expect(isActivePath("/seating", "/seating-plan")).toBe(false);
  });

  it("only lights up Home on Home", () => {
    // Every path starts with "/", so an exact match is the only correct rule.
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/", "/seating")).toBe(false);
    expect(isActivePath("/", "/account")).toBe(false);
  });
});
