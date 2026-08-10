import type { NextConfig } from "next";

/** A year, in seconds. The longest `max-age` browsers will honour. */
const ONE_YEAR = 60 * 60 * 24 * 365;

const nextConfig: NextConfig = {
  /*
   * No `output` setting, so this builds as a server-rendered app.
   *
   * It used to be `output: "export"` — a pile of static files served by GitHub
   * Pages. That stopped being possible the moment the app grew a login:
   * sessions, password checks and MongoDB queries all need a Node process
   * handling the request, and a static host has none. See docs/deployment.md
   * for the move to Vercel.
   *
   * `images.unoptimized` went with it. On Vercel the default `next/image`
   * loader resizes and re-encodes on demand, and negotiates WebP or AVIF —
   * which takes a 33KB PNG avatar down to under 6KB.
   */

  async redirects() {
    return [
      /*
       * The page has had three names. `/seating` stopped describing it when
       * the pets landed on it; `/rotations` was accurate but not a word anyone
       * in this house says out loud. Bookmarks, home-screen shortcuts and
       * anything a family member typed from memory still work.
       *
       * Both point straight at `/turns` rather than chaining through each
       * other, so nobody pays two round trips for a rename they were not part
       * of.
       *
       * Deliberately **temporary** (307) rather than permanent (308). A 308 is
       * cached by the browser more or less forever, which is a bad trade
       * whenever there is no SEO to preserve — and there is none here: the
       * whole app is `noindex` and behind a login, so no crawler has ever seen
       * any of these URLs. All a permanent redirect would buy is a saved round
       * trip, at the price of a rule no device could ever be told to forget.
       * This page having been renamed twice is the argument, not against it.
       */
      { source: "/seating", destination: "/turns", permanent: false },
      { source: "/rotations", destination: "/turns", permanent: false },

      /*
       * The weekly report became Ceremonies, which is what the family calls
       * the thing it has always been. One week's ceremony keeps its Monday, so
       * the sub-path is carried across rather than dropping a bookmarked week
       * on the index.
       */
      { source: "/report", destination: "/ceremonies", permanent: false },
      {
        source: "/report/:week",
        destination: "/ceremonies/:week",
        permanent: false,
      },
    ];
  },

  async headers() {
    return [
      {
        /*
         * Avatar filenames carry a content hash (see
         * `scripts/optimise-avatars.mjs`), so a given URL can never mean two
         * different pictures. That is exactly the condition `immutable`
         * requires: the browser may keep it for a year and never revalidate.
         * Replacing a photo changes the hash, so the new URL is fetched and
         * the old one is simply never asked for again.
         */
        source: "/avatars/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: `public, max-age=${ONE_YEAR}, immutable`,
          },
          /*
           * Nothing in `public/` sits behind the login — `next/image` fetches
           * images server-side without the user's cookie, so gating these
           * paths breaks every avatar. Hashed filenames make the URLs
           * unguessable; this stops the ones that do leak from being indexed.
           *
           * Obscurity, not a boundary. See docs/authentication.md.
           */
          { key: "X-Robots-Tag", value: "noindex, nofollow, noimageindex" },
        ],
      },
      {
        // Pet photographs are content-hashed by `scripts/optimise-pets.mjs`
        // exactly as the avatars are, so they earn the same treatment for the
        // same reasons.
        source: "/pets/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: `public, max-age=${ONE_YEAR}, immutable`,
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noimageindex" },
        ],
      },
      {
        // Content-hashed by `scripts/generate-cheer.mjs`, so it earns exactly
        // what the avatars and pet photos do. Generating a different cheer
        // changes the hash, and the old URL is simply never asked for again.
        source: "/sounds/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: `public, max-age=${ONE_YEAR}, immutable`,
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // Not content-hashed, so it must revalidate — but it may be reused
        // while it does, which keeps repeat navigations instant.
        source: "/scenes/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noimageindex" },
        ],
      },
      {
        source: "/icons/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        /*
         * The service worker must never be served from cache, or a device can
         * be pinned to an old worker — and therefore an old cache of the whole
         * app — indefinitely.
         */
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
