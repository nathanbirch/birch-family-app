import { describe, expect, it, vi } from "vitest";

import { PARENTS_STORAGE_KEY, THEME_STORAGE_KEY } from "@/config/app";
import {
  getParentsSwappedSnapshot,
  getServerParentsSwappedSnapshot,
  setParentsSwapped,
  subscribeToParentsSwapped,
} from "@/lib/parent-store";
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setStoredTheme,
  subscribeToTheme,
} from "@/lib/theme-store";

/**
 * Both preferences are backed by tiny external stores rather than React state,
 * because they genuinely live in `localStorage`. These tests cover the parts
 * `useSyncExternalStore` relies on: a stable snapshot, a server snapshot that
 * matches what the server renders, and notification when another tab changes
 * the value.
 */

describe("theme store", () => {
  it("renders the default on the server, whatever is stored locally", () => {
    setStoredTheme("midnight");
    expect(getThemeSnapshot()).toBe("midnight");
    // The server has no localStorage, so it must always say Ocean — this is
    // what keeps hydration free of mismatches.
    expect(getServerThemeSnapshot()).toBe("ocean");
  });

  it("returns a stable snapshot between changes", () => {
    setStoredTheme("forest");
    expect(getThemeSnapshot()).toBe(getThemeSnapshot());
  });

  it("notifies subscribers when the theme changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    setStoredTheme("berry");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getThemeSnapshot()).toBe("berry");

    unsubscribe();
    setStoredTheme("sky");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("picks up a change made in another tab", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    window.localStorage.setItem(THEME_STORAGE_KEY, "tropical");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));

    expect(listener).toHaveBeenCalled();
    expect(getThemeSnapshot()).toBe("tropical");
    unsubscribe();
  });

  it("stops listening to other tabs once unsubscribed", () => {
    const listener = vi.fn();
    subscribeToTheme(listener)();

    window.localStorage.setItem(THEME_STORAGE_KEY, "candy");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("parent swap store", () => {
  it("renders unswapped on the server", () => {
    setParentsSwapped(true);
    expect(getParentsSwappedSnapshot()).toBe(true);
    expect(getServerParentsSwappedSnapshot()).toBe(false);
  });

  it("notifies subscribers when the parents are swapped", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToParentsSwapped(listener);

    setParentsSwapped(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getParentsSwappedSnapshot()).toBe(true);

    setParentsSwapped(false);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getParentsSwappedSnapshot()).toBe(false);

    unsubscribe();
    setParentsSwapped(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("picks up a swap made in another tab", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToParentsSwapped(listener);

    window.localStorage.setItem(PARENTS_STORAGE_KEY, "1");
    window.dispatchEvent(
      new StorageEvent("storage", { key: PARENTS_STORAGE_KEY }),
    );

    expect(listener).toHaveBeenCalled();
    expect(getParentsSwappedSnapshot()).toBe(true);
    unsubscribe();
  });

  it("keeps working in memory when storage refuses to save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    setParentsSwapped(true);
    // The preference holds for this session; it just will not be persisted.
    expect(getParentsSwappedSnapshot()).toBe(true);
    vi.restoreAllMocks();
  });
});
