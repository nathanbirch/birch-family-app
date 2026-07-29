import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { ServiceWorker } from "@/components/ServiceWorker";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeStyles } from "@/components/ThemeStyles";
import { APP_DESCRIPTION, APP_NAME } from "@/config/app";
import { DEFAULT_THEME_ID, getTheme } from "@/config/themes";
import { buildThemeInitScript } from "@/lib/theme-storage";

import "./globals.css";

const defaultTheme = getTheme(DEFAULT_THEME_ID);

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Static default; ThemeProvider updates this at runtime where supported.
  themeColor: defaultTheme.colors.browserThemeColor,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    // The server always renders the default theme; the inline script below
    // swaps in the stored one before the first paint, so `data-theme` may
    // legitimately differ from the server markup.
    <html
      lang="en"
      data-theme={DEFAULT_THEME_ID}
      className="h-full"
      suppressHydrationWarning
    >
      <head>
        <ThemeStyles />
        {/*
          Runs before paint, so there is no flash of the default theme.
          `beforeInteractive` makes Next emit this into the initial HTML rather
          than letting React try to render a <script> element on the client.
        */}
        <Script id="theme-init" strategy="beforeInteractive">
          {buildThemeInitScript()}
        </Script>
      </head>
      <body className="flex min-h-full flex-col antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
