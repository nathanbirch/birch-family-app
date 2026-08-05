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

/** The saved page, or `null` if nothing valid is stored. */
export function readLastPage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LAST_PAGE_STORAGE_KEY);
    if (!stored || !isKnownPage(stored)) return null;
    return stored;
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
