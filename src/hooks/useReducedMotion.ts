"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this device has asked for less movement.
 *
 * Almost all of this app's motion is CSS, and CSS answers this question by
 * itself in `globals.css` — which is the right place for it, because a media
 * query cannot be forgotten the way a hook can. This exists for the one thing
 * CSS cannot do: the weekly report counts a child's stars *up* from zero, and
 * a number counting itself is animation written in JavaScript.
 *
 * `useSyncExternalStore` rather than an effect, for the usual reason — the
 * value lives outside React, and reading it this way avoids a first paint that
 * animates followed by a correction.
 *
 * The server has no media queries, so it renders as though motion were fine.
 * A device that asked for less then corrects on hydration, before any
 * animation has had time to start.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(listener: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function getSnapshot(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
