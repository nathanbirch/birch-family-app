import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session-token";

/**
 * Clears a stale session cookie, then sends you to the login page.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS: THE REDIRECT LOOP
 * ---------------------------------------------------------------------------
 * The app checks sessions in two places, on purpose (see docs/authentication.md):
 * `proxy.ts` verifies only the cookie's *signature*, cheaply, on every request;
 * `requireUser()` checks the session actually exists in the database.
 *
 * Those two can disagree. A cookie whose session has been revoked server-side —
 * deleted from the `sessions` collection, or expired and swept by the TTL index
 * — is still perfectly signed. That produced an infinite loop:
 *
 *   1. GET /turns     proxy sees a valid signature, lets it through
 *   2. requireUser()  no session document, redirects to /login
 *   3. GET /login     proxy sees a valid signature, redirects to /
 *   4. GET /          requireUser() redirects to /login … forever
 *
 * The browser gives up with ERR_TOO_MANY_REDIRECTS and the app is unusable
 * until the cookie is cleared by hand.
 *
 * Breaking the loop means deleting the stale cookie — but a Server Component
 * cannot write cookies during a render, which is exactly where `requireUser()`
 * runs. A Route Handler can. So `requireUser()` redirects here instead of
 * straight to /login, this deletes the cookie, and the next request has nothing
 * for the proxy to trust.
 *
 * `proxy.ts` must let this path through unconditionally, or it would bounce the
 * request that is trying to fix the problem.
 */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.nextUrl));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
