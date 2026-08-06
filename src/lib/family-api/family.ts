/**
 * The roster, as this API is allowed to see it.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE FACTS COME FROM
 * ---------------------------------------------------------------------------
 * Nothing about a person is written down twice. Names and ids come from
 * `src/config/family.ts`, which the whole app already uses; birth dates come
 * from `config/family-profile.json`, which exists precisely so that no file
 * has to hold an age that goes stale on a birthday. This module joins the two
 * and refuses to invent a third source.
 *
 * That join is checked rather than assumed: if the JSON and the TypeScript
 * roster ever disagree about who is in this family, `familyRoster()` drops the
 * mismatched entry and `tests/family-api-family.test.ts` fails. A silent
 * disagreement would mean a child whose age the API cannot compute, which is
 * exactly the sort of thing nobody notices until the day it matters.
 *
 * ---------------------------------------------------------------------------
 * THE CHILD PARAMETER IS AN ALLOWLIST, NOT A LOOKUP
 * ---------------------------------------------------------------------------
 * `?child=` is matched against the five ids below and nothing else. It never
 * reaches MongoDB, never becomes part of a query, and never accepts an
 * ObjectId — so there is nothing to enumerate and no injection surface. The
 * ids are first names the family says out loud, deliberately: an opaque id
 * would be one more thing to look up, and there is no secret in "clara" that
 * the OpenAPI document does not already have to give the GPT anyway.
 */

import profile from "../../../config/family-profile.json";
import birthdays from "../../../config/family-birthdays.json";

import { CHILD_IDS, FAMILY, type ChildId } from "@/config/family";

import { daysUntilAnniversary, parseMonthDay } from "./time";

export type RosterChild = {
  id: ChildId;
  /** First name, as the family uses it. */
  name: string;
  /** `YYYY-MM-DD`. Returned only for the identified child. */
  birthDate: string;
};

/** The timezone the family lives in, read from the profile rather than typed. */
export const PROFILE_TIMEZONE: string = profile.timezone;

/** The usual wind-down time, `HH:MM`. Also read rather than typed. */
export const PROFILE_WIND_DOWN: string = profile.windDownTime;

/**
 * How many days ahead a birthday starts being mentioned.
 *
 * From `config/family-birthdays.json` so a parent can retune the window
 * without touching this API at all.
 */
export const BIRTHDAY_WINDOW_DAYS: number =
  birthdays.reminders.gentleWindowDays;

const ROSTER: readonly RosterChild[] = buildRoster();

function buildRoster(): RosterChild[] {
  const namesById = new Map(FAMILY.map((member) => [member.id, member.name]));

  const children: RosterChild[] = [];
  for (const entry of profile.children) {
    // Both halves have to agree. An id in the JSON that the app's roster does
    // not know is dropped rather than trusted.
    if (!(CHILD_IDS as readonly string[]).includes(entry.id)) continue;
    const name = namesById.get(entry.id as ChildId);
    if (!name) continue;

    children.push({
      id: entry.id as ChildId,
      name,
      birthDate: entry.birthDate,
    });
  }
  return children;
}

/** The five children, in profile order. */
export function familyRoster(): readonly RosterChild[] {
  return ROSTER;
}

/**
 * Resolve a `?child=` value.
 *
 * Case-insensitive and whitespace-trimmed, because a Custom GPT will
 * cheerfully send "Clara". Anything else returns `null`, and the route turns
 * that into a generic 404 — see docs/family-api/security.md for why that policy
 * discloses nothing here.
 */
export function resolveChildSlug(raw: string | null): RosterChild | null {
  if (raw === null) return null;

  const slug = raw.trim().toLowerCase();
  // A long value is rejected before it is compared, so an oversized parameter
  // costs a length check rather than five string comparisons.
  if (slug === "" || slug.length > 32) return null;

  return ROSTER.find((child) => child.id === slug) ?? null;
}

/* ------------------------------------------------------------------ */
/* Birthdays                                                           */
/* ------------------------------------------------------------------ */

export type UpcomingBirthday = {
  /** "Daddy", "Hannah" — the name the family uses, never a legal name. */
  person: string;
  /** `YYYY-MM-DD` of the next occurrence. */
  date: string;
  daysAway: number;
};

/**
 * Birthdays inside the reminder window, soonest first.
 *
 * **No ages, ever.** The parents' entries in `config/family-birthdays.json`
 * carry no year at all for exactly this reason, and a child's age is not
 * derived here even though it could be. There is no question the GPT can
 * usefully answer that needs to know how old Daddy is turning, and the field
 * that does not exist is the field that cannot leak.
 */
export function upcomingBirthdays(
  today: string,
  options: { windowDays?: number; max: number },
): { items: UpcomingBirthday[]; truncated: boolean } {
  const window = options.windowDays ?? BIRTHDAY_WINDOW_DAYS;

  const found: UpcomingBirthday[] = [];

  for (const entry of birthdays.birthdays) {
    const monthDay = parseMonthDay(entry.date);
    if (!monthDay) continue;

    const next = daysUntilAnniversary(monthDay, today);
    if (!next || next.daysAway > window) continue;

    found.push({
      person: entry.displayName,
      date: next.date,
      daysAway: next.daysAway,
    });
  }

  // Soonest first, then alphabetically so two birthdays on one day have a
  // stable order — an unstable order would change the ETag for no reason.
  found.sort(
    (a, b) => a.daysAway - b.daysAway || a.person.localeCompare(b.person),
  );

  return {
    items: found.slice(0, options.max),
    truncated: found.length > options.max,
  };
}
