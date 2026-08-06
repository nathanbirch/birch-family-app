/**
 * `GET /api/family/v1/health`
 *
 * ---------------------------------------------------------------------------
 * WHAT A HEALTH ENDPOINT MUST NOT BE
 * ---------------------------------------------------------------------------
 * The instinct is to make this useful: report the framework version, the
 * region, whether MongoDB answered, how long it took. Every one of those is a
 * gift to somebody deciding whether this deployment is worth attacking, and
 * none of them helps the one caller this endpoint exists for. So it returns
 * two fields and touches nothing.
 *
 * In particular it does **not** query the database. A health check that hits
 * the cluster is a health check that can be used to hit the cluster — an
 * unauthenticated one would be a free amplifier, and even an authenticated one
 * would put the endpoint's cost on the wrong side of the rate limiters.
 *
 * ---------------------------------------------------------------------------
 * IT REQUIRES THE SAME CREDENTIAL
 * ---------------------------------------------------------------------------
 * Vercel needs no unauthenticated health probe — it has its own. So this one
 * authenticates exactly as the context endpoint does, and is separately rate
 * limited so that hammering it cannot consume the context endpoint's
 * allowance.
 *
 * The body is `{ "status": "ok" }` and there is no other value it can take. A
 * `degraded` state was considered and dropped: by the time a caller has
 * authenticated, every fault this endpoint could report has already been ruled
 * out, so the field would only ever have described something the caller was
 * about to be told anyway by `dataFreshness` on the real endpoint.
 */

import { authenticate } from "@/lib/family-api/auth";
import { getRateLimits, isDenyAll, isEnabled } from "@/lib/family-api/config";
import { errorResponse, jsonResponse, newCorrelationId } from "@/lib/family-api/errors";
import { logRequest, sourceKey } from "@/lib/family-api/logging";
import { checkAuthFailure, checkBurst } from "@/lib/family-api/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const correlationId = newCorrelationId();

  const respond = (response: Response): Response => {
    logRequest({
      correlationId,
      endpoint: "/api/family/v1/health",
      method: request.method,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  };

  if (isDenyAll() || !isEnabled()) {
    return respond(
      errorResponse("temporarily_unavailable", { correlationId, retryAfterSeconds: 3600 }),
    );
  }

  const limits = getRateLimits();
  const auth = authenticate(request.headers.get("authorization"));

  if (!auth.ok) {
    const decision = checkAuthFailure(sourceKey(request.headers), {
      limit: limits.authFailPerMinute,
      blockSeconds: limits.authFailBlockSeconds,
    });
    if (!decision.allowed) {
      return respond(
        errorResponse("rate_limited", {
          correlationId,
          retryAfterSeconds: decision.retryAfterSeconds,
        }),
      );
    }
    return respond(errorResponse("unauthorized", { correlationId }));
  }

  // Its own bucket, so a health probe in a loop cannot eat the context
  // endpoint's burst allowance.
  const burst = checkBurst(`health:${auth.keyVersion}`, limits.burstPerMinute);
  if (!burst.allowed) {
    return respond(
      errorResponse("rate_limited", {
        correlationId,
        retryAfterSeconds: burst.retryAfterSeconds,
      }),
    );
  }

  const payload = { status: "ok" };

  return respond(
    jsonResponse(payload, {
      correlationId,
      etag: '"health-ok"',
      maxAgeSeconds: 0,
      cacheHit: false,
    }),
  );
}

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}
