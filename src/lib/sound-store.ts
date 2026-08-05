/**
 * External store for the "does the celebration make a noise" preference.
 *
 * Modelled exactly like `parent-store` and `theme-store`. The value really
 * does live outside React — in `localStorage`, and shared with any other tab —
 * so `useSyncExternalStore` is the right tool, and it is also what keeps the
 * server's first render and the client's agreeing without an effect that
 * re-renders the page a beat after it appears.
 */

import { readSoundOn, writeSoundOn } from "./sound-storage";

const listeners = new Set<() => void>();

/** Cached value, and the in-memory fallback when storage is unavailable. */
let current: boolean | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

export function getSoundOnSnapshot(): boolean {
  if (current === null) current = readSoundOn();
  return current;
}

/**
 * The server has no storage, so it renders the default: on.
 *
 * A device that has turned the sound off therefore renders one frame with the
 * speaker lit before hydration corrects it. That is the right way round — the
 * alternative is every device rendering "muted" first, which would flicker for
 * everyone instead of for the few who changed it.
 */
export function getServerSoundOnSnapshot(): boolean {
  return true;
}

export function subscribeToSoundOn(listener: () => void): () => void {
  listeners.add(listener);

  // Another tab changed the preference.
  const onStorage = () => {
    current = readSoundOn();
    emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setSoundOn(on: boolean): void {
  current = on;
  writeSoundOn(on);
  emit();
}

/** Test-only: forget the cached value so a fresh read hits storage again. */
export function resetSoundCache(): void {
  current = null;
}
