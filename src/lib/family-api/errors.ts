/**
 * Every response this API can produce, and the headers on all of them.
 *
 * ---------------------------------------------------------------------------
 * ONE ERROR SHAPE, DELIBERATELY UNINFORMATIVE
 * ---------------------------------------------------------------------------
 * There is exactly one error body in this file and every failure uses it:
 *
 *     { "error": { "code": "...", "message": "...", "correlationId": "..." } }
 *
 * The messages are written for a family, not for an attacker. None of them
 * names a table, a framework, an environment variable, a limit, or which half
 * of a credential was wrong. Everything useful for diagnosis is logged
 * server-side against the correlation id instead — see `logging.ts`. That is
 * the whole trade: the person holding the logs can tell exactly what happened,
 * and the person making the request learns only that it did not work.
 *
 * The correlation id is a random 16-hex-character value with no structure. It
 * encodes no timestamp, no shard, no key, and nothing about the caller.
 */

import { randomBytes } from "node:crypto";

import { SCHEMA_VERSION } from "./config";

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "method_not_allowed"
  | "rate_limited"
  | "temporarily_unavailable";

const STATUS_FOR: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  method_not_allowed: 405,
  rate_limited: 429,
  temporarily_unavailable: 503,
};

/**
 * The only messages this API ever returns to a caller.
 *
 * Note that `unauthorized` is a single string covering a missing header, a
 * malformed header, an unknown scheme, a wrong key and a revoked key. That is
 * the point: an attacker probing the endpoint cannot tell a typo from a
 * revocation, so a leaked-then-rotated key gives no signal that it was ever
 * valid.
 */
const MESSAGE_FOR: Record<ErrorCode, string> = {
  bad_request: "The request could not be understood.",
  unauthorized: "Authentication required.",
  not_found: "No family information is available for that request.",
  method_not_allowed: "This endpoint is read-only.",
  rate_limited: "Too many requests. Try again later.",
  temporarily_unavailable:
    "Current family information is temporarily unavailable.",
};

export function newCorrelationId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * Headers every response carries, success or failure.
 *
 * `Strict-Transport-Security` is set here rather than in `next.config.ts`
 * because it is genuinely a property of this API — the whole app is HTTPS-only
 * on Vercel, but this is the surface where a downgrade would matter most, and
 * an API that states its own transport requirement does not depend on a header
 * rule somewhere else staying correct.
 *
 * There is no `Access-Control-Allow-Origin` anywhere in this file. GPT Actions
 * are server-to-server; a browser has no business calling this endpoint, and
 * omitting CORS entirely means no browser can. See docs/family-api/security.md.
 */
function baseHeaders(correlationId: string): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    // Nothing here is a web page, but a caller that renders a response as one
    // should get an inert document rather than a live one.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Correlation-Id": correlationId,
  };
}

export type ErrorOptions = {
  correlationId: string;
  /** Seconds, for 429 and 503. Emitted as `Retry-After`. */
  retryAfterSeconds?: number;
};

/**
 * Build an error response.
 *
 * Always `Cache-Control: no-store`. An error is never cacheable here: caching
 * a 401 would let one bad request poison a good one, and caching a 429 would
 * outlive the window that produced it.
 */
export function errorResponse(
  code: ErrorCode,
  options: ErrorOptions,
): Response {
  const headers: Record<string, string> = {
    ...baseHeaders(options.correlationId),
    "Cache-Control": "no-store",
  };

  if (options.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(Math.max(1, Math.ceil(options.retryAfterSeconds)));
  }

  // `WWW-Authenticate` without a realm: RFC 7235 wants the scheme, and a realm
  // string is one more thing that would describe the deployment.
  if (code === "unauthorized") headers["WWW-Authenticate"] = "Bearer";
  if (code === "method_not_allowed") headers["Allow"] = "GET, HEAD";

  const body = JSON.stringify({
    error: {
      code,
      message: MESSAGE_FOR[code],
      correlationId: options.correlationId,
    },
  });

  return new Response(body, { status: STATUS_FOR[code], headers });
}

export type SuccessOptions = {
  correlationId: string;
  /** Strong validator for the body. Enables conditional GET. */
  etag: string;
  /** Seconds the response may be reused. Mirrors the server-side cache TTL. */
  maxAgeSeconds: number;
  /** `true` when this body came from the in-process cache. Logged, not exposed. */
  cacheHit: boolean;
  /** Omit the body — used for HEAD. */
  bodyless?: boolean;
};

/**
 * A successful JSON response.
 *
 * `Cache-Control` is `private` rather than `public` even though there is no
 * browser involved: the response is derived from a credential, and a shared
 * cache that ignored the `Authorization` header could serve it to somebody who
 * did not present one. `private` plus `no-store` on every error means nothing
 * about this API is ever stored by an intermediary.
 */
export function jsonResponse(
  payload: unknown,
  options: SuccessOptions,
): Response {
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    ...baseHeaders(options.correlationId),
    "Cache-Control": `private, max-age=${options.maxAgeSeconds}, must-revalidate`,
    ETag: options.etag,
    "X-Schema-Version": SCHEMA_VERSION,
  };

  return new Response(options.bodyless ? null : body, { status: 200, headers });
}

/** A 304, which must carry the validator and nothing else of substance. */
export function notModifiedResponse(options: SuccessOptions): Response {
  return new Response(null, {
    status: 304,
    headers: {
      ...baseHeaders(options.correlationId),
      "Cache-Control": `private, max-age=${options.maxAgeSeconds}, must-revalidate`,
      ETag: options.etag,
    },
  });
}

/** Exposed for tests, so the contract is asserted rather than described. */
export const ERROR_MESSAGES = MESSAGE_FOR;
export const ERROR_STATUSES = STATUS_FOR;
