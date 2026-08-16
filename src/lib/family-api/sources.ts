import "server-only";

/**
 * Reading the app's own data, on the app's own terms.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE DOES NO PROJECTION AND MAKES NO PRIVACY DECISIONS
 * ---------------------------------------------------------------------------
 * Its whole job is to hand `buildChildVisibleFamilyContext` a plain object.
 * The split is deliberate: everything that touches MongoDB, the calendar feed
 * and the clock is here, and everything that decides what a child may see is
 * there, pure and tested without a database. Neither file can quietly grow
 * into the other's job.
 *
 * ---------------------------------------------------------------------------
 * NOTHING NEW IS QUERIED
 * ---------------------------------------------------------------------------
 * Every read below is one the dashboard already performs on every page load:
 * two small collection scans (`choreRotations`, `petRotations` — two and five
 * documents respectively), one indexed lookup by week (`starWeeks`), and the
 * cached calendar fetch. There is no new query shape, so there is no new index
 * to add and no new way to make the cluster work hard. The existing indexes
 * seeded by `scripts/seed-database.ts` cover all of it:
 *
 *   starWeeks.child_week_unique   -> the `{ weekStart }` find below
 *   petRotations.pet_unique       -> a two-document collection scan
 *   choreRotations.pool_unique    -> a two-document collection scan
 *
 * Each read already falls back rather than throwing — `getChorePools` and
 * `getPetRotations` return the compiled defaults when the cluster is
 * unreachable, and `getWeekMarks` returns a blank week. That behaviour is
 * right here too, so this module adds a timeout and reports what degraded
 * rather than reimplementing any of it — see `lib/data-health.ts` for how a
 * store says it fell back, and why an API needs to know when a page does not.
 *
 * ---------------------------------------------------------------------------
 * THE CALENDAR IS FILTERED IN THE FAMILY'S TIMEZONE
 * ---------------------------------------------------------------------------
 * `eventsOnDay()` in `lib/calendar/events.ts` is a *client* function: it works
 * in the runtime's local zone, which is correct in a browser in Rexburg and
 * wrong in a Vercel function in UTC. So this module does its own day-window
 * arithmetic through `civilInZoneToInstant`, against `America/Boise`, and does
 * not call it. See `time.ts` for the same problem stated at length.
 */

import { CHILD_IDS, getPerson, type ChildId } from "@/config/family";
import { getPet, type PetId } from "@/config/pets";
import { starDayCount } from "@/config/stars";
import { civilInZoneToInstant, zoneOffsetMs } from "@/lib/calendar/civil";
import type { CalendarEvent } from "@/lib/calendar/events";
import { loadCalendarFeed } from "@/lib/calendar/feed";
import { degradedSources, withDataHealth } from "@/lib/data-health";
import { getPetNights } from "@/lib/pets/rotation";
import { getPetRotations } from "@/lib/pets/store";
import { getRotationStatus } from "@/lib/rotation";
import { getTableSummary, getVehicleSummary } from "@/lib/seating-summary";
import { getChorePools } from "@/lib/stars/rotation-store";
import { getWeekMarks } from "@/lib/stars/marks";
import { getTasksForChild } from "@/lib/stars/tasks";
import { getWeekStartIso } from "@/lib/stars/week";
import { rowFor } from "@/lib/stars/counting";

import { LIMITS, TIMEZONE } from "./config";
import type { ContextInput, RawChore, RawEvent } from "./context";
import { PROFILE_WIND_DOWN, upcomingBirthdays, type RosterChild } from "./family";
import { familyNow, type FamilyNow } from "./time";

/**
 * Give up on a slow source rather than holding the request open.
 *
 * The fallback is returned, the source is recorded as degraded, and the
 * response says so. A hung Atlas connection must cost this endpoint a fixed
 * number of milliseconds, not a whole serverless invocation's billed duration.
 */
async function within<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<{ value: T; ok: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<{ value: T; ok: boolean }>((resolve) => {
    timer = setTimeout(() => resolve({ value: fallback, ok: false }), timeoutMs);
  });

  try {
    const value = await Promise.race([
      promise.then((resolved) => ({ value: resolved, ok: true })),
      timeout,
    ]);
    return value;
  } catch {
    // Every source below already handles its own failures; this catches the
    // ones that got past them. The error is deliberately not carried out of
    // here — a driver error can contain the connection string.
    return { value: fallback, ok: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type GatherOptions = {
  child: RosterChild | null;
  /** Injected so tests can pin a date without touching the system clock. */
  instant?: Date;
  timeoutMs: number;
};

/**
 * Collect everything the projection needs, in parallel, with a deadline.
 *
 * The whole gather runs inside a `withDataHealth` scope, which is what lets a
 * store several layers down report that it fell back without every function
 * between here and there having to thread a flag through its return type.
 */
export function gatherContextInput(
  options: GatherOptions,
): Promise<ContextInput> {
  return withDataHealth(() => gather(options));
}

async function gather(options: GatherOptions): Promise<ContextInput> {
  const now = familyNow(options.instant ?? new Date(), TIMEZONE);
  const degraded: string[] = [];

  const [pools, pets, calendar] = await Promise.all([
    within(Promise.resolve(getChorePools()), options.timeoutMs, null),
    within(Promise.resolve(getPetRotations()), options.timeoutMs, null),
    within(
      loadCalendarFeed(now.instant),
      options.timeoutMs,
      { status: "error" as const, message: "" },
    ),
  ]);

  if (!pools.ok || pools.value === null) degraded.push("chores");
  if (!pets.ok || pets.value === null) degraded.push("rotations");

  const chores = await collectChores({
    child: options.child,
    now,
    pools: pools.value,
    timeoutMs: options.timeoutMs,
    onDegraded: () => {
      if (!degraded.includes("stars")) degraded.push("stars");
    },
  });

  const calendarSection = projectFeed(calendar.value, now, calendar.ok);
  if (calendarSection.status === "unavailable") degraded.push("calendar");

  /*
   * The stores are deliberately forgiving — an unreachable cluster gives a
   * blank star chart and the compiled rotations rather than an error page.
   * That is right for the app and dangerous here, because a blank week and a
   * week nobody has ticked are the same object: a child would be told,
   * confidently, that they had done nothing today.
   *
   * `lib/data-health.ts` is how each store says it fell back. Merged rather
   * than replacing the list above, because the timeouts this module applies
   * are a degradation the stores themselves never see.
   */
  for (const source of degradedSources()) {
    if (!degraded.includes(source)) degraded.push(source);
  }

  return {
    now,
    child: options.child,
    starDayIndex: starDayIndexFor(now),
    chores,
    seating: buildSeating(now, options.child),
    petSleeping: pets.value ? buildPets(now, pets.value) : null,
    calendar: calendarSection,
    upcomingBirthdays: upcomingBirthdays(now.date, {
      max: LIMITS.maxUpcomingBirthdays,
    }),
    windDownTime: PROFILE_WIND_DOWN,
    // Everything above is derived live from the database and the cached feed,
    // so "last updated" is now. It is a separate field from `generatedAt`
    // because that stops being true the moment anything here starts being
    // served from a longer-lived cache, and the model is told to trust this
    // one.
    lastUpdatedAt: now.instant,
    degraded,
  };
}

/* ------------------------------------------------------------------ */
/* Stars and chores                                                    */
/* ------------------------------------------------------------------ */

/**
 * Which column of the star chart today is.
 *
 * Sunday has no column and never will — it is the ceremony, not a chart day —
 * so this returns `null` and `context.ts` turns that into a status of
 * `not-tracked-today` rather than into `incomplete`. Saturday returns `null`
 * too for any week that predates `SATURDAY_FROM_WEEK`, which is why the week
 * is asked rather than a constant.
 */
function starDayIndexFor(now: FamilyNow): number | null {
  // `civilNoon`'s weekday is Boise's weekday — that is the whole point of the
  // proxy. 0 is Sunday, so Monday is 1 and Saturday is 6.
  const weekday = now.civilNoon.getDay();
  if (weekday < 1) return null;
  return weekday - 1 < starDayCount(getWeekStartIso(now.civilNoon))
    ? weekday - 1
    : null;
}

async function collectChores(options: {
  child: RosterChild | null;
  now: FamilyNow;
  pools: Awaited<ReturnType<typeof getChorePools>> | null;
  timeoutMs: number;
  onDegraded: () => void;
}): Promise<RawChore[]> {
  // Chores are a child's own. With nobody identified there is nothing to
  // return, and — more to the point — nothing is read from the database at
  // all, so a family-wide request cannot be used to harvest five children's
  // charts one call at a time.
  if (!options.child || !options.pools) {
    if (options.child && !options.pools) options.onDegraded();
    return [];
  }

  const weekStart = getWeekStartIso(options.now.civilNoon);

  const marks = await within(
    Promise.resolve(getWeekMarks(weekStart)),
    options.timeoutMs,
    null,
  );

  if (!marks.ok || marks.value === null) {
    options.onDegraded();
    return [];
  }

  const tasks = getTasksForChild(
    options.pools,
    options.now.civilNoon,
    options.child.id as ChildId,
  );

  const childMarks = marks.value[options.child.id as ChildId] ?? {};

  return tasks.map((task) => ({
    id: task.id,
    label: task.label,
    chart: task.chart,
    marks: rowFor(childMarks, task.id),
  }));
}

/* ------------------------------------------------------------------ */
/* Rotations                                                           */
/* ------------------------------------------------------------------ */

/**
 * This week's seats, as one sentence.
 *
 * The sentences come from `lib/seating-summary.ts`, which is what the app
 * already renders for screen readers — so the API cannot drift away from what
 * the page shows, and there is no second description of the seating to keep
 * correct.
 *
 * With a child identified the answer is narrowed to that child's two seats. A
 * family-wide request gets the dinner table only: the whole car as well is
 * eleven sentences to answer a question nobody asked, and this response has a
 * budget.
 */
function buildSeating(
  now: FamilyNow,
  child: RosterChild | null,
): ContextInput["seating"] {
  const status = getRotationStatus(now.civilNoon);

  if (!status.hasStarted) return null;

  const table = getTableSummary(status.assignments);
  const vehicle = getVehicleSummary(status.assignments);

  if (child) {
    const name = getPerson(child.id as ChildId).name;
    const mine = [...table, ...vehicle]
      .filter((line) => line.text.startsWith(`${name} `))
      .map((line) => line.text);

    if (mine.length > 0) {
      return {
        weekNumber: status.weekNumber,
        cycleLength: status.cycleLength,
        summary: mine.join(" "),
      };
    }
  }

  return {
    weekNumber: status.weekNumber,
    cycleLength: status.cycleLength,
    summary: table.map((line) => line.text).join(" "),
  };
}

function buildPets(
  now: FamilyNow,
  configs: Awaited<ReturnType<typeof getPetRotations>>,
): ContextInput["petSleeping"] {
  try {
    const nights = getPetNights(configs, now.civilNoon);

    return {
      date: now.date,
      assignments: nights.map((night) => ({
        pet: getPet(night.petId as PetId).name,
        assignedTo: childName(night.childId),
      })),
    };
  } catch {
    // A misconfigured rotation throws by design (see `pets/rotation.ts`). The
    // seating page falls back; here, the honest answer is that tonight's pets
    // are not known.
    return null;
  }
}

function childName(id: ChildId): string {
  return (CHILD_IDS as readonly string[]).includes(id)
    ? getPerson(id).name
    : "Someone";
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

/**
 * The feed, narrowed to today and the next seven days in Boise.
 *
 * `not-configured` and `unavailable` are kept apart because they mean
 * different things to a child: the first is "this family has not connected a
 * calendar", the second is "it is connected and I could not read it just now".
 * Collapsing them would have the assistant telling a child there is no
 * calendar on the day Google is having a bad morning.
 */
function projectFeed(
  feed: Awaited<ReturnType<typeof loadCalendarFeed>> | null,
  now: FamilyNow,
  ok: boolean,
): ContextInput["calendar"] {
  if (!ok || !feed || feed.status === "error") {
    return { status: "unavailable", today: [], nextSevenDays: [] };
  }
  if (feed.status === "unconfigured") {
    return { status: "not-configured", today: [], nextSevenDays: [] };
  }

  const today = eventsOnLocalDay(feed.events, now.date);

  const ahead: RawEvent[] = [];
  // Strictly bounded: the caller cannot ask for a different window, and the
  // loop cannot run longer than the compiled ceiling however the dates behave.
  for (let offset = 1; offset <= LIMITS.maxCalendarDays; offset += 1) {
    const iso = addIsoDays(now.date, offset);
    if (!iso) break;
    ahead.push(...eventsOnLocalDay(feed.events, iso));
    if (ahead.length >= LIMITS.maxCalendarEntries) break;
  }

  return { status: "ok", today, nextSevenDays: ahead };
}

/** The instants at which a Boise calendar day begins and ends. */
function dayWindow(iso: string): { startMs: number; endMs: number } | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return null;

  const civil = {
    year: Number(parts[1]),
    month: Number(parts[2]),
    day: Number(parts[3]),
    hour: 0,
    minute: 0,
    second: 0,
  };

  const startMs = civilInZoneToInstant(civil, TIMEZONE);
  const next = addIsoDays(iso, 1);
  const endMs = next
    ? civilInZoneToInstant({ ...civil, ...splitIso(next) }, TIMEZONE)
    : startMs + 24 * 60 * 60 * 1000;

  return { startMs, endMs };
}

function eventsOnLocalDay(
  events: readonly CalendarEvent[],
  iso: string,
): RawEvent[] {
  const window = dayWindow(iso);
  if (!window) return [];

  const found: RawEvent[] = [];

  for (const event of events) {
    // Stop early. Nothing downstream will keep more than this, and a feed with
    // a thousand occurrences on one day must not cost a thousand conversions.
    if (found.length >= LIMITS.maxCalendarEntries) break;

    if (event.allDay) {
      // All-day events are calendar squares, never instants — string
      // comparison on `YYYY-MM-DD`, exactly as `events.ts` insists.
      if (
        event.startDate === null ||
        event.endDate === null ||
        event.startDate > iso ||
        event.endDate < iso
      ) {
        continue;
      }
      found.push({ title: event.title, date: iso, startTime: null, allDay: true });
      continue;
    }

    const overlaps =
      event.start === event.end
        ? event.start >= window.startMs && event.start < window.endMs
        : event.start < window.endMs && event.end > window.startMs;

    if (!overlaps) continue;

    found.push({
      title: event.title,
      date: iso,
      startTime: localTimeOf(event.start),
      allDay: false,
    });
  }

  return found;
}

/** `HH:MM` for an instant, read on the family's clock. */
function localTimeOf(instantMs: number): string {
  const shifted = new Date(instantMs + zoneOffsetMs(instantMs, TIMEZONE));
  return (
    `${String(shifted.getUTCHours()).padStart(2, "0")}:` +
    `${String(shifted.getUTCMinutes()).padStart(2, "0")}`
  );
}

function splitIso(iso: string): { year: number; month: number; day: number } {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return { year: 1970, month: 1, day: 1 };
  return {
    year: Number(parts[1]),
    month: Number(parts[2]),
    day: Number(parts[3]),
  };
}

/**
 * `iso` plus `days`, as a civil date.
 *
 * Goes through `Date.UTC`, which has no daylight saving in it, so adding a day
 * across the March transition adds a day rather than twenty-three hours.
 */
function addIsoDays(iso: string, days: number): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return null;

  const shifted = new Date(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]) + days),
  );

  return (
    `${String(shifted.getUTCFullYear()).padStart(4, "0")}-` +
    `${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-` +
    `${String(shifted.getUTCDate()).padStart(2, "0")}`
  );
}
