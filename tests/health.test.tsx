import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthList } from "@/components/health/HealthList";
import { HealthSectionCard } from "@/components/health/HealthSectionCard";
import {
  HEALTH_ITEM_COUNT,
  HEALTH_SECTIONS,
  findHealthSection,
} from "@/config/health";
import { NAV_ITEMS } from "@/config/navigation";

/*
 * These five lists are transcriptions of paper on a wall, so the tests that
 * matter are the ones that catch someone quietly "improving" the wording. The
 * counts below and the spot-checks in `describe("the exact wording")` were
 * read straight off the photographs of the sheets; if a test here fails, the
 * question to ask is whether the paper changed — not whether the number is
 * wrong.
 */

/** How many numbered lines are on each printed sheet. */
const PRINTED_COUNTS: Record<string, number> = {
  body: 11,
  mind: 7,
  emotions: 9,
  spirit: 12,
  home: 20,
};

function sectionById(id: string) {
  const section = findHealthSection(id);
  if (!section) throw new Error(`No health section "${id}"`);
  return section;
}

describe("the five sheets", () => {
  it("has all five, in the order the page shows them", () => {
    expect(HEALTH_SECTIONS.map((section) => section.id)).toEqual([
      "body",
      "mind",
      "emotions",
      "spirit",
      "home",
    ]);
  });

  it("keeps every list the length it is on the wall", () => {
    for (const section of HEALTH_SECTIONS) {
      expect(section.items).toHaveLength(PRINTED_COUNTS[section.id]);
    }
    expect(HEALTH_ITEM_COUNT).toBe(59);
  });

  it("titles each one exactly as the sheet is headed", () => {
    expect(HEALTH_SECTIONS.map((section) => section.title)).toEqual([
      "Healthy Body",
      "Healthy Mind",
      "Healthy Emotions",
      "Healthy Spirit",
      "How to Keep the Spirit in Our Home",
    ]);
  });

  it("never repeats an item within a list", () => {
    for (const section of HEALTH_SECTIONS) {
      expect(new Set(section.items).size).toBe(section.items.length);
    }
  });

  it("gives every list our own blurb and intro as well as their words", () => {
    for (const section of HEALTH_SECTIONS) {
      expect(section.blurb.length).toBeGreaterThan(0);
      expect(section.intro.length).toBeGreaterThan(0);
      // The blurb is the app's writing; it must not be passed off as a list
      // item, which is what the page renders under a numbered heading.
      expect(section.items).not.toContain(section.blurb);
      expect(section.items).not.toContain(section.intro);
    }
  });
});

describe("the exact wording", () => {
  it("keeps the first and last line of every sheet", () => {
    const edges: Record<string, [string, string]> = {
      body: ["5 servings of fruits", "Live the word of wisdom"],
      mind: ["15+ min of reading M-F", "Learn something new"],
      emotions: ["Write in your journal", "Remember that you are not alone"],
      spirit: [
        "Have meaningful prayer morning and night",
        "Try to be like Jesus in all that we do and say",
      ],
      home: [
        "Read the Book of Mormon together every day",
        "Pray for help to be more like Jesus Christ",
      ],
    };

    for (const [id, [first, last]] of Object.entries(edges)) {
      const { items } = sectionById(id);
      expect(items[0]).toBe(first);
      expect(items[items.length - 1]).toBe(last);
    }
  });

  it("leaves the awkward lines alone", () => {
    // Each of these is a line somebody would be tempted to tidy: the "M-F"
    // shorthand, the abbreviated frequency, and — the one that really matters
    // — the sheet's own "its ok". The paper says what it says.
    expect(sectionById("mind").items).toContain(
      "10 min of math facts worksheets M-F",
    );
    expect(sectionById("body").items).toContain("Shower and bathe 3x week");
    expect(sectionById("home").items).toContain(
      "Remember we all make mistakes, and its ok",
    );
  });

  it("uses typographic apostrophes, the one change that is allowed", () => {
    for (const section of HEALTH_SECTIONS) {
      for (const item of section.items) {
        expect(item).not.toContain("'");
      }
    }
  });
});

describe("finding one", () => {
  it("returns the section for a known id", () => {
    expect(findHealthSection("spirit")?.title).toBe("Healthy Spirit");
  });

  it("returns undefined for anything else, so a bad URL can 404", () => {
    expect(findHealthSection("healthy-hair")).toBeUndefined();
  });
});

describe("the card", () => {
  it("links to its own list and says how long it is", () => {
    render(<HealthSectionCard section={sectionById("home")} />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/health/home");
    expect(within(link).getByText("How to Keep the Spirit in Our Home")).toBeTruthy();
    expect(within(link).getByText("20 things")).toBeTruthy();
  });

  it("hides the drawing from screen readers — the title already says it", () => {
    const { container } = render(
      <HealthSectionCard section={sectionById("body")} />,
    );
    const art = container.querySelector("svg[role='presentation']");
    expect(art?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the list", () => {
  it("renders every line, numbered, in printed order", () => {
    const section = sectionById("emotions");
    render(<HealthList section={section} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(section.items.length);
    items.forEach((item, index) => {
      // The number is decorative; the text is what a screen reader reads out,
      // and `<ol>` supplies the counting.
      expect(item.textContent).toContain(section.items[index]);
    });
  });

  it("counts with a real ordered list rather than typed-in numbers", () => {
    const { container } = render(<HealthList section={sectionById("spirit")} />);
    expect(container.querySelector("ol")).toBeTruthy();
  });
});

describe("reaching it", () => {
  it("is on the dashboard", () => {
    const item = NAV_ITEMS.find((entry) => entry.href === "/health");
    expect(item).toBeDefined();
    expect(item!.icon).toBe("health");
  });
});
