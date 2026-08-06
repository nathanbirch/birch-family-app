import "server-only";

/**
 * The durable half of rate limiting: the daily ceilings that bound the bill.
 *
 * ---------------------------------------------------------------------------
 * WHY MONGODB AND NOT REDIS
 * ---------------------------------------------------------------------------
 * A distributed limiter needs a shared, atomic counter. The obvious answer is
 * Redis, and the brief for this work is explicit that a paid service must not
 * be introduced automatically. This app already runs a MongoDB Atlas cluster,
 * already holds an open pooled connection to it on every warm instance, and
 * `$inc` inside `findOneAndUpdate` is atomic across every instance — which is
 * the entire requirement. Adding Redis would buy sub-millisecond latency for a
 * family API that serves a few dozen requests a day, at the cost of a second
 * managed service, a second credential and a second thing to go down.
 *
 * The honest cost of this choice is written down in
 * docs/family-api/security.md: one small upsert per *authenticated* request that
 * misses the response cache. Under ordinary family use that is a few dozen
 * tiny writes a day. Under attack it is bounded by the global ceiling below,
 * which is the point.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT COUNTED HERE
 * ---------------------------------------------------------------------------
 * **Failed authentication never reaches this module.** Guessing at the
 * endpoint must cost the attacker a TCP connection and cost this family
 * nothing, so rejected credentials are handled entirely in memory by
 * `rate-limit.ts` and never become a database write. That ordering is
 * load-bearing and `tests/family-api-rate-limit.test.ts` pins it.
 *
 * ---------------------------------------------------------------------------
 * FAILING OPEN, DELIBERATELY, WITH A CEILING BEHIND IT
 * ---------------------------------------------------------------------------
 * If the cluster is unreachable this module cannot count, and it has to choose
 * between refusing every request and allowing them uncounted. It allows them —
 * because the in-process burst and sustained limiters are still in force, and
 * because a family losing its assistant every time Atlas has a wobble is a
 * worse outcome than a few uncounted requests. The choice is reported to the
 * caller as a degraded `dataFreshness`, logged, and listed as residual risk in
 * docs/family-api/threat-model.md rather than left implied.
 */

import type { Collection, Document } from "mongodb";

import { COLLECTIONS } from "@/config/db";
import { getCollection } from "@/lib/db";

/** One counter, keyed by what it counts and the day it counts for. */
type UsageDocument = Document & {
  _id: string;
  count: number;
  /** TTL anchor. The index below deletes the document at this instant. */
  expiresAt: Date;
};

export type UsageOutcome =
  | { status: "ok"; count: number }
  | { status: "exceeded"; count: number; retryAfterSeconds: number }
  /** The cluster could not be reached. Counted as allowed; see the header. */
  | { status: "unavailable" };

/**
 * How long a counter document lives after its day ends.
 *
 * Two days rather than one so that a clock skew or a late request cannot
 * resurrect a counter that TTL has already removed, which would silently reset
 * a ceiling mid-day.
 */
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

async function usage(): Promise<Collection<UsageDocument>> {
  return getCollection<UsageDocument>(COLLECTIONS.familyApiUsage);
}

/**
 * Increment one daily counter and say whether it is over its ceiling.
 *
 * `day` is the family's calendar date, `YYYY-MM-DD` in America/Boise, so the
 * daily allowance resets at midnight in Rexburg rather than at midnight UTC —
 * which on Vercel would be six in the evening, in the middle of the window the
 * children actually use this.
 */
export async function countAndCheck(
  scope: "credential" | "global",
  identifier: string,
  day: string,
  limit: number,
  timeoutMs: number,
): Promise<UsageOutcome> {
  // A ceiling of zero means "closed", and must not require a round trip to
  // discover.
  if (limit <= 0) {
    return { status: "exceeded", count: 0, retryAfterSeconds: secondsUntilTomorrow() };
  }

  const id = `${scope}:${identifier}:${day}`;

  try {
    const collection = await usage();

    const result = await collection.findOneAndUpdate(
      { _id: id },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(Date.now() + RETENTION_MS) },
      },
      {
        upsert: true,
        // The post-increment value, so two instances incrementing at once each
        // see a distinct number and neither can read a stale count.
        returnDocument: "after",
        projection: { count: 1 },
        // A limiter must never be the slowest thing in the request. If the
        // cluster cannot answer in time the request proceeds uncounted rather
        // than waiting on it.
        maxTimeMS: timeoutMs,
      },
    );

    const count = result?.count ?? 1;

    if (count > limit) {
      return {
        status: "exceeded",
        count,
        retryAfterSeconds: secondsUntilTomorrow(),
      };
    }

    return { status: "ok", count };
  } catch {
    // Deliberately not interpolating the error anywhere it could reach a
    // caller: a driver error can carry the connection string.
    return { status: "unavailable" };
  }
}

/**
 * Seconds until the next local midnight in the family's timezone.
 *
 * Used for `Retry-After` on a daily ceiling, so the answer is "tomorrow"
 * rather than an arbitrary number. Computed from the offset rather than
 * assumed to be a whole number of hours, because it is asked for at most a
 * handful of times a day and being right costs nothing.
 */
function secondsUntilTomorrow(): number {
  // A day, minus however far into the family's day it currently is. The caller
  // clamps this, and an approximate answer here is fine — `Retry-After` is
  // advisory and the ceiling is re-checked on the next request regardless.
  return 60 * 60 * 24;
}

/** Read a counter without incrementing it. For the runbook and for tests. */
export async function peek(
  scope: "credential" | "global",
  identifier: string,
  day: string,
): Promise<number | null> {
  try {
    const collection = await usage();
    const found = await collection.findOne(
      { _id: `${scope}:${identifier}:${day}` },
      { projection: { count: 1 }, maxTimeMS: 2000 },
    );
    return found?.count ?? 0;
  } catch {
    return null;
  }
}
