/**
 * Reading and writing the parent-swap preference.
 *
 * Same shape as `theme-storage`: every access is wrapped, because Safari
 * private mode and locked-down browsers throw on `localStorage`, and losing a
 * seating preference must never break the app.
 */

import { PARENTS_STORAGE_KEY } from "@/config/app";

/** Stored as the strings "1" and "0" so an old or corrupt value is obvious. */
const SWAPPED = "1";
const NOT_SWAPPED = "0";

/** `false` when nothing is saved, the value is unrecognised, or storage fails. */
export function readParentsSwapped(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PARENTS_STORAGE_KEY) === SWAPPED;
  } catch {
    return false;
  }
}

/** Persist the preference. Returns `false` if storage was unavailable. */
export function writeParentsSwapped(swapped: boolean): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(
      PARENTS_STORAGE_KEY,
      swapped ? SWAPPED : NOT_SWAPPED,
    );
    return true;
  } catch {
    return false;
  }
}

/** Forget the preference, returning to the configured default seats. */
export function clearParentsSwapped(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(PARENTS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
