"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { readLastPage, writeLastPage } from "@/lib/last-page-storage";

/**
 * Reopens the app on whichever page you were last looking at.
 *
 * Renders nothing. It lives in the `(app)` layout, so it only ever sees the
 * signed-in pages — `/login` and `/signed-out` are in a different part of the
 * tree and can never be remembered as a landing page.
 *
 * Two rules keep this from becoming annoying:
 *
 * 1. **It only redirects from `/`.** Open the app on any other URL — a shared
 *    link, a bookmark, a reload of `/account` — and that URL wins. Storage is
 *    a fallback for the app's own entry point, not an override of an explicit
 *    destination.
 *
 * 2. **It only redirects once per page load**, tracked by the module-level
 *    `restored` flag below. A fresh load resets it because the module is
 *    re-evaluated; a client-side navigation does not. Without this, tapping
 *    Home would bounce you straight back to Turns and the Home tab would be
 *    unreachable — the bug that makes this kind of feature infuriating.
 *
 * `replace` rather than `push`, so the entry point is not left in the history
 * stack: pressing Back from the restored page leaves the app, as expected,
 * instead of landing on a dashboard that immediately redirects again.
 *
 * There is a brief moment of dashboard before the redirect lands. Removing it
 * entirely would mean a blocking script in `<head>` reading storage before
 * first paint, which is a real cost (and a hydration hazard) for a flicker on
 * one navigation.
 */

/** Whether this page load has already had its shot at restoring. */
let restored = false;

/** Test-only: pretend this is a fresh page load again. */
export function resetLastPageRestore(): void {
  restored = false;
}

export function LastPageMemory() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!restored) {
      restored = true;

      if (pathname === "/") {
        const saved = readLastPage();
        // `readLastPage` only ever returns a known page, so this is never an
        // untrusted URL reaching `replace()`.
        if (saved && saved !== "/") {
          router.replace(saved);
          // Deliberately no write: the entry point must not overwrite the page
          // we are on our way back to, or a failed redirect would lose it.
          return;
        }
      }
    }

    writeLastPage(pathname);
  }, [pathname, router]);

  return null;
}
