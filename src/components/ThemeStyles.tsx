import { THEMES, themeCssVariables } from "@/config/themes";

/**
 * Emits one `[data-theme="…"]` rule per theme, generated from
 * `config/themes.ts` so theme values live in exactly one place.
 *
 * Rendered on the server, so the pre-hydration script only has to set the
 * `data-theme` attribute — the values are already in the stylesheet and the
 * correct theme paints on the very first frame.
 */
export function ThemeStyles() {
  const css = THEMES.map((theme) => {
    const declarations = Object.entries(themeCssVariables(theme))
      .map(([property, value]) => `${property}:${value}`)
      .join(";");
    return `[data-theme="${theme.id}"]{${declarations};color-scheme:${
      theme.isDark ? "dark" : "light"
    }}`;
  }).join("");

  return <style id="app-theme-tokens">{css}</style>;
}
