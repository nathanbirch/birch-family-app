import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemePicker } from "@/components/ThemePicker";
import { ThemeProvider, useAppTheme } from "@/components/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/config/app";
import {
  DEFAULT_THEME_ID,
  getTheme,
  isThemeId,
  THEMES,
  THEME_IDS,
  themeCssVariables,
} from "@/config/themes";
import {
  buildThemeInitScript,
  clearStoredTheme,
  readStoredTheme,
  writeStoredTheme,
} from "@/lib/theme-storage";

const REQUIRED_COLORS = [
  "primary",
  "primaryHover",
  "onPrimary",
  "secondary",
  "accent",
  "background",
  "backgroundDecorative",
  "surface",
  "surfaceMuted",
  "text",
  "textMuted",
  "border",
  "focus",
  "shadow",
  "browserThemeColor",
] as const;

describe("theme configuration", () => {
  it("configures exactly ten themes", () => {
    expect(THEMES).toHaveLength(10);
  });

  it("gives every theme a unique id", () => {
    expect(new Set(THEME_IDS).size).toBe(10);
  });

  it("gives every theme every required semantic colour", () => {
    for (const theme of THEMES) {
      for (const key of REQUIRED_COLORS) {
        expect(theme.colors[key], `${theme.id}.${key}`).toBeTruthy();
      }
      // The photographic scenes need their own tokens too.
      for (const key of ["overlay", "frame", "floor"] as const) {
        expect(theme.scene[key], `${theme.id}.scene.${key}`).toBeTruthy();
      }
    }
  });

  it("emits a CSS custom property for every token", () => {
    for (const theme of THEMES) {
      const variables = themeCssVariables(theme);
      expect(variables["--color-primary"]).toBe(theme.colors.primary);
      expect(variables["--color-page-background"]).toBe(theme.colors.background);
      expect(variables["--scene-overlay"]).toBe(theme.scene.overlay);
      for (const [name, value] of Object.entries(variables)) {
        expect(name.startsWith("--"), name).toBe(true);
        expect(value, name).toBeTruthy();
      }
    }
  });

  it("defaults to Ocean", () => {
    expect(DEFAULT_THEME_ID).toBe("ocean");
    expect(getTheme(undefined).id).toBe("ocean");
  });

  it("marks Midnight as the only dark theme", () => {
    const dark = THEMES.filter((theme) => theme.isDark);
    expect(dark).toHaveLength(1);
    expect(dark[0].id).toBe("midnight");
    // A dark theme still needs real contrast, not near-black on near-black.
    expect(dark[0].colors.background).not.toBe("#000000");
    expect(dark[0].colors.text).not.toBe(dark[0].colors.textMuted);
  });

  it("validates theme ids", () => {
    expect(isThemeId("tropical")).toBe(true);
    expect(isThemeId("chartreuse")).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(getTheme("chartreuse").id).toBe(DEFAULT_THEME_ID);
  });
});

describe("theme storage", () => {
  it("returns Ocean when nothing is saved", () => {
    expect(readStoredTheme()).toBe("ocean");
  });

  it("restores a valid saved theme", () => {
    writeStoredTheme("forest");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("forest");
    expect(readStoredTheme()).toBe("forest");
  });

  it("falls back to Ocean for an invalid saved theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "not-a-theme");
    expect(readStoredTheme()).toBe("ocean");
  });

  it("can be cleared back to the default", () => {
    writeStoredTheme("berry");
    expect(clearStoredTheme()).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(readStoredTheme()).toBe("ocean");
  });

  it("does not throw when localStorage is unavailable", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    const setSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    expect(() => readStoredTheme()).not.toThrow();
    expect(readStoredTheme()).toBe("ocean");
    expect(writeStoredTheme("berry")).toBe(false);

    spy.mockRestore();
    setSpy.mockRestore();
  });
});

describe("pre-hydration init script", () => {
  /** Run the generated script in a sandbox that mimics the browser. */
  function runScript(stored: string | null) {
    const root = { attr: null as string | null };
    const sandbox = {
      localStorage: {
        getItem: () => stored,
      },
      document: {
        documentElement: {
          setAttribute: (_name: string, value: string) => {
            root.attr = value;
          },
        },
      },
    };
    const fn = new Function(
      "localStorage",
      "document",
      buildThemeInitScript(),
    );
    fn(sandbox.localStorage, sandbox.document);
    return root.attr;
  }

  it("applies a valid saved theme before paint", () => {
    expect(runScript("midnight")).toBe("midnight");
  });

  it("falls back to Ocean for a missing or unknown theme", () => {
    expect(runScript(null)).toBe("ocean");
    expect(runScript("chartreuse")).toBe("ocean");
    expect(runScript("")).toBe("ocean");
  });

  it("knows about every configured theme", () => {
    for (const id of THEME_IDS) {
      expect(runScript(id), id).toBe(id);
    }
  });

  it("swallows a storage failure instead of breaking the page", () => {
    const fn = new Function("localStorage", "document", buildThemeInitScript());
    expect(() =>
      fn(
        {
          getItem: () => {
            throw new Error("SecurityError");
          },
        },
        { documentElement: { setAttribute: () => {} } },
      ),
    ).not.toThrow();
  });

  it("stays small enough to inline in the document head", () => {
    expect(buildThemeInitScript().length).toBeLessThan(600);
  });
});

/* ------------------------------------------------------------------ */
/* Provider + picker                                                   */
/* ------------------------------------------------------------------ */

function ThemeReadout() {
  const { themeId, theme } = useAppTheme();
  return <p data-testid="readout">{`${themeId}:${theme.name}`}</p>;
}

function renderApp() {
  return render(
    <ThemeProvider>
      <ThemeReadout />
      <ThemePicker />
    </ThemeProvider>,
  );
}

function selectTheme(name: string) {
  const trigger = screen.getByRole("button", { name: /choose a colour theme/i });
  act(() => trigger.click());
  const option = screen.getByRole("radio", { name: new RegExp(name, "i") });
  act(() => option.click());
}

function readout(): string {
  return screen.getByTestId("readout").textContent ?? "";
}

describe("ThemeProvider and ThemePicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts on Ocean with no saved preference", () => {
    renderApp();
    expect(readout()).toBe("ocean:Ocean");
    expect(document.documentElement.getAttribute("data-theme")).toBe("ocean");
  });

  it("restores a saved theme on mount", () => {
    writeStoredTheme("midnight");
    renderApp();
    expect(readout()).toBe("midnight:Midnight");
    expect(document.documentElement.getAttribute("data-theme")).toBe("midnight");
  });

  it("falls back to Ocean when the saved theme is invalid", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "banana");
    renderApp();
    expect(readout()).toBe("ocean:Ocean");
  });

  it("shows all ten themes, with a checkmark on the active one", () => {
    renderApp();
    const trigger = screen.getByRole("button", {
      name: /choose a colour theme/i,
    });
    act(() => trigger.click());

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(10);
    // Selection is exposed non-visually, not by colour alone.
    expect(options.filter((o) => o.getAttribute("aria-checked") === "true"))
      .toHaveLength(1);
  });

  it("changes the theme, updates data-theme, and saves it", () => {
    renderApp();
    selectTheme("Tropical");

    expect(readout()).toBe("tropical:Tropical");
    expect(document.documentElement.getAttribute("data-theme")).toBe("tropical");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("tropical");
  });

  it("closes the picker after a theme is chosen", () => {
    renderApp();
    selectTheme("Berry");
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("keeps the preference across a remount", () => {
    const first = renderApp();
    selectTheme("Sunset");
    first.unmount();

    renderApp();
    expect(readout()).toBe("sunset:Sunset");
  });

  it("does not crash when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(() => renderApp()).not.toThrow();
    expect(readout()).toBe("ocean:Ocean");
  });
});
