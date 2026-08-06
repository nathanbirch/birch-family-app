import "server-only";

/**
 * What this API writes down, and everything it deliberately does not.
 *
 * ---------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------
 * These logs exist to answer two operational questions — "is somebody
 * attacking this" and "why did that request fail" — and no others. Anything
 * that does not serve one of those is not collected, because a log line about
 * a child is still a record about a child, and one that sits in a hosting
 * provider's dashboard for a fortnight is a record this family did not have
 * before.
 *
 * So, never logged, at any level:
 *
 *   - the `Authorization` header, or any part of a key, ever
 *   - a child's name, or which child was asked about
 *   - chore text, calendar titles, announcements, birth dates
 *   - the query string
 *   - the response body, or any field from it
 *   - a raw IP address
 *
 * And logged, because each earns it:
 *
 *   - a correlation id, so a family member's "it said something was wrong at
 *     about four" can be matched to a line
 *   - the outcome, and for a failure the internal reason
 *   - the duration and a coarse response-size bucket, so a slow or fat
 *     response is visible without recording what was in it
 *   - which key version authenticated, so a rotation can be watched
 *   - whether a child was named — the boolean, never the name
 *
 * ---------------------------------------------------------------------------
 * ADDRESSES
 * ---------------------------------------------------------------------------
 * The auth-failure limiter needs to tell one source from another, which needs
 * something stable per source, which is the one legitimate use for the caller's
 * address here. It is never stored or printed in the clear: it is HMACed with a
 * per-process random salt, truncated to 12 hex characters, and used only as a
 * map key. The salt is generated at boot and never persisted, so the mapping
 * cannot be reversed by anyone — including this family — and does not survive a
 * restart. A hash that could be reversed by rainbow-tabling the whole IPv4
 * space would be a plain address wearing a costume, which is why it is keyed
 * rather than plain SHA-256.
 */

import { createHmac, randomBytes } from "node:crypto";

import type { AuthFailure, KeyVersion } from "./auth";

/**
 * Per-process, per-boot, never written down.
 *
 * On `globalThis` so `next dev`'s module reloading does not hand every saved
 * file a fresh salt and thereby reset every block.
 */
declare global {
  var __birchFamilyApiLogSalt: Buffer | undefined;
}

function salt(): Buffer {
  globalThis.__birchFamilyApiLogSalt ??= randomBytes(32);
  return globalThis.__birchFamilyApiLogSalt;
}

/**
 * A stable, non-reversible key for a request source.
 *
 * Vercel puts the client address in `x-forwarded-for`; the first entry is the
 * one the platform saw, and everything after it was supplied by whoever was in
 * front and is not trusted. When there is no header at all — a local `curl`, a
 * unit test — every caller shares one bucket, which is the conservative
 * direction: a limiter that cannot tell callers apart limits them together.
 */
export function sourceKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();

  // A header long enough to be an attack on the hash function is not an
  // address. Bound it before hashing.
  const address = first && first.length <= 64 ? first : "unknown";

  return createHmac("sha256", salt())
    .update(address)
    .digest("hex")
    .slice(0, 12);
}

/**
 * A coarse bucket for a response size.
 *
 * The exact byte count of a family-context response is a weak signal about how
 * many events are on the calendar today, which is not a thing this log needs to
 * know. Four buckets are enough to spot a response that has grown unexpectedly.
 */
export function sizeBucket(bytes: number): string {
  if (bytes < 1024) return "<1k";
  if (bytes < 8 * 1024) return "1k-8k";
  if (bytes < 32 * 1024) return "8k-32k";
  return ">32k";
}

export type RequestLog = {
  correlationId: string;
  endpoint: string;
  method: string;
  status: number;
  durationMs: number;
  /** Only present once a request has authenticated. */
  keyVersion?: KeyVersion;
  /** Only present on a rejection. Never sent to the caller. */
  authFailure?: AuthFailure;
  /** Which limit stopped it, if one did. */
  limit?: "auth-fail" | "burst" | "sustained" | "daily" | "global";
  cache?: "hit" | "miss";
  sizeBucket?: string;
  /** Whether a `child` parameter was supplied. Never *which* child. */
  childRequested?: boolean;
  /** Set when a data source degraded — never the underlying error text. */
  degraded?: string;
};

/**
 * Emit one line per request.
 *
 * One line, structured, on `console` — which is where Vercel's log drain reads
 * from, and which needs no dependency. `warn` for anything a person should
 * look at, `info` for the rest, so a log level filters the noise without
 * losing the signal.
 */
export function logRequest(entry: RequestLog): void {
  const line = JSON.stringify({ tag: "family-api", ...entry });
  if (entry.status >= 400) console.warn(line);
  else console.info(line);
}
