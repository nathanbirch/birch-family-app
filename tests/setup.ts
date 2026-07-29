import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

import { resetParentsSwappedCache } from "@/lib/parent-store";
import { resetThemeCache } from "@/lib/theme-store";

// jsdom does not implement matchMedia; the theme picker uses it to decide
// between the bottom sheet and the anchored popover.
if (typeof window.matchMedia !== "function") {
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
  // The stores cache their values across renders, exactly as they do in the
  // browser; each test starts from a clean slate.
  resetThemeCache();
  resetParentsSwappedCache();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetThemeCache();
  resetParentsSwappedCache();
  document.documentElement.removeAttribute("data-theme");
});
