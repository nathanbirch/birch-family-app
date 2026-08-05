import { describe, expect, it } from "vitest";

import {
  MANTRAS,
  MANTRA_COUNT,
  getMantra,
  getMantraOfDay,
} from "@/config/mantras";
import { NAV_ITEMS } from "@/config/navigation";

/*
 * These mantras quote four real people. The tests below cannot check that a
 * quote is accurate — only a human reading the talk can do that — but they can
 * make the *carelessness* that leads to misquoting impossible to commit
 * quietly: no quote without a named speaker, a titled source and a link; no
 * family mantra silently passed off as somebody's words.
 */

function localDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

describe("attribution", () => {
  it("gives every quote a speaker, a role, a title and an occasion", () => {
    for (const mantra of MANTRAS) {
      expect(mantra.source.author.length).toBeGreaterThan(0);
      expect(mantra.source.role.length).toBeGreaterThan(0);
      expect(mantra.source.title.length).toBeGreaterThan(0);
      expect(mantra.source.occasion).toMatch(/\d{4}/);
    }
  });

  it("links every quote to a source that can actually be checked", () => {
    for (const mantra of MANTRAS) {
      expect(mantra.source.url).toMatch(/^https:\/\//);
      // Only the two official sources these talks are published on. A quote
      // "sourced" to a quote-aggregator site is how a misattribution gets in.
      expect(mantra.source.url).toMatch(
        /^https:\/\/(www\.churchofjesuschrist\.org|speeches\.byu\.edu)\//,
      );
    }
  });

  it("only attributes quotes to the four people this family listens to", () => {
    const voices = new Set(MANTRAS.map((mantra) => mantra.source.author));
    expect([...voices].sort()).toEqual([
      "Elder Jeffrey R. Holland",
      "President Russell M. Nelson",
      "President Thomas S. Monson",
      "Sister Kristin M. Yee",
    ]);
  });

  it("never presents the family's own words as a quotation", () => {
    // The mantra is ours; the quote is theirs. If the two were identical the
    // card would be attributing a Birch family phrase to an apostle.
    for (const mantra of MANTRAS) {
      expect(mantra.quote.toLowerCase()).not.toBe(mantra.text.toLowerCase());
    }
  });

  it("keeps quotes verbatim rather than trailing off into a paraphrase", () => {
    for (const mantra of MANTRAS) {
      // An ellipsis at the end is the tell-tale of a stitched-together quote.
      expect(mantra.quote).not.toMatch(/\.\.\.$|…$/);
      expect(mantra.quote.trim()).toBe(mantra.quote);
      // No stray wrapping quote marks: the card adds the typographic ones.
      expect(mantra.quote.startsWith('"')).toBe(false);
      expect(mantra.quote.startsWith("“")).toBe(false);
    }
  });
});

describe("the mantras themselves", () => {
  it("gives every mantra a unique id", () => {
    const ids = MANTRAS.map((mantra) => mantra.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every mantra short enough to say out loud", () => {
    for (const mantra of MANTRAS) {
      expect(mantra.text.length).toBeLessThanOrEqual(48);
      expect(mantra.text.length).toBeGreaterThan(0);
    }
  });

  it("explains what each one means to this family", () => {
    for (const mantra of MANTRAS) {
      expect(mantra.meaning.length).toBeGreaterThan(20);
    }
  });

  it("reports its own count", () => {
    expect(MANTRA_COUNT).toBe(MANTRAS.length);
    expect(MANTRA_COUNT).toBeGreaterThan(0);
  });

  it("looks one up by id, and refuses an unknown one", () => {
    expect(getMantra("keep-walking").text).toBe("Keep walking.");
    expect(() => getMantra("nope")).toThrow(/Unknown mantra id/);
  });
});

describe("the mantra of the day", () => {
  it("is the same all day, whatever the time", () => {
    const morning = new Date(2026, 7, 4, 6, 30);
    const midnightish = new Date(2026, 7, 4, 23, 59);
    expect(getMantraOfDay(morning).id).toBe(getMantraOfDay(midnightish).id);
  });

  it("changes at midnight", () => {
    const today = getMantraOfDay(localDate("2026-08-04"));
    const tomorrow = getMantraOfDay(localDate("2026-08-05"));
    expect(tomorrow.id).not.toBe(today.id);
  });

  it("walks the whole list before repeating any of it", () => {
    const seen = MANTRAS.map((_, offset) => {
      const date = new Date(2026, 7, 4 + offset, 12);
      return getMantraOfDay(date).id;
    });
    expect(new Set(seen).size).toBe(MANTRAS.length);
  });

  it("comes back round after a full cycle", () => {
    const start = localDate("2026-08-04");
    const afterOneCycle = new Date(2026, 7, 4 + MANTRAS.length, 12);
    expect(getMantraOfDay(afterOneCycle).id).toBe(getMantraOfDay(start).id);
  });

  it("never falls off the list, in either direction", () => {
    // Dates far in the past used to be the bug here: a negative remainder
    // would index off the front of the array and hand back `undefined`.
    for (const iso of ["1965-03-02", "1999-12-31", "2031-06-15"]) {
      const mantra = getMantraOfDay(localDate(iso));
      expect(MANTRAS).toContain(mantra);
    }
  });

  it("shows every device in the family the same mantra", () => {
    // Two different Date objects for the same calendar day — one built from
    // an ISO string, one from parts — must agree.
    const a = getMantraOfDay(localDate("2026-12-25"));
    const b = getMantraOfDay(new Date(2026, 11, 25, 8, 15));
    expect(a.id).toBe(b.id);
  });
});

describe("the page is wired up", () => {
  it("is a real destination in the nav, not an orphan page", () => {
    const item = NAV_ITEMS.find((entry) => entry.href === "/mantras");
    expect(item).toBeDefined();
    expect(item?.title).toBe("Family Mantras");
  });

  it("uses icons the icon set actually has", () => {
    const known = new Set([
      "seats",
      "mantras",
      "home",
      "account",
      "chores",
      "rewards",
      "stars",
      "calendar",
    ]);
    for (const mantra of MANTRAS) {
      expect(known.has(mantra.icon)).toBe(true);
    }
  });
});
