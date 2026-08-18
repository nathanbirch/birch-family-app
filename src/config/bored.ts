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
 * THIS FILE IS NOW THE *DEFAULTS*, NOT THE LIST
 * ---------------------------------------------------------------------------
 * It used to say, at length, that nothing here was in the database: these were
 * ideas rather than state, nothing was ticked or remembered, so there was
 * nothing to store.
 *
 * That stopped being true the moment the family could add an idea from inside
 * the app. An idea somebody types on a phone has to outlive the phone, be
 * visible on every other one, and survive a deploy — which is the same argument
 * the pet rotation won, and it is answered the same way: the `boredIdeas`
 * collection is the list, and the arrays below are what it is **seeded** from
 * and what the page falls back to when the database cannot be reached.
 *
 * So the thirty-nine ideas below are still the right place to add or retire a
 * *built-in* one, and still where the drawings' ids are declared. What they no
 * longer are is the whole list. See docs/bored.md and `lib/bored/store.ts`.
 *
 * The Dad Bucks prices are the one thing here a parent will actually want to
 * change. They are still plain numbers in this file — edit, redeploy, and the
 * seed leaves the existing rows alone, so **changing a price here does not
 * change it in the database**. That is the one trap this move introduced, and
 * `docs/bored.md` says how to re-price a job properly.
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

/* ------------------------------------------------------------------ */
/* Adding one from inside the app                                      */
/* ------------------------------------------------------------------ */

/**
 * The longest a family-added label may be.
 *
 * Twenty characters, which is not an arbitrary round number: it is the length of
 * the longest built-in label ("Take out a trash can", "Empty the dishwasher"),
 * so anything that fits the box is known to fit a tile without wrapping to a
 * third line. The box enforces it with `maxLength` as well, so nobody types a
 * sentence and then loses half of it.
 */
export const IDEA_LABEL_MAX_LENGTH = 20;

/**
 * A family-added money job's price, in Dad Bucks.
 *
 * A job with no price is not a job on this list — the whole Money grid is
 * ordered by price and read by price. So the Money form asks for one, and these
 * are the bounds it accepts: nothing is free, and nothing a child invents is
 * worth more than mowing the lawn.
 */
export const IDEA_PRICE_MIN = 1;
export const IDEA_PRICE_MAX = 10;
/** What the Money form starts on. Middle of the list, so it is rarely wrong. */
export const IDEA_PRICE_DEFAULT = 5;

/**
 * The pictures a family-added idea can choose from.
 *
 * ---------------------------------------------------------------------------
 * WHY A FIXED LIST AND NOT A TEXT FIELD
 * ---------------------------------------------------------------------------
 * The obvious build is one more input and let people type an emoji into it. On a
 * phone that means opening the emoji keyboard, and on this page that is the wrong
 * answer twice over: the child this feature is for cannot navigate an emoji
 * keyboard, and a free-text field would accept anything at all — a letter, a
 * paragraph, a zero-width joiner sequence that renders as a box on one device and
 * a family of four on another.
 *
 * A fixed list is a *picker*: every option is one tap, every option is known to
 * render, and the Server Action can check the choice against this list rather
 * than trying to decide whether an arbitrary string is "an emoji" — which is a
 * genuinely hard question and not one worth answering here.
 *
 * Every entry is one code point, or one code point plus a variation selector.
 * No skin tones and no joined sequences, for the same reason: one character, one
 * glyph, everywhere. A test asserts it, which is what stops somebody pasting in a
 * 👨‍👩‍👧‍👦 that renders as four boxes on the iPad in the kitchen.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER IS THE ONLY NAVIGATION IT HAS
 * ---------------------------------------------------------------------------
 * There is no search box and no category tabs, which at nearly three hundred
 * pictures is a decision rather than an omission: a search box needs a word, and
 * the whole point of a picture is that the child using it has not got one.
 *
 * So it is grouped, and the groups are in the order somebody scans them. Faces
 * first, because that is what a child looks for first and what they will use for
 * half of what they add; then animals, then the world outside, then food, then the
 * things you do and the things you do them with. A trampoline is near the other
 * bouncy things. Keep an addition inside its group rather than appending it to the
 * end, or the order stops being navigation.
 */
export const BORED_EMOJI: readonly string[] = [
  // Faces, and how the day is going
  "😀", "😃", "😄", "😁", "🤣", "😂", "🙂", "😉", "😊", "😇",
  "🥰", "😍", "🤩", "😘", "😋", "😜", "🤪", "🧐", "🤓", "😎",
  "🥳", "😏", "😌", "😔", "🙁", "😣", "😫", "🥺", "😭", "😤",
  "😡", "🤯", "😳", "🥵", "🥶", "😱", "🤗", "🤔",
  // People, hands and the odd body part
  "👶", "🧒", "👦", "👧", "🧑", "🧓", "👋", "👌", "👍", "👏",
  "🙌", "🤝", "💪", "👀", "👣", "🧠", "💤", "🧘", "🏃", "🚶",
  // Animals
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
  "🦁", "🐮", "🐷", "🐸", "🐵", "🙈", "🐔", "🐧", "🐦", "🐤",
  "🦆", "🦅", "🦉", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞",
  "🕷️", "🐢", "🐍", "🦎", "🐙", "🦀", "🐠", "🐟",
  // Growing things, weather, sky
  "🌳", "🌲", "🌵", "🌴", "🪴", "🌱", "🌿", "🍀", "🍂", "🍄",
  "🌸", "🌻", "🌷", "💐", "☀️", "⛅", "☁️", "🌧️", "⛈️", "❄️",
  "⛄", "💨", "🌪️", "🌈", "☔", "⚡", "🔥", "💧", "🌊", "🌙",
  // Food and drink
  "🍎", "🍐", "🍊", "🍌", "🍉", "🍇", "🍓", "🍒", "🍍", "🥝",
  "🍅", "🥑", "🥕", "🌽", "🥒", "🥦", "🥔", "🍞", "🥨", "🥞",
  "🧀", "🥚", "🍳", "🍗", "🌭", "🍔", "🍟", "🍕", "🥪", "🌮",
  "🥗", "🍝", "🍜", "🍲", "🍣", "🥟", "🍦", "🍩", "🍪", "🎂",
  // Making, playing, reading
  "🧩", "🪀", "🧸", "🪁", "🎲", "🃏", "🎯", "🎳", "🎮", "🕹️",
  "🎪", "🎨", "🖌️", "🖍️", "✏️", "📝", "📚", "📖", "✂️", "📏",
  "🧵", "🧶",
  // Music and noise
  "🎵", "🎶", "🎹", "🎸", "🎻", "🥁", "🎺", "🎷", "🪗", "🎤",
  "🎧", "📻",
  // Sport and out of doors
  "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🎱", "🏓", "🏸", "🥊",
  "⛳", "🏹", "🎣", "🛹", "🛼", "🛴", "🚲", "🏆", "🥇", "👟",
  "🥾", "🎒", "🔭", "🧭",
  // House and jobs
  "🧹", "🧽", "🧼", "🚿", "🛁", "🪠", "🪣", "🛏️", "🛋️", "🪑",
  "🚪", "🪟", "🗑️", "🧻", "🔨", "🪛", "🔧", "🧰", "🔑", "📦",
  "🛒", "🧺", "👕", "🧦",
  // Getting about
  "🚗", "🚙", "🚌", "🚚", "🚜", "🛵", "🚂", "🚁", "✈️", "🚀",
  "⛵", "🏠", "🎡", "🎠",
  // Odds and ends
  "❤️", "💛", "💚", "💙", "💜", "💖", "🎁", "🎈", "🎉", "🎀",
  "💰", "💵", "💎", "📷", "🎥", "📺", "📱", "💻", "⏰", "⏳",
  "🔍", "💡", "🎫", "🎓",
] as const;

/** Is this one of the pictures the picker actually offers? */
export function isBoredEmoji(value: string): boolean {
  return BORED_EMOJI.includes(value);
}

/** Is this a price a job on this page may pay? */
export function isUsablePrice(amount: number): boolean {
  return (
    Number.isInteger(amount) &&
    amount >= IDEA_PRICE_MIN &&
    amount <= IDEA_PRICE_MAX
  );
}

/** What the picker starts on for each category, so nothing is ever unchosen. */
export const DEFAULT_EMOJI: Record<BoredCategoryId, string> = {
  inside: "🧩",
  outside: "🌳",
  money: "💰",
};
