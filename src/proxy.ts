import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decryptSession } from "@/lib/auth/session-token";

/**
 * Proxy — what earlier versions of Next.js called Middleware. Renamed in
 * Next.js 16; the behaviour is the same. It runs before every matched request.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS AND IS NOT
 * ---------------------------------------------------------------------------
 * This is an *optimistic* check, and only a convenience: it verifies the
 * cookie's signature so a signed-out visitor lands on /login instead of
 * watching a protected page render and then bounce. It deliberately does NOT
 * query MongoDB.
 *
 * The reason is that proxy runs on every request including prefetches, so a
 * database round trip here would be paid many times over for each page a user
 * merely hovers. It would also make every navigation as slow as the cluster.
 *
 * The real boundary is `requireUser()` in `lib/auth/dal.ts`, which every
 * protected page calls and which does check the database. A signed cookie
 * pointing at a session that has since been revoked will get past this file
 * and be stopped there — which is the correct division of labour.
 */

/** Reachable signed out. Everything else requires a session. */
const PUBLIC_PATHS = ["/login"];

/**
 * Never redirected, in either direction.
 *
 * `/signed-out` clears a stale session cookie. It is reached precisely when
 * the cookie's signature is valid but its session is gone, so applying the
 * "signed in? go to the dashboard" rule below would bounce away the one
 * request that can fix the problem — and the loop would never break. See
 * `src/app/signed-out/route.ts`.
 */
const ALWAYS_ALLOW = ["/signed-out"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ALWAYS_ALLOW.includes(pathname)) return NextResponse.next();

  const isPublic = PUBLIC_PATHS.includes(pathname);

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await decryptSession(token);

  // Signed out, asking for a protected page: send them to log in, remembering
  // where they were headed so login can return them there.
  if (!session && !isPublic) {
    const url = new URL("/login", request.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already signed in and revisiting /login: skip straight to the dashboard.
  if (session && isPublic) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Pages only. Everything under `_next/`, and every path that ends in a file
   * extension, is skipped.
   *
   * ---------------------------------------------------------------------------
   * WHY THIS IS A PATTERN AND NOT A LIST OF FOLDERS
   * ---------------------------------------------------------------------------
   * It used to enumerate them — `icons/|scenes/|manifest.webmanifest|sw.js` —
   * and `avatars/` was missing. Every family photo therefore redirected to
   * /login, and since `next/image` optimises them by fetching the URL
   * server-side without the user's cookie, the optimiser got a redirect instead
   * of a PNG and returned 400. Every avatar rendered as a plain coloured circle.
   *
   * A list has to be updated every time a folder is added to `public/`, and
   * forgetting is silent. Matching on "has a file extension" cannot be
   * forgotten.
   *
   * Note this makes everything in `public/` reachable without signing in —
   * including the family photographs. That was already true of the scene photos
   * and icons. See docs/authentication.md#what-is-not-here.
   */
  matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
