/**
 * @vitest-environment node
 *
 * Which paths the proxy runs on.
 */
import { describe, expect, it } from "vitest";

import { config } from "@/proxy";

/*
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS TO PREVENT
 * ---------------------------------------------------------------------------
 * The matcher used to name the public folders one by one —
 * `icons/|scenes/|manifest.webmanifest|sw.js` — and `avatars/` was missing.
 *
 * So every family photograph was treated as a protected page and redirected to
 * /login. Worse, `next/image` optimises images by fetching the URL server-side
 * *without* the user's cookie, so the optimiser received a 307 instead of a PNG
 * and returned 400. Every avatar in both scenes rendered as a plain coloured
 * circle, and nothing in the build, the types or the test suite noticed.
 *
 * The matcher is now a pattern rather than a list, so adding a folder to
 * `public/` cannot silently break it. These tests pin both halves of that:
 * assets are skipped, pages are not.
 */

const MATCHER = new RegExp(`^${config.matcher[0]}$`);
const runsOn = (pathname: string) => MATCHER.test(pathname);

describe("paths the proxy must skip", () => {
  it.each([
    // The folder that was missed. Every one of these must be reachable.
    "/avatars/hannah.png",
    "/avatars/nathan.png",
    "/avatars/william.png",
    // The folders that happened to be listed.
    "/scenes/dinner-table.png",
    "/scenes/expedition.png",
    "/icons/icon-192.png",
    "/icons/icon-maskable-512.png",
    "/icons/apple-touch-icon.png",
    // Files a phone fetches before there is any session.
    "/favicon.ico",
    "/manifest.webmanifest",
    "/sw.js",
    // Next's own output.
    "/_next/static/chunks/main.js",
    "/_next/image",
  ])("skips %s", (pathname) => {
    expect(runsOn(pathname)).toBe(false);
  });

  it.each([
    "/api/family/v1/family-context",
    "/api/family/v1/health",
  ])("skips %s, which authenticates with a bearer token instead", (pathname) => {
    /*
     * Left in the matcher, a call from ChatGPT — which carries no session
     * cookie — would be redirected to /login and answered with an HTML page
     * and a 200. The route handlers do their own fail-closed authentication;
     * see src/lib/family-api/handler.ts.
     */
    expect(runsOn(pathname)).toBe(false);
  });

  it("skips any file extension, including ones not invented yet", () => {
    // The point of the pattern: a new asset folder needs no code change.
    for (const path of [
      "/anything/at/all.png",
      "/future-folder/thing.webp",
      "/deeply/nested/asset.svg",
      "/audio/mantra.mp3",
    ]) {
      expect(runsOn(path), path).toBe(false);
    }
  });
});

describe("paths the proxy must run on", () => {
  it.each([
    "/",
    "/turns",
    "/account",
    "/login",
    "/signed-out",
    // Future pages, so the pattern does not have to be revisited for them.
    "/chores",
    "/rewards/history",
    "/calendar",
    // The ChatGPT exclusion is narrow: it must not open up `/api` generally,
    // or a future cookie-authenticated route would ship without its check.
    "/api/anything-else",
    "/api/family-adjacent",
  ])("runs on %s", (pathname) => {
    expect(runsOn(pathname)).toBe(true);
  });

  it("does not mistake a path segment containing a dot for an asset", () => {
    // Only a trailing extension counts, so a page could still be nested under
    // a dotted segment without silently losing its auth check.
    expect(runsOn("/rewards/v1.2/summary")).toBe(true);
  });
});
