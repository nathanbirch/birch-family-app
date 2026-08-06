/**
 * A very small, very short-lived response cache.
 *
 * ---------------------------------------------------------------------------
 * WHY CACHE AT ALL
 * ---------------------------------------------------------------------------
 * A Custom GPT will happily call an action two or three times inside one
 * answer. Each call, uncached, is two collection scans, an indexed lookup and
 * a calendar expansion — none of it expensive, all of it pointless when the
 * answer forty seconds ago is still the answer. Caching turns a chatty model
 * into a cheap one, which is a cost control as much as a latency one.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS SO SHORT
 * ---------------------------------------------------------------------------
 * Because the data it holds is a chore chart. A child ticks a star and asks
 * the assistant whether they are finished; a five-minute cache would tell them
 * no, and be wrong, and sound certain. Forty-five seconds is long enough to
 * absorb a model's repeated calls within one exchange and short enough that
 * nothing a child does in the app is contradicted for meaningfully long.
 *
 * ---------------------------------------------------------------------------
 * THE KEY IS THE WHOLE ANSWER TO "WHOSE DATA IS THIS"
 * ---------------------------------------------------------------------------
 * One child's context must never be served under another's key. The key is
 * built here, from the resolved child id — not from the raw query string,
 * which could be `Clara`, `clara`, `clara%20`, or `clara&child=emily`, all
 * naming different keys for the same answer or, worse, the same key for
 * different ones. Resolution happens first, against the allowlist, and this
 * function only ever sees one of six values: the five ids, or `family`.
 *
 * The cache is per-process, so a cold instance simply misses. That is the
 * right failure: a miss costs a database read, and there is no correctness
 * risk in the way there would be for a shared cache keyed carelessly.
 */

import { createHash } from "node:crypto";

/** What is stored. The body is kept serialised so a hit costs no JSON work. */
type Entry = {
  body: string;
  etag: string;
  /** Epoch ms after which this entry must not be served. */
  expiresAt: number;
};

/**
 * A hard ceiling on entries.
 *
 * There are six possible keys — five children and the family-wide view — so
 * this is never reached in practice. It is here because a cache with no bound
 * is a memory leak waiting for a bug in the key builder, and the ceiling costs
 * one comparison.
 */
const MAX_ENTRIES = 16;

declare global {
  var __birchFamilyApiResponseCache: Map<string, Entry> | undefined;
}

function store(): Map<string, Entry> {
  globalThis.__birchFamilyApiResponseCache ??= new Map();
  return globalThis.__birchFamilyApiResponseCache;
}

/**
 * The cache key for a request.
 *
 * `childId` must already have been resolved against the allowlist in
 * `family.ts`. Passing a raw query value here would be a bug, and the type
 * says so as loudly as a type can.
 */
export function cacheKey(childId: string | null): string {
  return childId === null ? "family" : `child:${childId}`;
}

/**
 * A strong ETag over the body.
 *
 * Strong rather than weak because it is a hash of the exact bytes: two
 * responses with the same ETag are byte-identical, so a 304 is always safe.
 * `generatedAt` changes every second, so this will rarely match across the
 * cache boundary — which is fine. Its job is to make a *repeated* call inside
 * the TTL free on the wire, not to pretend nothing changed.
 */
export function etagFor(body: string): string {
  return `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
}

export function readCache(key: string, now: number = Date.now()): Entry | null {
  const entry = store().get(key);
  if (!entry) return null;

  if (entry.expiresAt <= now) {
    store().delete(key);
    return null;
  }

  return entry;
}

export function writeCache(
  key: string,
  body: string,
  etag: string,
  ttlSeconds: number,
  now: number = Date.now(),
): void {
  const entries = store();

  if (entries.size >= MAX_ENTRIES && !entries.has(key)) {
    // Drop the oldest insertion. `Map` preserves insertion order, so this is
    // the first key it yields.
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }

  entries.set(key, { body, etag, expiresAt: now + ttlSeconds * 1000 });
}

/** Empty the cache. The runbook's answer to "how do I purge it". */
export function clearCache(): void {
  store().clear();
}

/**
 * Whether a request's `If-None-Match` matches.
 *
 * Handles the list form (`"a", "b"`) that RFC 9110 permits, and `*`. Does not
 * handle weak validators, because this API never issues one.
 */
export function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;

  return header
    .split(",")
    .map((candidate) => candidate.trim())
    .includes(etag);
}
