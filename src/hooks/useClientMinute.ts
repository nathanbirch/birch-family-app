"use client";

import { useSyncExternalStore } from "react";

/**
 * The device's own clock, rounded down to the minute — and `null` on the server.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * A timestamp cannot be rendered on the server in this app. Vercel runs in UTC
 * and the family does not, so "4:12 pm" formatted during the server render and
 * "4:12 pm" formatted again during hydration are two different strings for the
 * same instant, and React reports a mismatch. `null` is the honest server answer:
 * *this machine does not know what time it is where you are.* Whoever renders a
 * time asks for one and draws nothing until it arrives, which is one paint later.
 *
 * ---------------------------------------------------------------------------
 * WHY THE MINUTE, AND WHY AN EXTERNAL STORE
 * ---------------------------------------------------------------------------
 * `useSyncExternalStore` compares snapshots by value, so a `getSnapshot` that
 * returned `Date.now()` would return something new every call and re-render
 * forever. Rounding to the minute makes it stable *and* is exactly the precision
 * anything displaying a time of day needs — which is what lets the value also be
 * kept fresh, so a row that says "Yesterday" starts doing so at midnight rather
 * than at the next reload.
 *
 * This is the same shape as `useReducedMotion`: a value that genuinely lives
 * outside React, read without an effect and therefore without a first paint that
 * has to be corrected.
 */

const MINUTE_MS = 60_000;

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, MINUTE_MS);
  /*
   * Phones freeze timers in a backgrounded tab, so an installed PWA left open
   * for a day would come back with a clock from whenever it was last awake.
   * Re-reading on return costs nothing and is the only thing that keeps a
   * long-lived tab honest.
   */
  const onWake = () => onChange();
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onWake);
    window.removeEventListener("focus", onWake);
  };
}

function getSnapshot(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

function getServerSnapshot(): null {
  return null;
}

export function useClientMinute(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
