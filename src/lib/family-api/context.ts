/**
 * `buildChildVisibleFamilyContext` — the one place that decides what leaves
 * this house.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FUNCTION IS PURE
 * ---------------------------------------------------------------------------
 * It takes plain data and returns plain data. It cannot reach MongoDB, cannot
 * read an environment variable, cannot read the clock. That is not tidiness:
 * it is what makes the privacy boundary *auditable*. Everything this API can
 * possibly return is constructed in this file, from arguments, in about three
 * hundred readable lines — so "does the API ever return a phone number" is a
 * question somebody can answer by reading, rather than by tracing a serialiser
 * through an ORM.
 *
 * It is also what makes it testable. `tests/family-api-context.test.ts` feeds it
 * hostile input and checks the output field by field, with no database and no
 * network anywhere in the test.
 *
 * ---------------------------------------------------------------------------
 * DEFAULT TO EXCLUSION
 * ---------------------------------------------------------------------------
 * No database entity is ever spread into a response. Every field below is
 * named, one at a time, and copied across deliberately. Adding a column to a
 * MongoDB document therefore cannot leak it, and adding a field here is a
 * visible, reviewable act rather than a side effect.
 *
 * The full list of what is included and what is excluded — and why, field by
 * field — is docs/family-api/privacy-data-map.md.
 *
 * ---------------------------------------------------------------------------
 * MISSING DATA IS SAID OUT LOUD
 * ---------------------------------------------------------------------------
 * This app has no announcements, no rewards ledger and no homework tracker. It
 * would be easy to omit those keys and let the model infer absence, and the
 * model would infer wrongly and confidently. So they are present and explicitly
 * marked `not-tracked`, and `notTracked` lists them again at the top level. A
 * child asking "what are my announcements" should be told the app does not have
 * any such thing — not told there are none.
 */

import { MOTTOS } from "@/config/motto";

import { LIMITS, SCHEMA_VERSION, SECURITY_NOTICE, STALE_AFTER_MINUTES } from "./config";
import type { RosterChild, UpcomingBirthday } from "./family";
import { sanitiseText } from "./sanitise";
import { calculateAge, toOffsetIso, type FamilyNow } from "./time";

/* ------------------------------------------------------------------ */
/* What goes in                                                        */
/* ------------------------------------------------------------------ */

/** One star-chart row, straight off `config/stars.ts`. */
export type RawChore = {
  id: string;
  label: string;
  chart: string;
  /** Monday-first, one boolean per weekday. May be short or absent. */
  marks: readonly boolean[];
};

/** One calendar occurrence, already narrowed to the four fields allowed out. */
export type RawEvent = {
  title: string;
  /** `YYYY-MM-DD` in the family's timezone. */
  date: string;
  /** `HH:MM`, or `null` for an all-day event. */
  startTime: string | null;
  allDay: boolean;
};

export type CalendarStatus = "ok" | "not-configured" | "unavailable";

export type ContextInput = {
  now: FamilyNow;
  /** `null` when no `?child=` was supplied, or it named nobody. */
  child: RosterChild | null;
  /**
   * Which column of the star chart today is: 0 is Monday, 4 is Friday, and
   * `null` on a Sunday, when the chart has no column at all.
   */
  starDayIndex: number | null;
  /** The identified child's rows this week. Empty when no child was named. */
  chores: readonly RawChore[];
  seating: {
    weekNumber: number;
    cycleLength: number;
    /** One plain sentence, already derived from the same assignments the app draws. */
    summary: string;
  } | null;
  petSleeping: {
    date: string;
    assignments: readonly { pet: string; assignedTo: string }[];
  } | null;
  calendar: {
    status: CalendarStatus;
    today: readonly RawEvent[];
    nextSevenDays: readonly RawEvent[];
  };
  upcomingBirthdays: { items: readonly UpcomingBirthday[]; truncated: boolean };
  /** `HH:MM`, from `config/family-profile.json`. */
  windDownTime: string;
  /** When the underlying data was last known good. */
  lastUpdatedAt: Date;
  /**
   * Names of sources that degraded — "stars", "calendar", "rotations". Drives
   * `dataFreshness.status`; never carries an error message.
   *
   * Mutable rather than `readonly` because the handler appends to it after
   * gathering, when the durable usage counters turn out to be unreachable —
   * that is a degradation the data sources cannot know about.
   */
  degraded: string[];
};

/* ------------------------------------------------------------------ */
/* What comes out                                                      */
/* ------------------------------------------------------------------ */

export type ChoreStatus = "complete" | "incomplete" | "not-tracked-today";

export type FamilyContext = {
  schemaVersion: string;
  securityNotice: string;
  generatedAt: string;
  timezone: string;
  currentDate: string;
  currentLocalTime: string;
  dataFreshness: {
    status: "fresh" | "stale" | "unavailable";
    source: string;
    lastUpdatedAt: string;
    staleAfterMinutes: number;
    degradedSources: string[];
  };
  identifiedChild: {
    id: string;
    name: string;
    birthDate: string;
    calculatedAge: number | null;
  } | null;
  family: {
    mottoes: string[];
    upcomingBirthdays: UpcomingBirthday[];
  };
  responsibilities: {
    availability: "identified" | "requires-child";
    chores: { id: string; title: string; chart: string; status: ChoreStatus }[];
    stars: {
      earnedToday: number;
      availableToday: number;
      remainingToday: number;
      earnedThisWeek: number;
      availableThisWeek: number;
    } | null;
    homeworkKnown: false;
  };
  rotations: {
    seating: {
      label: string;
      value: string;
      weekNumber: number;
      cycleLength: number;
    } | null;
    petSleeping: {
      date: string;
      assignments: { pet: string; assignedTo: string }[];
    } | null;
  };
  calendar: {
    availability: CalendarStatus;
    today: RawEvent[];
    nextSevenDays: RawEvent[];
  };
  windDown: {
    usualTime: string;
    isPastWindDown: boolean;
  };
  familyAnnouncements: {
    availability: "not-tracked";
    items: never[];
  };
  /** Things the app genuinely does not hold. Say so rather than imply none. */
  notTracked: string[];
  /** Field paths cut short by a limit. Empty when nothing was cut. */
  truncated: string[];
  /** Present only when `truncated` is non-empty. Written for the model. */
  truncationNotice?: string;
};

/* ------------------------------------------------------------------ */
/* The projection                                                      */
/* ------------------------------------------------------------------ */

export function buildChildVisibleFamilyContext(
  input: ContextInput,
): FamilyContext {
  const truncated: string[] = [];

  const chores = projectChores(input, truncated);
  const stars = projectStars(input);

  const birthdays = input.upcomingBirthdays.items.slice(
    0,
    LIMITS.maxUpcomingBirthdays,
  );
  if (
    input.upcomingBirthdays.truncated ||
    input.upcomingBirthdays.items.length > birthdays.length
  ) {
    truncated.push("family.upcomingBirthdays");
  }

  const today = projectEvents(input.calendar.today, "calendar.today", truncated);
  const week = projectEvents(
    input.calendar.nextSevenDays,
    "calendar.nextSevenDays",
    truncated,
  );

  const context: FamilyContext = {
    schemaVersion: SCHEMA_VERSION,
    securityNotice: SECURITY_NOTICE,
    generatedAt: toOffsetIso(input.now.instant),
    timezone: input.now.timezoneName,
    currentDate: input.now.date,
    currentLocalTime: input.now.time,

    dataFreshness: {
      status: freshnessStatus(input),
      source: "Birch Family App",
      lastUpdatedAt: toOffsetIso(input.lastUpdatedAt),
      staleAfterMinutes: STALE_AFTER_MINUTES,
      degradedSources: [...input.degraded],
    },

    /*
     * `birthDate` is returned for the identified child and for nobody else,
     * and `calculatedAge` is computed here rather than stored — the whole
     * reason `config/family-profile.json` holds dates and not ages.
     *
     * A parent's birth *year* appears nowhere in this API at all; see
     * `family.ts`.
     */
    identifiedChild: input.child
      ? {
          id: input.child.id,
          name: input.child.name,
          birthDate: input.child.birthDate,
          calculatedAge: calculateAge(input.child.birthDate, input.now.date),
        }
      : null,

    family: {
      // The mottoes are the family's own words, from `config/motto.ts`. Only
      // the text — the `meaning` paragraph is for the app's banner, not for a
      // context payload that is trying to stay small.
      mottoes: MOTTOS.map((motto) =>
        sanitiseText(motto.text, LIMITS.maxTitleLength),
      ),
      upcomingBirthdays: birthdays.map((birthday) => ({
        person: sanitiseText(birthday.person, LIMITS.maxTitleLength),
        date: birthday.date,
        daysAway: birthday.daysAway,
      })),
    },

    responsibilities: {
      availability: input.child ? "identified" : "requires-child",
      chores,
      stars,
      // Always false, and present rather than omitted, so the model can say
      // "I don't know about homework" instead of inferring there is none.
      homeworkKnown: false,
    },

    rotations: {
      seating: input.seating
        ? {
            label: "Dinner table and car seats",
            value: sanitiseText(
              input.seating.summary,
              LIMITS.maxDescriptionLength,
            ),
            weekNumber: input.seating.weekNumber,
            cycleLength: input.seating.cycleLength,
          }
        : null,
      petSleeping: input.petSleeping
        ? {
            date: input.petSleeping.date,
            assignments: input.petSleeping.assignments.map((assignment) => ({
              pet: sanitiseText(assignment.pet, LIMITS.maxTitleLength),
              assignedTo: sanitiseText(
                assignment.assignedTo,
                LIMITS.maxTitleLength,
              ),
            })),
          }
        : null,
    },

    calendar: {
      availability: input.calendar.status,
      today,
      nextSevenDays: week,
    },

    windDown: {
      usualTime: input.windDownTime,
      isPastWindDown: isPastWindDown(
        input.now.minutesSinceMidnight,
        input.windDownTime,
      ),
    },

    familyAnnouncements: { availability: "not-tracked", items: [] },

    notTracked: [
      "familyAnnouncements",
      "homework",
      "rewards",
      "parentNotes",
      "screenTime",
    ],

    truncated,
  };

  if (truncated.length > 0) {
    context.truncationNotice =
      "Some lists were shortened. Tell the child to open the Birch Family " +
      "App for the full list rather than guessing at what is missing.";
  }

  return context;
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function projectChores(
  input: ContextInput,
  truncated: string[],
): FamilyContext["responsibilities"]["chores"] {
  if (!input.child) return [];

  const kept = input.chores.slice(0, LIMITS.maxChores);
  if (input.chores.length > kept.length) truncated.push("responsibilities.chores");

  return kept.map((chore) => ({
    // The task id is a hand-written kebab-case slug from `config/stars.ts` —
    // "tidy-room", "feed-bella". It is not a database key, cannot be
    // enumerated into anything, and is the only stable handle the GPT has for
    // talking about the same chore twice.
    id: chore.id,
    title: sanitiseText(chore.label, LIMITS.maxTitleLength),
    chart: chore.chart,
    status: statusOf(chore, input.starDayIndex),
  }));
}

/**
 * A chore's state *today*.
 *
 * On a Sunday the charts have no column — it is awards day, not a chart day —
 * so the honest answer is neither "done" nor "not done" but "the chart does
 * not track today". Reporting `incomplete` would have the assistant nagging a
 * child about a star that cannot be earned.
 */
function statusOf(chore: RawChore, dayIndex: number | null): ChoreStatus {
  if (dayIndex === null) return "not-tracked-today";
  return chore.marks[dayIndex] === true ? "complete" : "incomplete";
}

function projectStars(
  input: ContextInput,
): FamilyContext["responsibilities"]["stars"] {
  if (!input.child) return null;

  const rows = input.chores.slice(0, LIMITS.maxChores);
  const dayIndex = input.starDayIndex;

  const earnedToday =
    dayIndex === null
      ? 0
      : rows.filter((chore) => chore.marks[dayIndex] === true).length;
  const availableToday = dayIndex === null ? 0 : rows.length;

  let earnedThisWeek = 0;
  let availableThisWeek = 0;
  for (const chore of rows) {
    availableThisWeek += chore.marks.length;
    for (const mark of chore.marks) if (mark) earnedThisWeek += 1;
  }

  return {
    earnedToday,
    availableToday,
    remainingToday: Math.max(0, availableToday - earnedToday),
    earnedThisWeek,
    availableThisWeek,
  };
}

/**
 * Calendar entries, narrowed to four fields.
 *
 * What is *not* here matters more than what is. `location` is dropped, because
 * a family calendar's location field is a street address. `description` is
 * dropped, because it is where the doctor's-appointment details live. The
 * organiser, attendees, conferencing links, the event's uid and the raw
 * recurrence rule are all dropped. Only a sanitised title, a date, a start
 * time and an all-day flag survive — enough for "you have piano at four",
 * which is the entire job.
 */
function projectEvents(
  events: readonly RawEvent[],
  path: string,
  truncated: string[],
): RawEvent[] {
  const kept = events.slice(0, LIMITS.maxCalendarEntries);
  if (events.length > kept.length) truncated.push(path);

  return kept
    .map((event) => ({
      title: sanitiseText(event.title, LIMITS.maxCalendarTitleLength),
      date: event.date,
      startTime: event.startTime,
      allDay: event.allDay,
    }))
    // A title that sanitised away to nothing is dropped rather than returned
    // empty: "you have  at four" is worse than saying nothing.
    .filter((event) => event.title !== "");
}

function freshnessStatus(input: ContextInput): "fresh" | "stale" | "unavailable" {
  // Everything that could degrade did.
  if (input.degraded.length >= 3) return "unavailable";
  if (input.degraded.length > 0) return "stale";

  const ageMinutes =
    (input.now.instant.getTime() - input.lastUpdatedAt.getTime()) / 60_000;
  return ageMinutes > STALE_AFTER_MINUTES ? "stale" : "fresh";
}

/** `true` once the family's usual wind-down time has passed. */
export function isPastWindDown(
  minutesSinceMidnight: number,
  windDownTime: string,
): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(windDownTime);
  // An unparseable configured time must not assert that it is past bedtime.
  if (!match) return false;
  return minutesSinceMidnight >= Number(match[1]) * 60 + Number(match[2]);
}

/* ------------------------------------------------------------------ */
/* The last ceiling                                                    */
/* ------------------------------------------------------------------ */

/**
 * Serialise, and shrink until the result fits.
 *
 * Every individual list is already capped, so in ordinary use this does
 * nothing and the loop never runs. It exists because "every list is capped"
 * and "the total is capped" are different claims, and only the second one is
 * a bound on what this endpoint can be made to emit. Twenty-five calendar
 * entries whose titles are each two hundred characters is a response nobody
 * designed and this function still refuses to send.
 *
 * Things are dropped in reverse order of how much a child would miss them:
 * the week ahead before today, today's calendar before today's chores.
 */
export function serialiseWithinBudget(
  context: FamilyContext,
  maxBytes: number = LIMITS.maxResponseBytes,
): { body: string; context: FamilyContext } {
  let current = context;
  let body = JSON.stringify(current);

  const shrinks: ((next: FamilyContext) => boolean)[] = [
    (next) => drop(next, "calendar.nextSevenDays", () => (next.calendar.nextSevenDays = [])),
    (next) => drop(next, "calendar.today", () => (next.calendar.today = [])),
    (next) => drop(next, "responsibilities.chores", () => (next.responsibilities.chores = [])),
    (next) => drop(next, "family.upcomingBirthdays", () => (next.family.upcomingBirthdays = [])),
  ];

  for (const shrink of shrinks) {
    if (byteLength(body) <= maxBytes) break;
    // Copy on write, so the caller's object is never mutated — it may be the
    // one sitting in the response cache.
    current = structuredClone(current);
    shrink(current);
    current.truncationNotice =
      "Some lists were shortened. Tell the child to open the Birch Family " +
      "App for the full list rather than guessing at what is missing.";
    body = JSON.stringify(current);
  }

  return { body, context: current };
}

function drop(
  context: FamilyContext,
  path: string,
  apply: () => void,
): boolean {
  apply();
  if (!context.truncated.includes(path)) context.truncated.push(path);
  return true;
}

export function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
