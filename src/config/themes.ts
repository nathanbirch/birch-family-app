/**
 * All ten themes live here, and nowhere else.
 *
 * Components never reference a theme id or a hex value — they read the
 * semantic CSS custom properties that `ThemeProvider` writes onto `<html>`.
 * To restyle the whole app, edit the values below.
 */

export type ThemeId =
  | "ocean"
  | "tropical"
  | "sunset"
  | "purple"
  | "forest"
  | "berry"
  | "sky"
  | "sunshine"
  | "midnight"
  | "candy";

/** Colours shared by every surface and control. */
export type ThemeColors = {
  primary: string;
  primaryHover: string;
  /** Readable text/icon colour when placed on `primary`. */
  onPrimary: string;
  secondary: string;
  accent: string;
  background: string;
  backgroundDecorative: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  focus: string;
  shadow: string;
  browserThemeColor: string;
};

/**
 * Scene tokens for the two photographic seating views.
 *
 * The scenes are real photographs of the family's table and Expedition, so a
 * theme tints and frames them rather than recolouring furniture.
 */
export type ThemeScene = {
  /** Wash laid over the photo so it belongs to the active theme. */
  overlay: string;
  /** Ring drawn around the photo. */
  frame: string;
  /** Padding area behind the photo, inside the card. */
  floor: string;
};

export type AppTheme = {
  id: ThemeId;
  name: string;
  isDark?: boolean;
  colors: ThemeColors;
  scene: ThemeScene;
};

export const THEMES: readonly AppTheme[] = [
  {
    id: "ocean",
    name: "Ocean",
    colors: {
      primary: "#0369a1",
      primaryHover: "#075985",
      onPrimary: "#ffffff",
      secondary: "#0ea5e9",
      accent: "#06b6d4",
      background: "#eef8fd",
      backgroundDecorative: "#cbe8f8",
      surface: "#ffffff",
      surfaceMuted: "#f0f8fc",
      text: "#0b2b3f",
      textMuted: "#4a6b80",
      border: "#cde3f0",
      focus: "#0284c7",
      shadow: "rgba(3, 58, 90, 0.16)",
      browserThemeColor: "#0369a1",
    },
    scene: {
      overlay: "rgba(3, 105, 161, 0.14)",
      frame: "rgba(3, 105, 161, 0.30)",
      floor: "#daedf8",
    },
  },
  {
    id: "tropical",
    name: "Tropical",
    colors: {
      primary: "#0f766e",
      primaryHover: "#115e59",
      onPrimary: "#ffffff",
      secondary: "#16a34a",
      accent: "#f59e0b",
      background: "#eefbf5",
      backgroundDecorative: "#c6efdf",
      surface: "#ffffff",
      surfaceMuted: "#effaf5",
      text: "#0c3b32",
      textMuted: "#45756a",
      border: "#cbe9dd",
      focus: "#0f766e",
      shadow: "rgba(6, 60, 50, 0.16)",
      browserThemeColor: "#0f766e",
    },
    scene: {
      overlay: "rgba(15, 118, 110, 0.14)",
      frame: "rgba(15, 118, 110, 0.30)",
      floor: "#dbf3e8",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    colors: {
      primary: "#c53f2e",
      primaryHover: "#a83122",
      onPrimary: "#ffffff",
      secondary: "#f97316",
      accent: "#f43f5e",
      background: "#fff6ee",
      backgroundDecorative: "#ffdcc4",
      surface: "#ffffff",
      surfaceMuted: "#fff2e8",
      text: "#44231a",
      textMuted: "#7c5245",
      border: "#f6dbc8",
      focus: "#c53f2e",
      shadow: "rgba(120, 50, 20, 0.16)",
      browserThemeColor: "#c53f2e",
    },
    scene: {
      overlay: "rgba(197, 63, 46, 0.14)",
      frame: "rgba(197, 63, 46, 0.30)",
      floor: "#ffe9da",
    },
  },
  {
    id: "purple",
    name: "Purple",
    colors: {
      primary: "#7c3aed",
      primaryHover: "#6528d4",
      onPrimary: "#ffffff",
      secondary: "#4f46e5",
      accent: "#c084fc",
      background: "#f7f4ff",
      backgroundDecorative: "#e2d8fd",
      surface: "#ffffff",
      surfaceMuted: "#f5f1ff",
      text: "#2d1b56",
      textMuted: "#61548a",
      border: "#e1d8f7",
      focus: "#7c3aed",
      shadow: "rgba(60, 30, 110, 0.16)",
      browserThemeColor: "#7c3aed",
    },
    scene: {
      overlay: "rgba(124, 58, 237, 0.14)",
      frame: "rgba(124, 58, 237, 0.30)",
      floor: "#eae2fb",
    },
  },
  {
    id: "forest",
    name: "Forest",
    colors: {
      primary: "#166534",
      primaryHover: "#14532d",
      onPrimary: "#ffffff",
      secondary: "#4d7c0f",
      accent: "#7fa987",
      background: "#f4f7f1",
      backgroundDecorative: "#dbe7d4",
      surface: "#ffffff",
      surfaceMuted: "#f1f5ed",
      text: "#1b2b1e",
      textMuted: "#53624d",
      border: "#d7e1d1",
      focus: "#166534",
      shadow: "rgba(25, 50, 30, 0.16)",
      browserThemeColor: "#166534",
    },
    scene: {
      overlay: "rgba(22, 101, 52, 0.14)",
      frame: "rgba(22, 101, 52, 0.30)",
      floor: "#e2eadc",
    },
  },
  {
    id: "berry",
    name: "Berry",
    colors: {
      primary: "#be123c",
      primaryHover: "#9f1239",
      onPrimary: "#ffffff",
      secondary: "#86198f",
      accent: "#f472b6",
      background: "#fff5f8",
      backgroundDecorative: "#fbd4e3",
      surface: "#ffffff",
      surfaceMuted: "#fdf1f5",
      text: "#48112a",
      textMuted: "#835063",
      border: "#f5d6e1",
      focus: "#be123c",
      shadow: "rgba(110, 20, 50, 0.16)",
      browserThemeColor: "#be123c",
    },
    scene: {
      overlay: "rgba(190, 18, 60, 0.14)",
      frame: "rgba(190, 18, 60, 0.30)",
      floor: "#fbe1ea",
    },
  },
  {
    id: "sky",
    name: "Sky",
    colors: {
      primary: "#1d4ed8",
      primaryHover: "#1e40af",
      onPrimary: "#ffffff",
      secondary: "#0ea5e9",
      accent: "#60a5fa",
      background: "#f6fafd",
      backgroundDecorative: "#d8e8f8",
      surface: "#ffffff",
      surfaceMuted: "#f1f6fb",
      text: "#16253c",
      textMuted: "#4b6076",
      border: "#dae4ee",
      focus: "#1d4ed8",
      shadow: "rgba(20, 40, 70, 0.15)",
      browserThemeColor: "#1d4ed8",
    },
    scene: {
      overlay: "rgba(29, 78, 216, 0.14)",
      frame: "rgba(29, 78, 216, 0.30)",
      floor: "#e4edf7",
    },
  },
  {
    id: "sunshine",
    name: "Sunshine",
    colors: {
      primary: "#b45309",
      primaryHover: "#92400e",
      onPrimary: "#ffffff",
      secondary: "#d97706",
      accent: "#fbbf24",
      background: "#fffaef",
      backgroundDecorative: "#ffeabc",
      surface: "#ffffff",
      surfaceMuted: "#fff7e6",
      text: "#3f2f10",
      textMuted: "#786230",
      border: "#f4e2bd",
      focus: "#b45309",
      shadow: "rgba(120, 90, 20, 0.16)",
      browserThemeColor: "#b45309",
    },
    scene: {
      overlay: "rgba(180, 83, 9, 0.16)",
      frame: "rgba(180, 83, 9, 0.30)",
      floor: "#ffefcc",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    isDark: true,
    colors: {
      primary: "#38bdf8",
      primaryHover: "#7dd3fc",
      onPrimary: "#0a1424",
      secondary: "#818cf8",
      accent: "#a78bfa",
      background: "#101a2e",
      backgroundDecorative: "#1c2b47",
      surface: "#182440",
      surfaceMuted: "#1f2d4c",
      text: "#e9effc",
      textMuted: "#a9b8d4",
      border: "#31446b",
      focus: "#7dd3fc",
      shadow: "rgba(2, 6, 18, 0.55)",
      browserThemeColor: "#101a2e",
    },
    scene: {
      overlay: "rgba(9, 16, 30, 0.55)",
      frame: "rgba(56, 189, 248, 0.35)",
      floor: "#152036",
    },
  },
  {
    id: "candy",
    name: "Candy",
    colors: {
      primary: "#0e7490",
      primaryHover: "#155e75",
      onPrimary: "#ffffff",
      secondary: "#db2777",
      accent: "#8b5cf6",
      background: "#fdf6fb",
      backgroundDecorative: "#fbdcef",
      surface: "#ffffff",
      surfaceMuted: "#fcf2f9",
      text: "#2b2340",
      textMuted: "#645a7d",
      border: "#eedcea",
      focus: "#0e7490",
      shadow: "rgba(80, 40, 90, 0.15)",
      browserThemeColor: "#0e7490",
    },
    scene: {
      overlay: "rgba(14, 116, 144, 0.14)",
      frame: "rgba(219, 39, 119, 0.30)",
      floor: "#fbe4f2",
    },
  },
] as const;

export const DEFAULT_THEME_ID: ThemeId = "ocean";

export const THEME_IDS: readonly ThemeId[] = THEMES.map((theme) => theme.id);

const THEMES_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES_BY_ID.has(value as ThemeId);
}

/** Always returns a theme — falls back to Ocean for anything unrecognised. */
export function getTheme(id: string | null | undefined): AppTheme {
  if (isThemeId(id)) return THEMES_BY_ID.get(id)!;
  return THEMES_BY_ID.get(DEFAULT_THEME_ID)!;
}

/** The two or three swatch colours shown in the theme picker preview. */
export function themeSwatches(theme: AppTheme): string[] {
  return [theme.colors.primary, theme.colors.secondary, theme.colors.accent];
}

/**
 * Maps a theme onto the semantic custom properties consumed by `globals.css`.
 * This is the single place where a token name meets a theme value.
 */
export function themeCssVariables(theme: AppTheme): Record<string, string> {
  const { colors, scene } = theme;
  return {
    "--color-primary": colors.primary,
    "--color-primary-hover": colors.primaryHover,
    "--color-on-primary": colors.onPrimary,
    "--color-secondary": colors.secondary,
    "--color-accent": colors.accent,
    "--color-page-background": colors.background,
    "--color-page-decoration": colors.backgroundDecorative,
    "--color-surface": colors.surface,
    "--color-surface-muted": colors.surfaceMuted,
    "--color-text": colors.text,
    "--color-text-muted": colors.textMuted,
    "--color-border": colors.border,
    "--color-focus-ring": colors.focus,
    "--color-shadow": colors.shadow,
    "--scene-overlay": scene.overlay,
    "--scene-frame": scene.frame,
    "--scene-floor": scene.floor,
  };
}
