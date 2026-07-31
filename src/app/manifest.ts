import type { MetadataRoute } from "next";

import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME } from "@/config/app";
import { DEFAULT_THEME_ID, getTheme } from "@/config/themes";

/**
 * The manifest is the same for everyone and never changes between requests, so
 * it is resolved once at build time rather than re-rendered per request.
 *
 * `proxy.ts` excludes `/manifest.webmanifest` from its matcher — a phone
 * fetches it before there is any session, and redirecting it to /login would
 * break installing the app to the home screen.
 */
export const dynamic = "force-static";

/**
 * The web app manifest, generated from the same config as the rest of the app
 * so renaming the app in `config/app.ts` renames the installed icon too.
 */
export default function manifest(): MetadataRoute.Manifest {
  const theme = getTheme(DEFAULT_THEME_ID);

  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: theme.colors.browserThemeColor,
    background_color: theme.colors.background,
    categories: ["lifestyle", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
