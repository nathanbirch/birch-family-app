/**
 * A tiny external store for the selected theme.
 *
 * `useSyncExternalStore` is the right shape here: the theme genuinely lives
 * outside React (in `localStorage`, and on the `<html>` element, which a
 * pre-hydration script already touched). Modelling it as an external store
 * means the server can render the default while the client immediately reads
 * the stored value — without a cascading effect or a hydration mismatch.
 */

import { DEFAULT_THEME_ID, type ThemeId } from "@/config/themes";
import { readStoredTheme, writeStoredTheme } from "./theme-storage";

const listeners = new Set<() => void>();

/**
 * Cached current value. Also acts as the in-memory fallback when storage is
 * unavailable, so the picker still works in Safari private mode — it just
 * won't survive a reload there.
 */
let current: ThemeId | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

export function getThemeSnapshot(): ThemeId {
  if (current === null) current = readStoredTheme();
  return current;
}

/** The server has no storage, so it always renders the default theme. */
export function getServerThemeSnapshot(): ThemeId {
  return DEFAULT_THEME_ID;
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);

  // Another tab (or the browser's storage inspector) changed the preference.
  const onStorage = () => {
    current = readStoredTheme();
    emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setStoredTheme(themeId: ThemeId): void {
  current = themeId;
  writeStoredTheme(themeId);
  emit();
}

/** Test-only: forget the cached value so a fresh read hits storage again. */
export function resetThemeCache(): void {
  current = null;
}
