"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker — and, in development, actively removes
 * it.
 *
 * That second job matters more than it sounds. The dev server and the
 * production server share an origin (`localhost:3000`), so a worker registered
 * by one `npm start` keeps controlling the page during every later `npm run
 * dev`. It will happily serve month-old JavaScript and stale photographs from
 * its cache, and nothing in the app would ever clear it. Unregistering here
 * means a dev reload always recovers.
 *
 * Renders nothing and fails silently: browsers without service-worker support
 * (and `http://` origins other than localhost) simply get the normal online
 * app.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void unregisterEverything();
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is a bonus; never surface this to the family.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

/**
 * Tear down any worker and cache left behind by a production build served from
 * this same origin.
 */
async function unregisterEverything(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));

    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }

    // A worker that was already controlling this page keeps doing so until the
    // page is reloaded, so the stale assets are still on screen. Reload once,
    // and only once, now that there is nothing left to serve them.
    if (registrations.length > 0 && navigator.serviceWorker.controller) {
      window.location.reload();
    }
  } catch {
    // Nothing here is essential; never break the dev page over it.
  }
}
