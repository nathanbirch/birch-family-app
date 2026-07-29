/**
 * External store for the parent-swap preference.
 *
 * Modelled exactly like `theme-store`: the value really does live outside
 * React (in `localStorage`), so `useSyncExternalStore` is the right tool and
 * the header button and the seating board share one source of truth without
 * needing a context provider.
 */

import { readParentsSwapped, writeParentsSwapped } from "./parent-storage";

const listeners = new Set<() => void>();

/**
 * Cached current value, and the in-memory fallback when storage is
 * unavailable — the swap still works there, it just won't survive a reload.
 */
let current: boolean | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

export function getParentsSwappedSnapshot(): boolean {
  if (current === null) current = readParentsSwapped();
  return current;
}

/** The server has no storage, so it always renders the configured seats. */
export function getServerParentsSwappedSnapshot(): boolean {
  return false;
}

export function subscribeToParentsSwapped(listener: () => void): () => void {
  listeners.add(listener);

  // Another tab changed the preference.
  const onStorage = () => {
    current = readParentsSwapped();
    emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setParentsSwapped(swapped: boolean): void {
  current = swapped;
  writeParentsSwapped(swapped);
  emit();
}

/** Test-only: forget the cached value so a fresh read hits storage again. */
export function resetParentsSwappedCache(): void {
  current = null;
}
