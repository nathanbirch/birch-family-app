/**
 * `GET /api/family/v1/family-context`
 *
 * The only endpoint the Birch Family Custom GPT calls for live data. Read-only
 * by construction: this file exports `GET` and `HEAD` and nothing else, so
 * Next.js answers `POST`, `PUT`, `PATCH` and `DELETE` with 405 without any
 * code here having to remember to. `tests/family-api-route.test.ts` asserts that
 * this module's exports are exactly those two, which is a stronger promise
 * than "we did not write a mutation" — it is checked on every run.
 *
 * All of the actual work is in `lib/family-api/handler.ts`. This file is
 * deliberately thin, because a route file is the one place a framework upgrade
 * is most likely to touch.
 */

import { handleFamilyContext } from "@/lib/family-api/handler";

/**
 * Never prerendered, never cached by the framework.
 *
 * The response depends on the `Authorization` header and on the current time
 * in Rexburg, neither of which Next can see when it decides whether to
 * prerender. Caching is done deliberately and briefly inside the handler
 * instead, keyed by child — see `lib/family-api/cache.ts`.
 */
export const dynamic = "force-dynamic";

/**
 * Node, not Edge.
 *
 * The MongoDB driver and `node:crypto`'s `timingSafeEqual` both need it. The
 * constant-time comparison in `lib/family-api/auth.ts` is not optional, so this
 * is not a preference.
 */
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleFamilyContext(request);
}

/**
 * HEAD runs the whole pipeline and sends no body.
 *
 * Declared explicitly rather than left to the framework so that it is counted,
 * rate-limited and authenticated exactly as GET is — a HEAD that skipped the
 * ceilings would be a free way to probe the endpoint.
 */
export async function HEAD(request: Request): Promise<Response> {
  return handleFamilyContext(request, { bodyless: true });
}
