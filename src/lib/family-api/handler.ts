import "server-only";

/**
 * The request pipeline. One file, one order, no exceptions.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER IS THE DESIGN
 * ---------------------------------------------------------------------------
 * Each stage below is cheaper than the one after it, and no stage may be
 * reached without passing every stage before it. Read top to bottom, a request
 * costs:
 *
 *   1. kill switches          two string comparisons
 *   2. request shape          a length check and a parameter walk
 *   3. authentication         two SHA-256 digests, constant time
 *   4. auth-failure limiter   one map lookup            <- attacks stop here
 *   5. burst + sustained      two map lookups
 *   6. durable ceilings       one indexed upsert        <- costs stop here
 *   7. response cache         one map lookup
 *   8. the actual work        the database and the calendar
 *
 * The consequence worth stating: **an attacker without the key never gets past
 * stage 4**, and stage 4 touches no network and no database. Guessing at this
 * endpoint costs the guesser a TCP handshake and costs this family nothing at
 * all. That is the single most important property in this file, and reordering
 * stages 3–6 would quietly destroy it.
 *
 * Equally: a *stolen* key gets past stage 4 but not past stage 6, which is
 * durable and shared across instances. The worst a working credential can do
 * is spend its daily allowance.
 *
 * ---------------------------------------------------------------------------
 * FAILING CLOSED
 * ---------------------------------------------------------------------------
 * Both kill switches are checked before anything else and both default to
 * "off". An unconfigured deployment, a deployment whose environment variables
 * failed to load, and a deployment somebody switched off in a hurry all behave
 * identically: 503, no work done, nothing read.
 */

import { authenticate, type KeyVersion } from "./auth";
import { cacheKey, etagFor, matchesEtag, readCache, writeCache } from "./cache";
import {
  LIMITS,
  getCacheTtlSeconds,
  getRateLimits,
  getRequestTimeoutMs,
  isDenyAll,
  isEnabled,
} from "./config";
import { buildChildVisibleFamilyContext, serialiseWithinBudget } from "./context";
import {
  errorResponse,
  jsonResponse,
  newCorrelationId,
  notModifiedResponse,
  type ErrorCode,
} from "./errors";
import { resolveChildSlug } from "./family";
import { logRequest, sizeBucket, sourceKey, type RequestLog } from "./logging";
import { checkAuthFailure, checkBurst, checkSustained } from "./rate-limit";
import { gatherContextInput } from "./sources";
import { countAndCheck } from "./usage";
import { familyNow } from "./time";
import { TIMEZONE } from "./config";

export type HandlerOptions = {
  /** `true` for a HEAD request: everything runs, the body is not sent. */
  bodyless?: boolean;
};

/**
 * Serve `GET /api/family/v1/family-context`.
 *
 * Takes a plain `Request` rather than Next's `NextRequest`, so the whole
 * pipeline can be exercised from a test with a hand-built request and no
 * framework in the way.
 */
export async function handleFamilyContext(
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const startedAt = Date.now();
  const correlationId = newCorrelationId();

  const log: RequestLog = {
    correlationId,
    endpoint: "/api/family/v1/family-context",
    method: request.method,
    status: 0,
    durationMs: 0,
  };

  const finish = (response: Response): Response => {
    log.status = response.status;
    log.durationMs = Date.now() - startedAt;
    logRequest(log);
    return response;
  };

  const fail = (code: ErrorCode, retryAfterSeconds?: number): Response =>
    finish(errorResponse(code, { correlationId, retryAfterSeconds }));

  /* -- 1. Kill switches -------------------------------------------- */

  if (isDenyAll() || !isEnabled()) {
    return fail("temporarily_unavailable", 3600);
  }

  /* -- 2. Request shape -------------------------------------------- */

  const shape = checkRequestShape(request);
  if (!shape.ok) return fail("bad_request");

  /* -- 3. Authentication ------------------------------------------- */

  const auth = authenticate(request.headers.get("authorization"));

  if (!auth.ok) {
    log.authFailure = auth.reason;

    /* -- 4. Auth-failure limiter. No database, ever. --------------- */
    const limits = getRateLimits();
    const decision = checkAuthFailure(sourceKey(request.headers), {
      limit: limits.authFailPerMinute,
      blockSeconds: limits.authFailBlockSeconds,
    });

    if (!decision.allowed) {
      log.limit = "auth-fail";
      return fail("rate_limited", decision.retryAfterSeconds);
    }

    return fail("unauthorized");
  }

  log.keyVersion = auth.keyVersion;

  /* -- 5. Per-credential in-process limiters ----------------------- */

  const limits = getRateLimits();
  const credential: KeyVersion = auth.keyVersion;

  const burst = checkBurst(credential, limits.burstPerMinute);
  if (!burst.allowed) {
    log.limit = "burst";
    return fail("rate_limited", burst.retryAfterSeconds);
  }

  const sustained = checkSustained(credential, limits.sustainedPerHour);
  if (!sustained.allowed) {
    log.limit = "sustained";
    return fail("rate_limited", sustained.retryAfterSeconds);
  }

  /* -- 6. Durable daily ceilings ----------------------------------- */

  // The family's calendar day, so the allowance resets at midnight in Rexburg
  // rather than at six in the evening, which is what midnight UTC would be.
  const day = familyNow(new Date(), TIMEZONE).date;
  const usageTimeout = Math.min(2000, getRequestTimeoutMs());

  const perCredential = await countAndCheck(
    "credential",
    credential,
    day,
    limits.dailyPerCredential,
    usageTimeout,
  );
  if (perCredential.status === "exceeded") {
    log.limit = "daily";
    return fail("rate_limited", perCredential.retryAfterSeconds);
  }

  const global = await countAndCheck(
    "global",
    "all",
    day,
    limits.dailyGlobal,
    usageTimeout,
  );
  if (global.status === "exceeded") {
    // The global ceiling is a circuit breaker rather than a per-caller quota,
    // so it answers 503: the service is closed for the day, not "you in
    // particular have had enough".
    log.limit = "global";
    return fail("temporarily_unavailable", global.retryAfterSeconds);
  }

  const countingDegraded =
    perCredential.status === "unavailable" || global.status === "unavailable";

  /* -- 7. Response cache ------------------------------------------- */

  const child = resolveChildSlug(shape.child);

  // A `child` that was supplied but named nobody is a 404 rather than a
  // silent fall back to the family-wide view — see docs/family-api/security.md
  // for the policy and why it discloses nothing here.
  if (shape.child !== null && child === null) return fail("not_found");

  log.childRequested = shape.child !== null;

  const key = cacheKey(child?.id ?? null);
  const ttl = getCacheTtlSeconds();

  const cached = readCache(key);
  if (cached) {
    log.cache = "hit";
    log.sizeBucket = sizeBucket(Buffer.byteLength(cached.body, "utf8"));

    const success = {
      correlationId,
      etag: cached.etag,
      maxAgeSeconds: ttl,
      cacheHit: true,
      bodyless: options.bodyless,
    };

    if (matchesEtag(request.headers.get("if-none-match"), cached.etag)) {
      return finish(notModifiedResponse(success));
    }
    return finish(rawJson(cached.body, success));
  }

  log.cache = "miss";

  /* -- 8. The work ------------------------------------------------- */

  let body: string;
  let etag: string;

  try {
    const input = await gatherContextInput({
      child,
      timeoutMs: getRequestTimeoutMs(),
    });

    if (countingDegraded && !input.degraded.includes("usage-counters")) {
      input.degraded.push("usage-counters");
    }
    if (input.degraded.length > 0) log.degraded = input.degraded.join(",");

    const context = buildChildVisibleFamilyContext(input);
    const serialised = serialiseWithinBudget(context);

    body = serialised.body;
    etag = etagFor(body);
  } catch {
    // Nothing about the failure reaches the caller. The correlation id is in
    // both the log line and the response, which is the only link between them.
    return fail("temporarily_unavailable", 60);
  }

  writeCache(key, body, etag, ttl);
  log.sizeBucket = sizeBucket(Buffer.byteLength(body, "utf8"));

  const success = {
    correlationId,
    etag,
    maxAgeSeconds: ttl,
    cacheHit: false,
    bodyless: options.bodyless,
  };

  if (matchesEtag(request.headers.get("if-none-match"), etag)) {
    return finish(notModifiedResponse(success));
  }

  return finish(rawJson(body, success));
}

/* ------------------------------------------------------------------ */
/* Request shape                                                       */
/* ------------------------------------------------------------------ */

type ShapeResult =
  | { ok: true; child: string | null }
  | { ok: false };

/**
 * Everything about the request that can be rejected before any work.
 *
 * Strict on purpose. An unrecognised query parameter is a 400 rather than
 * something to ignore, because a caller sending `?children=` has misunderstood
 * the API and should be told so, and because a permissive parser is where
 * cache-key confusion starts. A repeated `?child=` is likewise a 400: picking
 * one of two values silently is how two requests end up sharing a cache entry
 * they should not.
 */
export function checkRequestShape(request: Request): ShapeResult {
  if (request.url.length > LIMITS.maxUrlLength) return { ok: false };

  // A GET with a body is not a GET. `Content-Length` is checked rather than
  // the body itself so that nothing is read off the socket.
  const length = request.headers.get("content-length");
  if (length !== null && Number(length) > 0) return { ok: false };
  if (request.headers.get("transfer-encoding") !== null) return { ok: false };

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return { ok: false };
  }

  const seen = new Set<string>();
  for (const [name] of url.searchParams) {
    if (!LIMITS.allowedQueryParams.includes(name)) return { ok: false };
    if (seen.has(name)) return { ok: false };
    seen.add(name);
  }

  const child = url.searchParams.get("child");
  if (child !== null && child.length > 32) return { ok: false };

  return { ok: true, child };
}

/* ------------------------------------------------------------------ */
/* Sending an already-serialised body                                  */
/* ------------------------------------------------------------------ */

/**
 * `jsonResponse` takes an object and serialises it. Here the body is already
 * a string — from the cache, or from the size-bounded serialiser — and
 * re-parsing it only to re-serialise it would be work for nothing and a chance
 * to produce different bytes than the ETag was computed over.
 */
function rawJson(
  body: string,
  options: Parameters<typeof jsonResponse>[1],
): Response {
  const response = jsonResponse(null, options);
  return new Response(options.bodyless ? null : body, {
    status: 200,
    headers: response.headers,
  });
}
