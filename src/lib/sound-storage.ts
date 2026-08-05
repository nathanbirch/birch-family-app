/**
 * Whether the celebration makes a noise.
 *
 * Same shape as `theme-storage` and `last-page-storage`: every access is
 * wrapped, because Safari private mode and locked-down browsers throw on
 * `localStorage`, and a preference failing to save must never break a page.
 *
 * It is a *device* preference, not a family one — deliberately. The phone on
 * the kitchen counter should cheer; the one somebody is holding in a quiet
 * room at bedtime should not, and neither device should be able to decide that
 * for the other.
 *
 * Defaults to on. A star chart that celebrates in silence until you find a
 * setting is a worse first impression than one you have to turn down.
 */

import { SOUND_STORAGE_KEY } from "@/config/app";

export function readSoundOn(): boolean {
  if (typeof window === "undefined") return true;
  try {
    // Only the explicit string "off" silences it, so a corrupted or
    // half-written value errs towards the default rather than towards silence.
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeSoundOn(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // A preference that cannot be saved is a preference that lasts one
    // session. That is the whole cost.
  }
}
