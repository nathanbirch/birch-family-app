/**
 * The Bored Page.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS WORTH TESTING HERE
 * ---------------------------------------------------------------------------
 * There is no date maths, no database and no state, so the usual sources of
 * quiet wrongness are absent. What is left is the thing that would actually
 * break this page for the child it was built for: **a missing drawing**.
 *
 * `BoredArt` returns null for an unknown id rather than throwing, which is the
 * right runtime behaviour — a gap on a page beats a blank page — and it means
 * a typo'd id would ship silently as an empty tile with a word under it, on
 * the one page whose entire premise is that the word is optional. So the first
 * test below walks every idea in the config and asserts a drawing exists.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BoredArt, BORED_ART_IDS, BORED_PALETTE } from "@/components/bored/BoredArt";
import { IdeaCard } from "@/components/bored/IdeaCard";
import {
  ALL_BORED_IDEAS,
  BORED_CATEGORIES,
  DAD_BUCK,
  findBoredCategory,
  formatDadBucks,
} from "@/config/bored";
import { NAV_ITEMS } from "@/config/navigation";

describe("every idea has a picture", () => {
  /*
   * The whole page is pictures. An idea without one is a blank square with a
   * word under it — which is precisely the failure this page exists to avoid,
   * and it would look fine to anybody who can read.
   */
  it.each(ALL_BORED_IDEAS.map((idea) => [idea.id, idea.label]))(
    "%s (%s) is drawn",
    (id) => {
      expect(BORED_ART_IDS).toContain(id);

      const { container } = render(<BoredArt id={id} />);
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      // A drawing, not an empty frame.
      expect(svg!.children.length).toBeGreaterThan(0);
    },
  );

  it("has no drawing for an idea that no longer exists", () => {
    // The other direction: a retired idea should take its drawing with it,
    // rather than leaving dead SVG nobody can find a use for.
    const configured = new Set(ALL_BORED_IDEAS.map((idea) => idea.id));
    expect(BORED_ART_IDS.filter((id) => !configured.has(id))).toEqual([]);
  });

  it("renders nothing, rather than throwing, for an unknown id", () => {
    // A gap on a page beats a blank page — this is a page a child opens when
    // they are already fed up.
    const { container } = render(<BoredArt id="not-a-real-idea" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("the three categories", () => {
  it("is Inside, Outside and Money, in that order", () => {
    expect(BORED_CATEGORIES.map((category) => category.id)).toEqual([
      "inside",
      "outside",
      "money",
    ]);
  });

  it("gives each one a picture and a colour", () => {
    for (const category of BORED_CATEGORIES) {
      expect(BORED_PALETTE[category.id]).toBeDefined();
    }
  });

  it("resolves a real id and refuses anything else", () => {
    expect(findBoredCategory("inside")?.title).toBe("Inside");
    for (const bad of ["", "Inside", "indoors", "../health", "money "]) {
      expect(findBoredCategory(bad), bad).toBeNull();
    }
  });

  it("uses ids that are unique across every category", () => {
    const ids = ALL_BORED_IDEAS.map((idea) => idea.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("as few words as possible", () => {
  /*
   * The page's one design rule, asserted rather than left to good intentions.
   * A label is a caption on a picture; the moment one grows into a sentence,
   * the drawing has stopped carrying its weight.
   */
  it("keeps every label to four words or fewer", () => {
    for (const idea of ALL_BORED_IDEAS) {
      const words = idea.label.trim().split(/\s+/);
      expect(words.length, `${idea.id}: "${idea.label}"`).toBeLessThanOrEqual(4);
    }
  });

  it("keeps every label short enough not to wrap to three lines", () => {
    for (const idea of ALL_BORED_IDEAS) {
      expect(idea.label.length, idea.id).toBeLessThanOrEqual(22);
    }
  });

  it("gives every category a one-word title", () => {
    for (const category of BORED_CATEGORIES) {
      expect(category.title.split(/\s+/)).toHaveLength(1);
    }
  });
});

describe("Dad Bucks", () => {
  it("prices every money idea, and nothing else", () => {
    const money = findBoredCategory("money")!;
    for (const idea of money.ideas) {
      expect(idea.price, idea.id).toBeGreaterThan(0);
    }

    for (const category of BORED_CATEGORIES.filter((c) => c.id !== "money")) {
      for (const idea of category.ideas) {
        expect(idea.price, idea.id).toBeUndefined();
      }
    }
  });

  it("writes the symbol before the number, as English does with £5", () => {
    expect(formatDadBucks(5)).toBe(`${DAD_BUCK}5`);
    expect(formatDadBucks(10)).toBe("Đ10");
  });

  it("uses a single character that is not a plain letter D", () => {
    // A currency mark, not an initial — see the note in config/bored.ts.
    expect(DAD_BUCK).toHaveLength(1);
    expect(DAD_BUCK).not.toBe("D");
  });

  it("sorts cheapest first, so a spare ten minutes is at the top", () => {
    const prices = findBoredCategory("money")!.ideas.map((idea) => idea.price!);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it("offers something at every price from the cheapest to the dearest", () => {
    // The point of adding to the family's original five: no cliff between Đ5
    // and Đ10 where nothing is worth doing.
    const prices = findBoredCategory("money")!.ideas.map((idea) => idea.price!);
    expect(Math.min(...prices)).toBe(1);
    expect(Math.max(...prices)).toBe(10);
    for (const [low, high] of prices.map((p, i) => [p, prices[i + 1] ?? p])) {
      expect(high - low, `gap after ${low}`).toBeLessThanOrEqual(2);
    }
  });

  it("keeps the five prices the family already set", () => {
    const byId = new Map(
      findBoredCategory("money")!.ideas.map((idea) => [idea.id, idea.price]),
    );
    expect(byId.get("room")).toBe(5);
    expect(byId.get("laundry-wash")).toBe(3);
    expect(byId.get("laundry-away")).toBe(5);
    expect(byId.get("weeds")).toBe(2);
    expect(byId.get("lawn")).toBe(10);
  });
});

describe("a tile", () => {
  const money = findBoredCategory("money")!;
  const inside = findBoredCategory("inside")!;

  it("shows the price on a money idea", () => {
    render(
      <IdeaCard idea={money.ideas[0]} palette={BORED_PALETTE.money} />,
    );
    expect(screen.getByText(formatDadBucks(money.ideas[0].price!))).toBeTruthy();
  });

  it("shows no price on an idea that is not about money", () => {
    const { container } = render(
      <IdeaCard idea={inside.ideas[0]} palette={BORED_PALETTE.inside} />,
    );
    expect(container.textContent).not.toContain(DAD_BUCK);
  });

  it("is not a link or a button — there is nowhere to go", () => {
    // Tapping "Trampoline" cannot open a trampoline. Making these interactive
    // would promise a child something would happen.
    const { container } = render(
      <IdeaCard idea={inside.ideas[0]} palette={BORED_PALETTE.inside} />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("labels the tile with its idea, and hides the drawing from a screen reader", () => {
    const { container } = render(
      <IdeaCard idea={inside.ideas[0]} palette={BORED_PALETTE.inside} />,
    );
    expect(within(container).getByText(inside.ideas[0].label)).toBeTruthy();
    // The drawing repeats the label; announcing both would say everything twice.
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the page is wired into the app", () => {
  const bored = NAV_ITEMS.find((item) => item.href === "/bored");

  it("appears in the navigation config", () => {
    expect(bored).toBeDefined();
    expect(bored!.icon).toBe("bored");
  });

  it("is reached from the dashboard rather than the bottom bar", () => {
    // The bar holds five and is full. See the long note in config/navigation.ts
    // for why the dashboard is the better home for this page anyway.
    expect(bored!.slot).toBeNull();
  });
});
