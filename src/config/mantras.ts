/**
 * The Birch family mantras.
 *
 * ---------------------------------------------------------------------------
 * THE TWO VOICES ON THIS PAGE, AND WHY THEY MUST NEVER BLUR
 * ---------------------------------------------------------------------------
 * Every entry has two parts, and they are different kinds of thing:
 *
 *   `text` + `meaning`  — OURS. A short phrase this family says to each other,
 *                         and a line about what we mean by it. Change these
 *                         freely; they belong to the Birches.
 *
 *   `quote`             — THEIRS. The words of a real person, reproduced
 *                         exactly as they said them, with the talk, the
 *                         occasion, the date, and a link to the source.
 *
 * The quotes below were each checked word-for-word against the talk on
 * churchofjesuschrist.org (and speeches.byu.edu for the BYU devotional) on
 * 2026-08-04. **If you add one, go and read it in the original first.** Putting
 * words in a living person's mouth — or a dead prophet's — because they sounded
 * about right is the one mistake this file must never make. Where a quote is
 * trimmed, it is trimmed at a sentence boundary and never re-stitched, so what
 * is shown is always something the speaker actually said in that order.
 *
 * `tests/mantras.test.ts` enforces the mechanical half of that: every quote
 * carries an attribution and a working-looking source URL, and no mantra is
 * silently identical to the quote beside it.
 *
 * ---------------------------------------------------------------------------
 * WHO WE LISTEN TO
 * ---------------------------------------------------------------------------
 * President Thomas S. Monson (1927–2018), President Russell M. Nelson, Sister
 * Kristin M. Yee, and President Jeffrey R. Holland — the four the family keeps
 * coming back to.
 */

import type {
  DecorativeIconName,
  NavIconName,
  PlannedIconName,
} from "./navigation";

/** Where a quote came from. Every field is required — no unsourced quotes. */
export type MantraSource = {
  /** The speaker, named as they are in the source. */
  author: string;
  /** Their calling at the time they said it. */
  role: string;
  /** The talk or address title, exactly as published. */
  title: string;
  /** The occasion, e.g. "October 2008 general conference". */
  occasion: string;
  /** Canonical link to the full talk. */
  url: string;
};

export type Mantra = {
  id: string;
  /** What we say. Ours, not theirs. Keep it short enough to say out loud. */
  text: string;
  /** What we mean by it, in the family's own voice. One or two sentences. */
  meaning: string;
  /** The verbatim words that gave us the mantra. Never paraphrased. */
  quote: string;
  source: MantraSource;
  icon: NavIconName | PlannedIconName | DecorativeIconName;
};

const MONSON: Omit<MantraSource, "title" | "occasion" | "url"> = {
  author: "President Thomas S. Monson",
  role: "President of the Church",
};

const NELSON: Omit<MantraSource, "title" | "occasion" | "url"> = {
  author: "President Russell M. Nelson",
  role: "President of the Church",
};

const YEE: Omit<MantraSource, "title" | "occasion" | "url"> = {
  author: "Sister Kristin M. Yee",
  role: "Second Counselor, Relief Society General Presidency",
};

export const MANTRAS: readonly Mantra[] = [
  {
    id: "person-over-problem",
    text: "The person comes before the problem.",
    meaning:
      "Whatever went wrong — the spill, the broken thing, the late homework — the person standing in front of us matters more than the mess. We fix the problem second.",
    quote:
      "Never let a problem to be solved become more important than a person to be loved.",
    source: {
      ...MONSON,
      title: "Finding Joy in the Journey",
      occasion: "October 2008 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2008/10/finding-joy-in-the-journey?lang=eng",
    },
    icon: "mantras",
  },
  {
    id: "say-it-now",
    text: "Say it now.",
    meaning:
      "Say the kind thing while the person is still in the room. Nobody in this family has ever regretted saying “I love you” one time too many.",
    quote: "We will never regret the kind words spoken or the affection shown.",
    source: {
      ...MONSON,
      title: "Finding Joy in the Journey",
      occasion: "October 2008 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2008/10/finding-joy-in-the-journey?lang=eng",
    },
    icon: "stars",
  },
  {
    id: "joy-in-the-journey",
    text: "Find joy in the journey — now.",
    meaning:
      "Not after the house is clean, not after the busy week, not next summer. This Tuesday in Rexburg is the journey.",
    quote: "Find joy in the journey—now.",
    source: {
      ...MONSON,
      title: "Finding Joy in the Journey",
      occasion: "October 2008 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2008/10/finding-joy-in-the-journey?lang=eng",
    },
    icon: "calendar",
  },
  {
    id: "focus-not-circumstance",
    text: "Joy is about where we look.",
    meaning:
      "A hard week is still a hard week. But what we point ourselves at all day decides more about how we feel than the week does.",
    quote:
      "The joy we feel has little to do with the circumstances of our lives and everything to do with the focus of our lives.",
    source: {
      ...NELSON,
      title: "Joy and Spiritual Survival",
      occasion: "October 2016 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2016/10/joy-and-spiritual-survival?lang=eng",
    },
    icon: "stars",
  },
  {
    id: "peacemakers-on-purpose",
    text: "We are peacemakers, on purpose.",
    meaning:
      "Nobody in this house gets dragged into an argument by accident. Walking away, softening your voice, going first with sorry — all of it is a choice, and it is ours to make.",
    quote:
      "Contention is a choice. Peacemaking is a choice. You have your agency to choose contention or reconciliation.",
    source: {
      ...NELSON,
      title: "Peacemakers Needed",
      occasion: "April 2023 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2023/04/47nelson?lang=eng",
    },
    icon: "home",
  },
  {
    id: "charity-is-the-antidote",
    text: "Love is the antidote.",
    meaning:
      "When it is tense between two of us, the cure is never winning. It is charity — deciding to be kind to the person you are annoyed at.",
    quote: "Charity is the antidote to contention.",
    source: {
      ...NELSON,
      title: "Peacemakers Needed",
      occasion: "April 2023 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2023/04/47nelson?lang=eng",
    },
    icon: "rewards",
  },
  {
    id: "think-celestial",
    text: "Think celestial.",
    meaning:
      "Ask the long question. Not “what do I want right now” but “who am I becoming, and who do I want to be with forever?”",
    quote:
      "Mortality is a master class in learning to choose the things of greatest eternal import.",
    source: {
      ...NELSON,
      title: "Think Celestial!",
      occasion: "October 2023 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2023/10/51nelson?lang=eng",
    },
    icon: "stars",
  },
  {
    id: "let-god-prevail",
    text: "Let God prevail.",
    meaning:
      "When what we want and what He asks pull in different directions, He wins. That one decision makes a hundred smaller ones easy.",
    quote:
      "When your greatest desire is to let God prevail, to be part of Israel, so many decisions become easier.",
    source: {
      ...NELSON,
      title: "Let God Prevail",
      occasion: "October 2020 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2020/10/46nelson?lang=eng",
    },
    icon: "home",
  },
  {
    id: "keep-walking",
    text: "Keep walking.",
    meaning:
      "The Birch family answer to a hard thing. Not “cheer up” and not “it doesn’t matter” — just keep going. Say it to each other on the long winter days.",
    quote: "Don’t give up, boy. Don’t you quit. You keep walking. You keep trying.",
    source: {
      author: "Elder Jeffrey R. Holland",
      role: "Quorum of the Twelve Apostles",
      title: "“An High Priest of Good Things to Come”",
      occasion: "October 1999 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/1999/10/an-high-priest-of-good-things-to-come?lang=eng",
    },
    icon: "chores",
  },
  {
    id: "blessings-come",
    text: "Some blessings come late. They still come.",
    meaning:
      "We do not get to pick the timing. We do get to keep believing that the answer is on its way — even the ones that take years.",
    quote:
      "Some blessings come soon, some come late, and some don’t come until heaven; but for those who embrace the gospel of Jesus Christ, they come.",
    source: {
      author: "Elder Jeffrey R. Holland",
      role: "Quorum of the Twelve Apostles",
      title: "“An High Priest of Good Things to Come”",
      occasion: "October 1999 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/1999/10/an-high-priest-of-good-things-to-come?lang=eng",
    },
    icon: "rewards",
  },
  {
    id: "learn-from-it",
    text: "Learn from it. Don’t live in it.",
    meaning:
      "Yesterday’s mistake is a teacher, not an address. We take the lesson, we leave the shame, and we face forward.",
    quote: "The past is to be learned from but not lived in.",
    source: {
      author: "Elder Jeffrey R. Holland",
      role: "Quorum of the Twelve Apostles",
      title: "Remember Lot’s Wife",
      occasion: "Brigham Young University devotional, 13 January 2009",
      url: "https://speeches.byu.edu/talks/jeffrey-r-holland/remember-lots-wife/",
    },
    icon: "calendar",
  },
  {
    id: "be-somebody-s-angel",
    text: "Be somebody’s angel today.",
    meaning:
      "Sitting by the new kid. Shovelling the neighbour’s walk before they wake up. Most of the help God sends arrives wearing boots.",
    quote:
      "Not all angels are from the other side of the veil. Some of them we walk with and talk with—here, now, every day.",
    source: {
      author: "Elder Jeffrey R. Holland",
      role: "Quorum of the Twelve Apostles",
      title: "The Ministry of Angels",
      occasion: "October 2008 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2008/10/the-ministry-of-angels?lang=eng",
    },
    icon: "seats",
  },
  {
    id: "bless-the-one",
    text: "Bless the one.",
    meaning:
      "You cannot fix everything for everyone. You can notice one person today and do one real thing for them — and that is how a family, a ward and a town get better.",
    quote: "When we bless the one, we bless the whole.",
    source: {
      ...YEE,
      title:
        "Ministering—“That Ye Love One Another; as I Have Loved You”",
      occasion: "April 2026 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2026/04/14yee?lang=eng",
    },
    icon: "home",
  },
  {
    id: "his-hands",
    text: "We are His hands.",
    meaning:
      "When somebody in Rexburg is praying for help, the answer is often just a person who decided to show up. Around here, that is the job.",
    quote: "We are the Savior’s hands.",
    source: {
      ...YEE,
      title:
        "Ministering—“That Ye Love One Another; as I Have Loved You”",
      occasion: "April 2026 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2026/04/14yee?lang=eng",
    },
    icon: "chores",
  },
  {
    id: "start-again-today",
    text: "We start again today.",
    meaning:
      "Repentance is not a punishment in this house; it is the fresh start. Nobody is stuck being the version of themselves they were yesterday.",
    quote: "Repentance is the pathway to purity, and purity brings power.",
    source: {
      ...YEE,
      title: "The Joy of Our Redemption",
      occasion: "October 2024 general conference",
      url: "https://www.churchofjesuschrist.org/study/general-conference/2024/10/32yee?lang=eng",
    },
    icon: "stars",
  },
] as const;

export const MANTRA_COUNT = MANTRAS.length;

/**
 * The mantra for the day containing `date`.
 *
 * Deterministic, from the local calendar date alone — every device in the
 * family shows the same one on the same day, with nothing stored and nothing
 * fetched. The list is walked in order rather than hashed, so the whole set
 * comes round evenly instead of landing on the same few.
 *
 * `Math.floor` on the epoch-day, so it keeps counting correctly for dates
 * before 1970 rather than rounding toward zero and repeating a day.
 */
export function getMantraOfDay(
  date: Date,
  mantras: readonly Mantra[] = MANTRAS,
): Mantra {
  const epochDay = Math.floor(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() /
      86_400_000,
  );
  const index = ((epochDay % mantras.length) + mantras.length) % mantras.length;
  return mantras[index];
}

/** Look one up by id. Throws rather than returning undefined. */
export function getMantra(id: string): Mantra {
  const match = MANTRAS.find((mantra) => mantra.id === id);
  if (!match) {
    throw new Error(`Unknown mantra id: "${id}". Check config/mantras.ts.`);
  }
  return match;
}
