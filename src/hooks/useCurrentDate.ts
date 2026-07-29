"use client";

import { useEffect, useState } from "react";

import { isSameLocalDay, nextLocalMidnight, parseLocalDate } from "@/lib/dates";

/**
 * The device's current local date, kept fresh without a page reload.
 *
 * The first render uses the date the server rendered with, so hydration always
 * matches. Immediately after mount we switch to the real device date, then
 * re-check at the next local midnight and whenever the app is brought back to
 * the foreground (phones freeze timers in backgrounded tabs, and an installed
 * PWA can sit open for days).
 *
 * State only changes when the *calendar day* changes, so nothing re-renders or
 * re-animates on a stray visibility event.
 */
export function useCurrentDate(initialIsoDate: string): Date {
  const [date, setDate] = useState<Date>(
    () => parseLocalDate(initialIsoDate) ?? new Date(),
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const now = new Date();
      setDate((previous) => (isSameLocalDay(previous, now) ? previous : now));
    };

    const scheduleMidnight = () => {
      const now = new Date();
      // One extra second of slack so we land safely past midnight.
      const delay = nextLocalMidnight(now).getTime() - now.getTime() + 1000;
      timer = setTimeout(() => {
        sync();
        scheduleMidnight();
      }, delay);
    };

    sync();
    scheduleMidnight();

    const onVisibilityChange = () => {
      if (!document.hidden) sync();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", sync);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return date;
}
