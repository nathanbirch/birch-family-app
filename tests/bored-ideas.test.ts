import { describe, expect, it } from "vitest";

import {
  ALL_BORED_IDEAS,
  BORED_CATEGORIES,
  BORED_EMOJI,
  DEFAULT_EMOJI,
  IDEA_LABEL_MAX_LENGTH,
  IDEA_PRICE_DEFAULT,
  IDEA_PRICE_MAX,
  IDEA_PRICE_MIN,
  isBoredEmoji,
  isUsablePrice,
} from "@/config/bored";
import {
  compiledItems,
  isCustomIdeaId,
  isUsableLabel,
  newIdeaId,
  normaliseLabel,
  normalisePrice,
  sortCategoryItems,
  toBoredItem,
  type BoredItem,
} from "@/lib/bored/ideas";

/*
 * The rules that decide what a family-added idea is allowed to be, and where it
 * lands. Everything here is pure, and all of it guards a page whose premise is
 * that the picture is readable and the word is optional.
 */

function item(overrides: Partial<BoredItem> = {}): BoredItem {
  return {
    id: newIdeaId(),
    label: "Bake",
    price: null,
    emoji: "🍪",
    custom: true,
    ...overrides,
  };
}

describe("ids for the family's own ideas", () => {
  it("are all prefixed, and recognised", () => {
    const id = newIdeaId();
    expect(id.startsWith("own-")).toBe(true);
    expect(isCustomIdeaId(id)).toBe(true);
  });

  it("do not repeat themselves", () => {
    const ids = new Set(Array.from({ length: 500 }, newIdeaId));
    expect(ids.size).toBe(500);
  });

  it("can never collide with a built-in's, which is what the prefix is for", () => {
    /*
     * The id is the key into the drawings. An id that collided with a built-in's
     * would silently swap a child's chosen emoji for a picture of a trampoline —
     * so the namespace has to be one no built-in is in, and this is the assertion
     * that keeps it that way when somebody adds the fortieth idea.
     */
    for (const idea of ALL_BORED_IDEAS) {
      expect(idea.id.startsWith("own-"), idea.id).toBe(false);
      expect(isCustomIdeaId(idea.id), idea.id).toBe(false);
    }
  });

  it("refuses anything that is not one", () => {
    // The Server Action's only gate on which rows may be deleted.
    for (const bad of ["", "lego", "own-", "own-SHOUTING1", "own-toolongtobeone", "OWN-abcdefghij"]) {
      expect(isCustomIdeaId(bad), bad).toBe(false);
    }
  });
});

describe("what was typed", () => {
  it("is trimmed and has its whitespace collapsed", () => {
    expect(normaliseLabel("  build   a  den \n")).toBe("build a den");
  });

  it("is cut to the ceiling rather than refused", () => {
    // Somebody typing a long idea into a short box should get an idea, not an
    // error. The box stops them first; this makes it true of the stored value.
    const long = "a".repeat(IDEA_LABEL_MAX_LENGTH + 30);
    expect(normaliseLabel(long)).toHaveLength(IDEA_LABEL_MAX_LENGTH);
  });

  it("is nothing at all when it is only whitespace", () => {
    expect(isUsableLabel("   ")).toBe(false);
    expect(isUsableLabel("\n\t")).toBe(false);
    expect(isUsableLabel(" x")).toBe(true);
  });

  it("fits the tile, because the ceiling is the longest built-in label", () => {
    /*
     * Twenty is not a round number picked for looking tidy: it is the length of
     * the longest label already on the page, so anything that fits the box is
     * known to fit a tile without wrapping to a third line.
     */
    const longest = Math.max(...ALL_BORED_IDEAS.map((idea) => idea.label.length));
    expect(IDEA_LABEL_MAX_LENGTH).toBeGreaterThanOrEqual(longest);
  });
});

describe("what a job pays", () => {
  it("takes a whole number of Dad Bucks inside the range", () => {
    expect(normalisePrice("money", IDEA_PRICE_MIN)).toBe(IDEA_PRICE_MIN);
    expect(normalisePrice("money", IDEA_PRICE_MAX)).toBe(IDEA_PRICE_MAX);
    expect(normalisePrice("money", IDEA_PRICE_DEFAULT)).toBe(IDEA_PRICE_DEFAULT);
  });

  it("refuses free, fractional and extravagant", () => {
    for (const bad of [0, -1, 2.5, IDEA_PRICE_MAX + 1, Number.NaN, "3", null]) {
      expect(normalisePrice("money", bad), String(bad)).toBeNull();
    }
  });

  it("is nothing at all on the two categories that have no prices", () => {
    // Which is also how a price smuggled onto an Inside idea is dropped: the
    // category decides, not the caller.
    expect(normalisePrice("inside", 5)).toBeNull();
    expect(normalisePrice("outside", 5)).toBeNull();
  });

  it("agrees with the picker about what is offerable", () => {
    expect(isUsablePrice(IDEA_PRICE_DEFAULT)).toBe(true);
    expect(isUsablePrice(0)).toBe(false);
    expect(isUsablePrice(IDEA_PRICE_MAX + 1)).toBe(false);
    expect(isUsablePrice(1.5)).toBe(false);
  });
});

describe("the pictures the picker offers", () => {
  it("has no duplicates", () => {
    expect(new Set(BORED_EMOJI).size).toBe(BORED_EMOJI.length);
  });

  it("is enough to choose from and few enough to scroll past", () => {
    /*
     * The ceiling used to be 120 and the list used to be 72. It is nearly three
     * hundred now, and the number that actually matters changed with it: the rail
     * is four rows deep and scrolls sideways, so this is really a statement about
     * how many *columns* a thumb has to push through. A hundred columns is about
     * the point where a picker needs a search box, and a search box needs a word —
     * which is the one thing the child using this has not got.
     */
    expect(BORED_EMOJI.length).toBeGreaterThanOrEqual(200);
    expect(Math.ceil(BORED_EMOJI.length / 4)).toBeLessThanOrEqual(100);
  });

  it("leads with faces, which is what a child looks for first", () => {
    // The order is the only navigation this rail has — there is no search and
    // there are no tabs. See the note above `BORED_EMOJI`.
    expect(BORED_EMOJI.slice(0, 12).every((emoji) => /\p{Emoji_Presentation}/u.test(emoji))).toBe(
      true,
    );
    expect(BORED_EMOJI[0]).toBe("😀");
  });

  it("recognises its own and nothing else", () => {
    /*
     * This is the whole validation strategy: the action checks membership rather
     * than trying to decide whether an arbitrary string is "an emoji", which is a
     * genuinely hard question. So the answer for anything not on the list has to
     * be no — including a letter, which is what a hand-edited row would put where
     * the page promises a picture.
     */
    expect(isBoredEmoji(BORED_EMOJI[0])).toBe(true);
    for (const bad of ["", "x", "Trampoline", "🧩🧩", "<svg/>"]) {
      expect(isBoredEmoji(bad), bad).toBe(false);
    }
  });

  it("stays short enough per glyph to render as one picture", () => {
    // No joined sequences and no skin tones: one character, one glyph, on every
    // device. A variation selector is allowed, which is the second code unit on a
    // handful of them.
    for (const emoji of BORED_EMOJI) {
      expect([...emoji].length, emoji).toBeLessThanOrEqual(2);
    }
  });

  it("starts every category on one of them", () => {
    for (const category of BORED_CATEGORIES) {
      expect(isBoredEmoji(DEFAULT_EMOJI[category.id]), category.id).toBe(true);
    }
  });
});

describe("where a new idea lands in the grid", () => {
  it("sorts Money by price, so a cheap job added last is not stranded at the end", () => {
    /*
     * The rule that used to be a property of the order the array happened to be
     * written in, and now has to be enforced: price ascending is the only thing
     * that makes the Money grid legible without headings or a filter, and an
     * appended Đ2 job would break it. See docs/bored.md.
     */
    const sorted = sortCategoryItems("money", [
      item({ label: "Dear", price: 9 }),
      item({ label: "Cheap", price: 1 }),
      item({ label: "Middling", price: 5 }),
    ]);
    expect(sorted.map((entry) => entry.label)).toEqual(["Cheap", "Middling", "Dear"]);
  });

  it("keeps the curated order on Inside, with the family's own at the end", () => {
    const builtIn = compiledItems().inside;
    const sorted = sortCategoryItems("inside", [
      item({ label: "Ours" }),
      ...builtIn,
    ]);
    expect(sorted.map((entry) => entry.label).slice(0, builtIn.length)).toEqual(
      builtIn.map((entry) => entry.label),
    );
    expect(sorted[sorted.length - 1].label).toBe("Ours");
  });

  it("is stable, so two jobs at one price keep the order they came in", () => {
    const sorted = sortCategoryItems("money", [
      item({ label: "First", price: 3 }),
      item({ label: "Second", price: 3 }),
    ]);
    expect(sorted.map((entry) => entry.label)).toEqual(["First", "Second"]);
  });

  it("does not lose anything", () => {
    for (const category of BORED_CATEGORIES) {
      const items = [...compiledItems()[category.id], item({ label: "Ours" })];
      expect(sortCategoryItems(category.id, items)).toHaveLength(items.length);
    }
  });
});

describe("the compiled defaults", () => {
  it("are every idea in the config, in the page's shape", () => {
    const compiled = compiledItems();
    for (const category of BORED_CATEGORIES) {
      expect(compiled[category.id].map((entry) => entry.id)).toEqual(
        category.ideas.map((idea) => idea.id),
      );
    }
  });

  it("marks none of them as the family's own", () => {
    // Which is what stops a cross appearing on a built-in tile, and what stops the
    // store treating a seeded row as one somebody added.
    for (const items of Object.values(compiledItems())) {
      for (const entry of items) expect(entry.custom).toBe(false);
    }
  });

  it("gives a built-in no emoji, because it has a drawing", () => {
    for (const items of Object.values(compiledItems())) {
      for (const entry of items) expect(entry.emoji).toBeNull();
    }
  });

  it("turns a missing price into null rather than undefined", () => {
    // The tile checks `price !== null`, and `undefined` would slip through it.
    const inside = toBoredItem({ id: "lego", label: "Lego" });
    expect(inside.price).toBeNull();
    const money = toBoredItem({ id: "lawn", label: "Mow the lawn", price: 10 });
    expect(money.price).toBe(10);
  });
});
