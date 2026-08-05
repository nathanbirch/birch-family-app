/**
 * The Birch family motto of the week.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND HOW IT DIFFERS FROM THE MANTRAS
 * ---------------------------------------------------------------------------
 * A mantra is one of fifteen things we say to each other, and a new one comes
 * up every morning (`config/mantras.ts`). The motto is different in kind: it
 * is the *one* thing the whole family is working on right now, it changes once
 * a week rather than once a day, and it is the first thing on the home screen
 * rather than a page you go to.
 *
 * Because it turns over slowly and sits front and centre, keep the list short.
 * Two is a perfectly good number — with two mottos, each one gets a fortnight's
 * attention out of every four weeks, which is long enough for a child to
 * actually live with it. Adding a third makes each one rarer, not more
 * prominent; that is the trade to think about before typing a fourth.
 *
 * Unlike the mantras, these carry no quote and no attribution. "Love like
 * Jesus" and "Think celestial" are phrases the family has taken up and made
 * its own — `meaning` below is our voice, not anybody else's. (If you ever
 * want the words a motto came from shown on screen, that is what a mantra is
 * for, and "Think celestial" already has one there with President Nelson's
 * talk linked.)
 *
 * ---------------------------------------------------------------------------
 * CHANGING THE MOTTOS
 * ---------------------------------------------------------------------------
 * Edit the list, and that is the whole job — the rotation is derived from the
 * calendar, so nothing is stored and nothing needs migrating. Two things to
 * know before you do:
 *
 *   - Adding or removing a motto re-shuffles which one lands on which week
 *     from `MOTTO_START_DATE` onward, because the position in the cycle is
 *     `weeks elapsed % list length`. That is fine and expected; it just means
 *     the current week's motto may change the moment you deploy.
 *   - `id` is used as a React key so the banner replays its arrival animation
 *     on a change of week. Keep ids stable; never reuse one for a new motto.
 */

import type {
  DecorativeIconName,
  NavIconName,
  PlannedIconName,
} from "./navigation";

export type Motto = {
  /** Stable slug. Used as a React key — see the note above. */
  id: string;
  /** The motto itself. Short enough to say out loud and to fit on one line. */
  text: string;
  /** What we mean by it, in the family's own voice. One or two sentences. */
  meaning: string;
  /** Key into `NAV_ICONS`, drawn beside the motto on the banner. */
  icon: NavIconName | PlannedIconName | DecorativeIconName;
};

export const MOTTOS: readonly Motto[] = [
  {
    id: "love-like-jesus",
    text: "Love Like Jesus.",
    meaning:
      "Look at people the way He does — starting with the ones in this house. Go first, forgive fast, and leave nobody out.",
    icon: "mantras",
  },
  {
    id: "think-celestial",
    text: "Think Celestial.",
    meaning:
      "Ask the long question. Not “what do I want right now” but “who am I becoming, and who do I want to be with forever?”",
    icon: "stars",
  },
] as const;

export const MOTTO_COUNT = MOTTOS.length;

/**
 * The Monday the motto rotation is anchored to, as a local calendar date
 * (`YYYY-MM-DD`).
 *
 * The week containing this date shows `MOTTOS[0]`. It is deliberately a
 * separate anchor from `ROTATION_START_DATE` in `config/app.ts`: the seats and
 * the motto both change on a Monday, but they are unrelated cycles of
 * different lengths and tying them together would mean re-anchoring one every
 * time the other needed moving.
 *
 * Set to the Monday of the week the motto was introduced.
 */
export const MOTTO_START_DATE = "2026-08-03";
