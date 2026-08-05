/**
 * The five lists that hang on the wall at home.
 *
 * ---------------------------------------------------------------------------
 * THESE ARE TRANSCRIPTIONS, NOT COPY
 * ---------------------------------------------------------------------------
 * Every string in `items` below was typed off a photograph of the printed
 * sheet taped up in the house, word for word and in the printed order. They
 * are the family's own words — nobody else's — and the app's job is to show
 * them, not to improve them.
 *
 * So: **do not reword an item to make it read better.** If a line should say
 * something different, change the paper first and then change this file to
 * match, so the wall and the phone never disagree. `tests/health.test.ts`
 * locks the counts and a sample of the exact wording in place, which is what
 * catches a well-meaning tidy-up in review.
 *
 * One deliberate exception, and only one: typographic punctuation. The printer
 * emitted straight quotes; the app uses real apostrophes (’) so the text sets
 * properly next to everything else. No words are changed by that.
 *
 * `intro` and `blurb` ARE the app's own writing — a friendly line for children
 * arriving at a list of twenty rules. They are clearly separated from `items`
 * on the page for exactly that reason.
 */

/** The five sheets. Order here is the order on the page. */
export type HealthSectionId =
  | "body"
  | "mind"
  | "emotions"
  | "spirit"
  | "home";

export type HealthSection = {
  id: HealthSectionId;
  /** The heading exactly as printed at the top of the sheet. */
  title: string;
  /** Ours: two or three words on the card, under the title. */
  blurb: string;
  /** Ours: one friendly sentence at the top of the section's own page. */
  intro: string;
  /** The list, verbatim and in printed order. */
  items: readonly string[];
};

export const HEALTH_SECTIONS: readonly HealthSection[] = [
  {
    id: "body",
    title: "Healthy Body",
    blurb: "Food, water, moving and washing.",
    intro:
      "Eleven ways to look after the body Heavenly Father gave you — most of them are things you can do before bedtime tonight.",
    items: [
      "5 servings of fruits",
      "5 servings of vegetables",
      "8 cups of water",
      "60 min of physical activity",
      "Brush and floss teeth",
      "Wash hands regularly",
      "Shower and bathe 3x week",
      "Dress modestly",
      "Speak lovingly about your body",
      "Limit sugary and high fat foods",
      "Live the word of wisdom",
    ],
  },
  {
    id: "mind",
    title: "Healthy Mind",
    blurb: "Reading, practising and wondering.",
    intro:
      "Seven ways to keep your brain busy and growing. The first three are for school days, Monday to Friday.",
    items: [
      "15+ min of reading M-F",
      "10 min of math facts worksheets M-F",
      "Piano practice M-F",
      "5 min of quiet pondering",
      "Explore outside",
      "Learn and read about your interests",
      "Learn something new",
    ],
  },
  {
    id: "emotions",
    title: "Healthy Emotions",
    blurb: "What to do with a big feeling.",
    intro:
      "Nine things to try when you feel sad, cross, worried or wobbly. Any one of them is a good place to start.",
    items: [
      "Write in your journal",
      "Go for a walk",
      "Talk about your feelings",
      "Take a slow deep breath",
      "Ask yourself if you are hungry or tired",
      "Talk to Mommy and Daddy",
      "Talk to Heavenly Father about how you feel",
      "Remember Jesus Christ",
      "Remember that you are not alone",
    ],
  },
  {
    id: "spirit",
    title: "Healthy Spirit",
    blurb: "Prayer, scriptures and starting over.",
    intro:
      "Twelve ways to look after the part of you that never wears out.",
    items: [
      "Have meaningful prayer morning and night",
      "Keep a gratitude journal",
      "Study Book of Mormon everyday",
      "Repent everyday of your mistakes",
      "Strive to keep your thoughts pure and clean",
      "Serve family, friends, and those in need",
      "Don’t judge others",
      "Be quick to forgive yourself and others",
      "Be quick to obey",
      "Prepare to enter the Temple",
      "Exercise hope and faith on hard days",
      "Try to be like Jesus in all that we do and say",
    ],
  },
  {
    id: "home",
    title: "How to Keep the Spirit in Our Home",
    blurb: "The twenty for all of us together.",
    intro:
      "The longest list, and the only one that is about all seven of us at once. Nobody manages twenty in a day — pick the one this house needs right now.",
    items: [
      "Read the Book of Mormon together every day",
      "Pray together",
      "Be kind",
      "Be patient",
      "Be gentle",
      "Be loving",
      "Forgive and forget",
      "Help someone in need",
      "Use kind words",
      "Say you’re sorry",
      "Admit when you’re wrong",
      "Listen to others",
      "Take a walk when you’re mad",
      "Talk instead of yell",
      "Talk things through with love after a fight",
      "Let people make their own choices",
      "Respect others",
      "Remember we all make mistakes, and its ok",
      "Keep trying, that’s the most important thing",
      "Pray for help to be more like Jesus Christ",
    ],
  },
] as const;

/** How many things there are to do altogether. */
export const HEALTH_ITEM_COUNT = HEALTH_SECTIONS.reduce(
  (total, section) => total + section.items.length,
  0,
);

/** Look one up by id. Returns undefined so a bad URL can 404 rather than 500. */
export function findHealthSection(
  id: string,
): HealthSection | undefined {
  return HEALTH_SECTIONS.find((section) => section.id === id);
}
