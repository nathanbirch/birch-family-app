"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { getTheme, type AppTheme, type ThemeId } from "@/config/themes";
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setStoredTheme,
  subscribeToTheme,
} from "@/lib/theme-store";

type ThemeContextValue = {
  themeId: ThemeId;
  theme: AppTheme;
  setTheme: (themeId: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Owns the selected theme.
 *
 * The server renders the default theme; the pre-hydration script in the root
 * layout has already put the stored theme on `<html>` by the time this mounts,
 * and `useSyncExternalStore` picks up the same value without a mismatch.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeId = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  // Keep the document in step with the store — including the case where the
  // pre-hydration script could not run at all.
  useEffect(() => {
    applyThemeToDocument(themeId);
  }, [themeId]);

  const setTheme = useCallback((next: ThemeId) => {
    setStoredTheme(next);
    // Applied immediately as well as in the effect, so the change is painted
    // in the same frame as the click.
    applyThemeToDocument(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeId, theme: getTheme(themeId), setTheme }),
    [themeId, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used inside <ThemeProvider>.");
  }
  return context;
}

/**
 * The `data-theme` attribute drives every semantic token. Updating the
 * `theme-color` meta tag tints browser chrome where that is supported, and is
 * progressive enhancement only — the theme works fine without it.
 */
function applyThemeToDocument(themeId: ThemeId): void {
  if (typeof document === "undefined") return;

  document.documentElement.setAttribute("data-theme", themeId);

  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (meta) {
    meta.setAttribute("content", getTheme(themeId).colors.browserThemeColor);
  }
}
