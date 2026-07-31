import type { MetadataRoute } from "next";

/**
 * The whole app is private, so nothing here should be indexed.
 *
 * Every page already sits behind a login, which is the real protection — a
 * crawler cannot reach `/seating` any more than a stranger can. But files in
 * `public/` are served without a session check (see
 * docs/authentication.md#what-is-not-here), and `/avatars/` holds photographs
 * of the children. Those are also served with an `X-Robots-Tag: noindex`
 * header from `next.config.ts`; this is the belt to that pair of braces,
 * because a well-behaved crawler reads this file before requesting anything.
 *
 * Neither is a security boundary. A crawler that ignores robots.txt ignores
 * this too. It closes the accidental-indexing case, not a determined one.
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
