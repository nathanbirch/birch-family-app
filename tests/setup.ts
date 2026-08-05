import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

import { resetParentsSwappedCache } from "@/lib/parent-store";
import { resetSoundCache } from "@/lib/sound-store";
import { resetThemeCache } from "@/lib/theme-store";

/*
 * This file runs for every test file, including the handful that opt into the
 * Node environment with `@vitest-environment node` — the server-only modules,
 * which have no DOM and no browser stores to reset.
 *
 * Everything below is therefore guarded on there being a `window` at all.
 */
const isBrowserLike = typeof window !== "undefined";

// jsdom does not implement matchMedia; the theme picker uses it to decide
// between the bottom sheet and the anchored popover.
if (isBrowserLike && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  if (!isBrowserLike) return;
  // The stores cache their values across renders, exactly as they do in the
  // browser; each test starts from a clean slate.
  resetThemeCache();
  resetParentsSwappedCache();
  resetSoundCache();
});

afterEach(() => {
  if (!isBrowserLike) return;
  cleanup();
  window.localStorage.clear();
  resetThemeCache();
  resetParentsSwappedCache();
  resetSoundCache();
  document.documentElement.removeAttribute("data-theme");
});
