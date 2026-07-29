"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { SWAP_DURATION_MS } from "@/config/seating";
import {
  getParentsSwappedSnapshot,
  getServerParentsSwappedSnapshot,
  setParentsSwapped,
  subscribeToParentsSwapped,
} from "@/lib/parent-store";

export type ParentSwap = {
  /** `true` when the parents are sitting in each other's configured seats. */
  swapped: boolean;
  /** `true` while the two parents are gliding across to trade places. */
  swapping: boolean;
  toggle: () => void;
};

/**
 * The parent-swap preference, plus a short-lived `swapping` flag the scenes
 * use to arc the two parents past each other instead of having them slide
 * flatly through the table.
 */
export function useParentSwap(): ParentSwap {
  const swapped = useSyncExternalStore(
    subscribeToParentsSwapped,
    getParentsSwappedSnapshot,
    getServerParentsSwappedSnapshot,
  );

  const [swapping, setSwapping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const toggle = useCallback(() => {
    setParentsSwapped(!getParentsSwappedSnapshot());
    setSwapping(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSwapping(false), SWAP_DURATION_MS);
  }, []);

  return { swapped, swapping, toggle };
}
