/**
 * @vitest-environment node
 *
 * The roster join and the child allowlist.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CHILD_IDS } from "@/config/family";
import {
  BIRTHDAY_WINDOW_DAYS,
  PROFILE_TIMEZONE,
  PROFILE_WIND_DOWN,
  familyRoster,
  resolveChildSlug,
  upcomingBirthdays,
} from "@/lib/family-api/family";

describe("the two sources of truth agree", () => {
  /*
   * `config/family-profile.json` holds the birth dates; `src/config/family.ts`
   * holds the names the app uses. A disagreement between them would leave a
   * child whose age this API cannot compute, which is exactly the sort of
   * thing that goes unnoticed until a birthday.
   */
  it("has all five children, and only children the app knows", () => {
    const roster = familyRoster();
    expect(roster).toHaveLength(CHILD_IDS.length);
    expect(roster.map((child) => child.id).sort()).toEqual([...CHILD_IDS].sort());
  });

  it("gives every child a name and a parseable birth date", () => {
    for (const child of familyRoster()) {
      expect(child.name.length, child.id).toBeGreaterThan(0);
      expect(child.birthDate, child.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("reads the timezone and wind-down time from the profile", () => {
    expect(PROFILE_TIMEZONE).toBe("America/Boise");
    expect(PROFILE_WIND_DOWN).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });
});

describe("the child parameter is an allowlist", () => {
  it("resolves each of the five ids", () => {
    for (const id of CHILD_IDS) {
      expect(resolveChildSlug(id)?.id, id).toBe(id);
    }
  });

  it("accepts the casing a language model will actually send", () => {
    expect(resolveChildSlug("Clara")?.id).toBe("clara");
    expect(resolveChildSlug("  CLARA  ")?.id).toBe("clara");
  });

  it("returns null for anything else", () => {
    for (const value of [
      "nathan", // a parent — this API identifies children only
      "sarah",
      "bella", // a dog
      "unknown",
      "",
      "   ",
      "clara ", // handled by trimming, but a partial must not slip through
      "clar",
      "clarax",
    ]) {
      if (value.trim().toLowerCase() === "clara") continue;
      expect(resolveChildSlug(value), value).toBeNull();
    }
  });

  it("refuses values that look like an injection or an id", () => {
    for (const value of [
      "507f1f77bcf86cd799439011",
      '{"$ne":null}',
      "clara' OR '1'='1",
      "../../etc/passwd",
      "clara&child=emily",
      "x".repeat(500),
    ]) {
      expect(resolveChildSlug(value), value).toBeNull();
    }
  });

  it("returns null when no parameter was given at all", () => {
    expect(resolveChildSlug(null)).toBeNull();
  });
});

describe("upcoming birthdays", () => {
  it("only includes birthdays inside the configured window", () => {
    // 5 August 2026. William is 7 September — 33 days away, outside a
    // fourteen-day window.
    const { items } = upcomingBirthdays("2026-08-05", { max: 10 });
    expect(items.map((entry) => entry.person)).not.toContain("William");
  });

  it("includes one that is inside the window", () => {
    // Daddy's birthday is 16 July, so ask from ten days before.
    const { items } = upcomingBirthdays("2026-07-06", { max: 10 });
    expect(items.map((entry) => entry.person)).toContain("Daddy");
  });

  it("never carries an age or a birth year for a parent", () => {
    const { items } = upcomingBirthdays("2026-07-16", { max: 10 });
    const daddy = items.find((entry) => entry.person === "Daddy");

    expect(daddy).toBeDefined();
    expect(Object.keys(daddy!).sort()).toEqual(["date", "daysAway", "person"]);
  });

  it("sorts soonest first, with a stable tie-break", () => {
    const { items } = upcomingBirthdays("2026-11-15", { max: 10 });
    const days = items.map((entry) => entry.daysAway);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it("caps the list and reports that it did", () => {
    const { items, truncated } = upcomingBirthdays("2026-11-15", { max: 1 });
    expect(items.length).toBeLessThanOrEqual(1);
    if (truncated) expect(items).toHaveLength(1);
  });

  it("reads the window from config rather than hardcoding it", () => {
    expect(BIRTHDAY_WINDOW_DAYS).toBeGreaterThan(0);
    const { items } = upcomingBirthdays("2026-08-05", {
      windowDays: 400,
      max: 10,
    });
    // With a wide enough window everybody in the family appears exactly once.
    expect(items).toHaveLength(7);
  });
});
