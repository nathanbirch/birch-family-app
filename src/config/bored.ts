/**
 * The Bored Page.
 *
 * ---------------------------------------------------------------------------
 * THE DESIGN CONSTRAINT IS "AS FEW WORDS AS POSSIBLE"
 * ---------------------------------------------------------------------------
 * James is four and cannot read. Every other page in this app can lean on a
 * sentence when it needs to; this one cannot, because the child most likely to
 * be bored is the one least able to read their way out of it.
 *
 * So the whole page is pictures. Three of them to start — Inside, Outside,
 * Money — and then a grid of pictures behind each. Every label below is one or
 * two words, and none of them is load-bearing: a child who cannot read a
 * single one of them can still use the page, because the drawing *is* the
 * idea. `docs/bored.md` has the rule written down so it survives the next
 * person's urge to add an explanatory paragraph.
 *
 * That is also why there is no "how to play" text, no instructions, no
 * encouragement copy, and no empty-state prose. A bored child wants a picture
 * of a trampoline, not a paragraph about the value of unstructured play.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE IS IN THE DATABASE
 * ---------------------------------------------------------------------------
 * These are ideas, not state. Nothing is ticked, earned, spent or remembered,
 * so there is nothing to store and the page works offline the moment it has
 * been opened once — exactly like the mantras and the health lists.
 *
 * The Dad Bucks prices are the one thing here a parent will actually want to
 * change. They are plain numbers in this file: edit and redeploy. When Rewards
 * is built and the app starts *tracking* a balance, the prices should move to
 * the database for the same reason the pet rotation did — so they can change
 * without a deploy. Until then, a config file is honest about what this is.
 */

/* ------------------------------------------------------------------ */
/* Dad Bucks                                                           */
/* ------------------------------------------------------------------ */

/**
 * The Dad Bucks symbol.
 *
 * `Đ` is a real Unicode character (U+0110, "D with stroke"), which matters
 * more than it sounds: a currency mark drawn as an image would not be
 * selectable, would not scale with the text, and would need a second asset for
 * every theme. This is just a letter, so it inherits the font, the weight and
 * the colour of whatever it sits in.
 *
 * The barred letter is what every real currency mark does — ₿, ₽, ₹, ¥, £ all
 * take a letter and strike it through — so it reads as *money* rather than as
 * an initial, while still obviously being D for Dad. It is on the keyboard of
 * exactly nobody, which is a feature: it cannot be typed by accident into a
 * chore label somewhere else and be mistaken for a price.
 *
 * Written before the number, as English does with £5 and $5 — `Đ5`.
 */
export const DAD_BUCK = "Đ";

/** e.g. `Đ5`. The only place the symbol and the number are joined. */
export function formatDadBucks(amount: number): string {
  return `${DAD_BUCK}${amount}`;
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export type BoredCategoryId = "inside" | "outside" | "money";

export type BoredCategory = {
  id: BoredCategoryId;
  /** One word. It is a label on a picture, not a heading. */
  title: string;
  ideas: readonly BoredIdea[];
};

export type BoredIdea = {
  /** Stable key, and the key into `BORED_ART`. Never reused for something else. */
  id: string;
  /** One or two words. Three is already too many. */
  label: string;
  /** Money ideas only: what it pays, in Dad Bucks. */
  price?: number;
};

/**
 * Inside.
 *
 * Ordered roughly quietest to busiest, which is the order a parent scanning
 * over a child's shoulder at 7pm will want — but the grid means nobody has to
 * scroll past the quiet ones to reach Lego, so the order is a nicety rather
 * than a rule.
 */
const INSIDE: readonly BoredIdea[] = [
  { id: "reading", label: "Reading" },
  { id: "drawing", label: "Drawing" },
  { id: "writing", label: "Write a story" },
  { id: "puzzle", label: "Puzzle" },
  { id: "lego", label: "Lego" },
  { id: "blocks", label: "Blocks" },
  { id: "playdough", label: "Play-dough" },
  { id: "cards", label: "Cards" },
  { id: "boardgame", label: "Board game" },
  { id: "piano", label: "Piano" },
  { id: "baking", label: "Baking" },
  { id: "fort", label: "Build a fort" },
] as const;

/**
 * Outside.
 *
 * Kubb and croquet are in here because they are in the shed and get forgotten,
 * which is the entire point of this page: a bored child does not need new
 * things, they need to be reminded of the things they already have.
 */
const OUTSIDE: readonly BoredIdea[] = [
  { id: "trampoline", label: "Trampoline" },
  { id: "basketball", label: "Basketball" },
  { id: "bike", label: "Bike" },
  { id: "scooter", label: "Scooter" },
  { id: "hammock", label: "Hammock" },
  { id: "walk", label: "Go for a walk" },
  { id: "climb", label: "Climb a tree" },
  { id: "chalk", label: "Chalk" },
  { id: "bubbles", label: "Bubbles" },
  { id: "bugs", label: "Find bugs" },
  { id: "kubb", label: "Kubb" },
  { id: "croquet", label: "Croquet" },
] as const;

/**
 * Money.
 *
 * **Sorted cheapest first, deliberately.** A child with ten minutes and a
 * child with a whole Saturday are looking for opposite ends of this list, and
 * price ascending puts the quick ones where a thumb already is. It also means
 * the list needs no headings, no filters and no explanation — the order is the
 * explanation.
 *
 * The five the family already had are here at their existing rates. The rest
 * were added to fill the gaps in between, so there is always something worth
 * doing at every amount from one to ten rather than a cliff between Đ5 and
 * Đ10. Shovelling is on the list because this is Rexburg and it will be
 * needed for five months of the year.
 */
const MONEY: readonly BoredIdea[] = [
  // Đ1 *per can*, by the singular-label rule below: wheeling all three out is
  // three jobs, not one, which is how the family actually counts it.
  { id: "trash", label: "Take out a trash can", price: 1 },
  { id: "weeds", label: "Pick 10 weeds", price: 2 },
  { id: "sweep", label: "Sweep the kitchen", price: 2 },
  /*
   * Đ2 *per window*, which the singular label carries on its own.
   *
   * A `perUnit` field and a "each" suffix on the pill were the obvious way to
   * say this, and both are unnecessary: a singular label already means a unit
   * rate everywhere else on this list — "Clean a room", "Do a load", "Wipe a
   * bathroom", "Put away a basket" are all one-of-them-for-that-price. "Wash a
   * window · Đ2" reads the same way, in the same shape, with no new field and
   * no extra word. Which is the rule this page is built on.
   */
  { id: "windows", label: "Wash a window", price: 2 },
  // "Do a load of laundry" in the family's own words, cut to three because the
  // washing-machine drawing already says "laundry" and the label rule wins.
  { id: "laundry-wash", label: "Do a load", price: 3 },
  { id: "dishwasher", label: "Empty the dishwasher", price: 3 },
  { id: "bathroom", label: "Wipe a bathroom", price: 4 },
  { id: "room", label: "Clean a room", price: 5 },
  { id: "laundry-away", label: "Put away a basket", price: 5 },
  { id: "leaves", label: "Rake the leaves", price: 6 },
  { id: "car-wash", label: "Wash the car", price: 8 },
  { id: "snow", label: "Shovel the snow", price: 8 },
  // Dearer than washing the outside of it, which is the right way round:
  // seven people live in that car.
  { id: "car-inside", label: "Clean out the car", price: 9 },
  { id: "vacuum", label: "Vacuum downstairs", price: 10 },
  { id: "lawn", label: "Mow the lawn", price: 10 },
] as const;

export const BORED_CATEGORIES: readonly BoredCategory[] = [
  { id: "inside", title: "Inside", ideas: INSIDE },
  { id: "outside", title: "Outside", ideas: OUTSIDE },
  { id: "money", title: "Money", ideas: MONEY },
] as const;

/** Look one up by the value in the URL. `null` for anything else, so the page 404s. */
export function findBoredCategory(id: string): BoredCategory | null {
  return BORED_CATEGORIES.find((category) => category.id === id) ?? null;
}

/** Every idea across every category — used by the art and id tests. */
export const ALL_BORED_IDEAS: readonly BoredIdea[] = BORED_CATEGORIES.flatMap(
  (category) => category.ideas,
);
