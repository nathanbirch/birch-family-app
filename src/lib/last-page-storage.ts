/**
 * Reading and writing the last page the user was on.
 *
 * Same shape as `theme-storage` and `parent-storage`: every access is wrapped,
 * because Safari private mode and locked-down browsers throw on
 * `localStorage`, and losing a navigation convenience must never break the app.
 *
 * The stored value is always validated against `NAV_ITEMS` on the way out. That
 * is not paranoia about the user's own storage — it is what makes deleting or
 * renaming a route safe. A stale `/chores` left behind by an older build would
 * otherwise send the app to a 404 on every launch, and the user would have no
 * idea why or how to clear it.
 */

import { LAST_PAGE_STORAGE_KEY } from "@/config/app";
import { NAV_ITEMS } from "@/config/navigation";

/** `true` when `value` is one of the app's real pages. */
export function isKnownPage(value: string): boolean {
  return NAV_ITEMS.some((item) => item.href === value);
}

/**
 * Routes that have been renamed, and where they went.
 *
 * Validation alone would be *safe* without this — an unknown `/seating` is
 * simply ignored and the app opens on Home — but it would silently forget
 * where every existing device was, on the one launch after the rename. The
 * server redirects the old URL too (`next.config.ts`); this is the same
 * courtesy for the copy of it living in `localStorage`.
 *
 * An entry can be dropped once no device could plausibly still be holding the
 * old value, which for an app opened most days is a matter of weeks.
 */
const RENAMED_PAGES: Record<string, string> = {
  // Renamed when the pets landed on the page and "seating" described half of
  // what was on it, then again from "rotations" to the word the family
  // actually uses. Both map straight to the current path — an entry here is a
  // lookup, not a chain, so a device that missed the middle name is fine.
  "/seating": "/turns",
  "/rotations": "/turns",
};

/** The saved page, or `null` if nothing valid is stored. */
export function readLastPage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LAST_PAGE_STORAGE_KEY);
    if (!stored) return null;
    const current = RENAMED_PAGES[stored] ?? stored;
    if (!isKnownPage(current)) return null;
    return current;
  } catch {
    return null;
  }
}

/**
 * Remember `pathname`. Unknown paths are ignored rather than stored, so a
 * redirect through some future route can never become the landing page.
 * Returns `false` if the path was rejected or storage was unavailable.
 */
export function writeLastPage(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  if (!isKnownPage(pathname)) return false;
  try {
    window.localStorage.setItem(LAST_PAGE_STORAGE_KEY, pathname);
    return true;
  } catch {
    return false;
  }
}

/** Forget the saved page, so the next launch lands on the dashboard. */
export function clearLastPage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(LAST_PAGE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
