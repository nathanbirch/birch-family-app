/**
 * Reading and writing the one persisted preference: the selected theme.
 *
 * Everything is wrapped in try/catch — Safari private mode and locked-down
 * browsers throw on `localStorage` access, and losing a colour preference must
 * never break the app.
 */

import { THEME_STORAGE_KEY } from "@/config/app";
import {
  DEFAULT_THEME_ID,
  isThemeId,
  THEME_IDS,
  type ThemeId,
} from "@/config/themes";

/** The saved theme, or `DEFAULT_THEME_ID` when missing, invalid or unreadable. */
export function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

/** Persist the theme. Returns `false` if storage was unavailable. */
export function writeStoredTheme(themeId: ThemeId): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
    return true;
  } catch {
    return false;
  }
}

/** Forget the saved preference (used by the README's "reset" instructions). */
export function clearStoredTheme(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * The inline script that runs before first paint.
 *
 * Two jobs, both of which have to happen before anything is visible:
 *
 * 1. Put the saved theme on `<html>`, so there is no flash of the default one.
 * 2. Mark the document as `js`, which is what lets the seating scenes start
 *    with their avatars hidden and animate them in once the photographs have
 *    decoded. Doing it here rather than in React matters: by the time a
 *    component could add the class, the first paint has already happened and
 *    everyone would flash into place before walking in.
 *
 *    Without JavaScript the class never appears, the CSS that hides them never
 *    applies, and the scenes render fully populated and static — which is the
 *    correct fallback.
 *
 * Kept deliberately tiny and total: either failure leaves a working page.
 */
export function buildThemeInitScript(): string {
  return `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var d=${JSON.stringify(
    DEFAULT_THEME_ID,
  )};var v=localStorage.getItem(k);var a=${JSON.stringify(
    THEME_IDS,
  )};document.documentElement.setAttribute("data-theme",a.indexOf(v)>-1?v:d);}catch(e){}
try{document.documentElement.classList.add("js");}catch(e){}})();`;
}
