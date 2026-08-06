"use client";

import { useEffect, useState } from "react";

import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * A number that counts itself up — the grand totals on the ceremony slides.
 *
 * The whole point of a ceremony is the moment the total lands, and a number
 * that simply *appears* is a fact. A number that races up to 63 and stops is
 * an event: it takes a second, everybody watches it, and the child sees how
 * big their own week was as it arrives.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A CSS ANIMATION
 * ---------------------------------------------------------------------------
 * It cannot be. CSS can animate the presentation of a number but not its
 * digits — there is no property whose computed value is "63". So this is one
 * of the two or three things in the app that animates on the main thread, and
 * it is deliberately cheap: one `requestAnimationFrame` loop, one small text
 * node re-rendered per frame, landing exactly on the target rather than on
 * wherever the easing happened to round to.
 *
 * ---------------------------------------------------------------------------
 * IT IS A COMPONENT, NOT A HOOK, AND IT COUNTS FROM MOUNT
 * ---------------------------------------------------------------------------
 * Every slide of the ceremony is mounted at once so they can be dragged
 * between, so "start when this slide appears" cannot mean "start on mount" for
 * the slide itself. It can for *this*: the slides re-key their contents each
 * time they come on stage (see `ChildSlide`), so this component is mounted
 * fresh for every visit and counting from mount is exactly right. It also
 * means there is no reset path to get wrong — coming back to a child's slide
 * plays their moment again rather than showing the answer.
 *
 * Under `prefers-reduced-motion` the target is there from the first frame.
 * Nothing is lost: the number was always the message and the counting was
 * always the flourish.
 */
export function CountUp({
  target,
  durationMs,
  delayMs = 0,
}: {
  target: number;
  durationMs: number;
  /** Held back until the rest of the slide has finished arriving. */
  delayMs?: number;
}) {
  const reduced = useReducedMotion();
  // Hydration renders as though motion were fine (see `useReducedMotion`), so
  // a device that asked for less is corrected by the effect below rather than
  // by this initial value.
  const [value, setValue] = useState(() => (reduced ? target : 0));

  useEffect(() => {
    if (target <= 0) return;

    let frame: number;

    if (reduced) {
      // One frame, so this is not a synchronous setState inside an effect —
      // and so a device whose preference flipped after hydration still lands
      // on the number rather than sitting at zero.
      frame = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frame);
    }

    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const elapsed = now - start - delayMs;
      if (elapsed >= 0) {
        const progress = Math.min(1, elapsed / durationMs);
        // Ease out: fast at first, then settling. A linear count reads as a
        // machine counting; this reads as a drum roll.
        setValue(Math.round(target * (1 - (1 - progress) ** 3)));
        if (progress >= 1) return;
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, delayMs, reduced]);

  return <>{value}</>;
}
