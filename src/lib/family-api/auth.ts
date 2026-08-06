import "server-only";

/**
 * Bearer authentication for the ChatGPT read-only API.
 *
 * ---------------------------------------------------------------------------
 * THIS KEY IS OURS, NOT OPENAI'S
 * ---------------------------------------------------------------------------
 * `BIRCH_FAMILY_API_KEY` is this app's own front-door lock, generated locally
 * by `npm run api:key`. It is bought from nobody and it costs nothing. Traffic
 * goes one way:
 *
 *     ChatGPT  --- Authorization: Bearer <our key> --->  this module
 *
 * ChatGPT presents it; this module checks it. Nothing in this repository ever
 * calls OpenAI, so there is no model bill and no developer account. The
 * variable used to be named `CHATGPT_API_KEY`, which read like something you
 * had to go and buy — hence this paragraph, and hence the rename.
 *
 * ---------------------------------------------------------------------------
 * A SEPARATE CREDENTIAL FROM EVERYTHING ELSE
 * ---------------------------------------------------------------------------
 * `BIRCH_FAMILY_API_KEY` shares nothing with `SESSION_SECRET`, `MONGODB_URI` or
 * `CALENDAR_ICS_URL`. It authenticates one read-only endpoint and grants
 * nothing else, so the blast radius of the copy that necessarily sits inside a
 * ChatGPT Action configuration is exactly this endpoint. Revoking it signs
 * nobody out and breaks nothing else in the app.
 *
 * ---------------------------------------------------------------------------
 * WHY THE COMPARISON IS OVER DIGESTS
 * ---------------------------------------------------------------------------
 * `timingSafeEqual` throws when the two buffers differ in length, and catching
 * that throw would itself leak the length of the real key. Hashing both sides
 * to a fixed 32 bytes first makes every comparison the same size, so the only
 * thing an attacker can time is "wrong", which is what they already knew.
 *
 * Both candidate keys are always compared, even after the first one matches.
 * Short-circuiting would make a key-one match measurably faster than a key-two
 * match, which is a small oracle about which key a caller is holding — free to
 * remove, so it is removed.
 *
 * ---------------------------------------------------------------------------
 * ROTATION
 * ---------------------------------------------------------------------------
 * Two variables are accepted at once:
 *
 *   BIRCH_FAMILY_API_KEY        the current key      -> reported as "v-current"
 *   BIRCH_FAMILY_API_KEY_NEXT   the incoming key     -> reported as "v-next"
 *
 * The overlap is what makes rotation a non-event: publish the new key as
 * `_NEXT`, paste it into the Custom GPT, watch the logs report `v-next`, then
 * promote it and delete the old one. Nothing is down at any point. Revocation
 * is the same mechanism run in a hurry — clear both variables and every request
 * fails closed within one deployment. See docs/family-api/operations-runbook.md.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** Minimum accepted key length. 43 base64url characters is 256 bits. */
export const MIN_KEY_LENGTH = 43;

export type KeyVersion = "v-current" | "v-next";

export type AuthResult =
  | { ok: true; keyVersion: KeyVersion }
  | { ok: false; reason: AuthFailure };

/**
 * Why a request was rejected. Never sent to the caller — every one of these
 * produces the identical 401 — but logged, because "the key is missing from
 * the environment" and "somebody is guessing" need very different responses.
 */
export type AuthFailure =
  | "no-keys-configured"
  | "missing-header"
  | "malformed-header"
  | "wrong-key";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * A key is usable only if it is long enough.
 *
 * A short key is treated as *absent* rather than as a weak key, so a
 * placeholder like `changeme` left in an environment variable fails closed
 * instead of protecting the endpoint with eight characters.
 */
function configuredKeys(): { version: KeyVersion; digest: Buffer }[] {
  const keys: { version: KeyVersion; digest: Buffer }[] = [];

  const current = process.env.BIRCH_FAMILY_API_KEY?.trim();
  if (current && current.length >= MIN_KEY_LENGTH) {
    keys.push({ version: "v-current", digest: digest(current) });
  }

  const next = process.env.BIRCH_FAMILY_API_KEY_NEXT?.trim();
  if (next && next.length >= MIN_KEY_LENGTH) {
    keys.push({ version: "v-next", digest: digest(next) });
  }

  return keys;
}

/**
 * Pull the token out of an `Authorization` header.
 *
 * Only `Bearer` is accepted, case-insensitively on the scheme as RFC 7235
 * requires and case-sensitively on the token. A token is never read from the
 * query string, a cookie, or any other header — see docs/family-api/security.md
 * for why a query-string secret is not an option here.
 */
export function extractBearerToken(header: string | null): string | null {
  if (!header) return null;

  // Bound the work before doing any of it: a megabyte-long header should cost
  // a length check, not a regex over a megabyte.
  if (header.length > 4096) return null;

  const match = /^Bearer[ \t]+([\x21-\x7e]+)[ \t]*$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Check a request's credentials.
 *
 * Takes the header rather than the request so it can be unit-tested without
 * constructing one, and so there is no way for this function to reach any
 * other part of the request by accident.
 */
export function authenticate(authorizationHeader: string | null): AuthResult {
  const keys = configuredKeys();

  // Fail closed. An unconfigured deployment authenticates nobody, rather than
  // accepting everybody or accepting an empty token.
  if (keys.length === 0) return { ok: false, reason: "no-keys-configured" };

  if (authorizationHeader === null || authorizationHeader.trim() === "") {
    return { ok: false, reason: "missing-header" };
  }

  const token = extractBearerToken(authorizationHeader);
  if (token === null) return { ok: false, reason: "malformed-header" };

  const presented = digest(token);

  let matched: KeyVersion | null = null;
  for (const key of keys) {
    // No short-circuit: every configured key is compared on every request.
    if (timingSafeEqual(presented, key.digest)) matched = key.version;
  }

  if (matched === null) return { ok: false, reason: "wrong-key" };
  return { ok: true, keyVersion: matched };
}

/**
 * Whether any usable key exists. Used by the health endpoint to report that
 * the API is misconfigured without saying which variable is empty.
 */
export function hasConfiguredKey(): boolean {
  return configuredKeys().length > 0;
}
