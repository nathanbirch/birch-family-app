"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Resolves once every `<img>` inside `ref` has finished loading.
 *
 * Used to hold the seating arrival animation until all seven photographs are
 * decoded, so the scene never plays people walking to their seats as blank
 * circles that fill in afterwards.
 *
 * ---------------------------------------------------------------------------
 * WHY IT WATCHES THE RENDERED IMAGES
 * ---------------------------------------------------------------------------
 * The obvious approach — preload the avatar URLs with `new Image()` — is
 * wrong here. The page requests avatars through Next's image optimiser, so the
 * real URL carries a width and quality (`/_next/image?url=…&w=384&q=75`) that
 * this hook has no reliable way to reproduce. Preloading `/avatars/x.png`
 * instead would download every photograph a second time, at full size, purely
 * to decide when to start an animation.
 *
 * Watching the elements that are already on the page costs nothing extra. They
 * are rendered from the first paint — merely transparent — so the browser has
 * been fetching them the whole time.
 */
export function useImagesReady(
  ref: RefObject<HTMLElement | null>,
  {
    /**
     * Re-run when this changes. The seating scenes remount on a week rollover,
     * which replaces every `<img>`, so readiness has to be measured again.
     */
    key,
    /**
     * Give up waiting and animate anyway. A broken or very slow photograph
     * should delay the scene, never withhold it — a family looking at an empty
     * table because one file 404'd is far worse than a slightly early walk-in.
     */
    timeoutMs = 4000,
  }: { key?: unknown; timeoutMs?: number } = {},
): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    setReady(false);
    let cancelled = false;
    const done = () => {
      if (!cancelled) setReady(true);
    };

    const images = Array.from(node.querySelectorAll("img"));
    if (images.length === 0) {
      done();
      return;
    }

    const settled = images.map(
      (image) =>
        new Promise<void>((resolve) => {
          // `complete` covers the common case by far: a cached avatar is
          // already decoded before React has finished hydrating.
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          // An image that fails still counts as settled. See `timeoutMs`.
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    );

    const timer = setTimeout(done, timeoutMs);
    void Promise.all(settled).then(done);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ref, key, timeoutMs]);

  return ready;
}
