"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { SchoolDocument } from "@/config/documents";
import { documentImages } from "@/config/documents";

/** How far a pinch or scroll wheel can zoom, relative to "fit the screen". */
const MIN_SCALE = 1;
const MAX_SCALE = 4;

/**
 * A school document, opened full-screen, panned and zoomed with a finger.
 *
 * There is no pan/zoom library in this project — see `docs/school.md` for
 * why that is a deliberate match for the rest of the app's tooling rather
 * than an oversight. The whole thing is one `translate() scale()` on the
 * image, driven by the Pointer Events API the same way `FingerPicker` tracks
 * multiple touches: each active pointer is kept in a ref by id, a second one
 * appearing starts a pinch, and the last one lifting ends it.
 *
 * Rendered through a portal for the same reason `ThemePicker`'s panel is —
 * the card grid it opens from runs its own entrance animation, which would
 * otherwise paint underneath it.
 */
export function DocumentViewer({
  doc,
  onClose,
}: {
  doc: SchoolDocument;
  onClose: () => void;
}) {
  const images = documentImages(doc);
  const closeRef = useRef<HTMLButtonElement>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [gesturing, setGesturing] = useState(false);
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const pan = useRef<{ x: number; y: number; startX: number; startY: number } | null>(
    null,
  );

  useEffect(() => {
    closeRef.current?.focus();
    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = "hidden";
    return () => {
      style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /** Keeps the image from being panned or zoomed out past its own edges. */
  const clamp = useCallback((next: { scale: number; x: number; y: number }) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    const stage = stageRef.current;
    const maxPan = stage
      ? Math.max(0, ((scale - 1) * stage.clientWidth) / 2 + stage.clientWidth * 0.15)
      : Infinity;
    return {
      scale,
      x: Math.min(maxPan, Math.max(-maxPan, next.x)),
      y: Math.min(maxPan, Math.max(-maxPan, next.y)),
    };
  }, []);

  const resetZoom = useCallback(() => setTransform({ scale: 1, x: 0, y: 0 }), []);

  const onPointerDown = (event: React.PointerEvent) => {
    (event.target as Element).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setGesturing(true);

    if (pointers.current.size === 2) {
      pan.current = null;
      pinch.current = { distance: pinchDistance(), scale: transformRef.current.scale };
    } else if (pointers.current.size === 1) {
      const t = transformRef.current;
      pan.current = { x: t.x, y: t.y, startX: event.clientX, startY: event.clientY };
    }
  };

  const pinchDistance = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const distance = pinchDistance();
      const scale = pinch.current.scale * (distance / pinch.current.distance);
      setTransform((t) => clamp({ ...t, scale }));
      return;
    }

    if (pointers.current.size === 1 && pan.current) {
      const { x, y, startX, startY } = pan.current;
      setTransform((t) =>
        clamp({ scale: t.scale, x: x + (event.clientX - startX), y: y + (event.clientY - startY) }),
      );
    }
  };

  const endPointer = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    if (pointers.current.size === 1) {
      const [[, point]] = [...pointers.current.entries()];
      const t = transformRef.current;
      pan.current = { x: t.x, y: t.y, startX: point.x, startY: point.y };
    } else {
      pan.current = null;
    }
    if (pointers.current.size === 0) setGesturing(false);
  };

  /*
   * A native listener, not React's `onWheel` prop: React attaches wheel
   * handlers as passive by default (so scrolling stays smooth on pages that
   * don't need to intercept it), and a passive listener cannot call
   * `preventDefault()` — it fails silently with a console warning instead of
   * stopping the page from scrolling under the zoom.
   */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = -event.deltaY * 0.0025;
      setTransform((t) => clamp({ ...t, scale: t.scale + delta * t.scale }));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [clamp]);

  /** Double tap/click zooms in on the spot, or back out if already zoomed. */
  const onDoubleClick = (event: React.MouseEvent) => {
    if (transformRef.current.scale > 1) {
      resetZoom();
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const originX = event.clientX - rect.left - rect.width / 2;
    const originY = event.clientY - rect.top - rect.height / 2;
    setTransform(clamp({ scale: 2.5, x: -originX * 1.5, y: -originY * 1.5 }));
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
      className="fixed inset-0 z-[120] flex flex-col"
      style={{ backgroundColor: "color-mix(in srgb, black 92%, var(--color-shadow))" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <h2 className="min-w-0 truncate text-sm font-bold text-white">{doc.title}</h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
        >
          <span className="sr-only">Close</span>
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {/*
       * `touch-action: none` stops the browser's own scroll/zoom gestures from
       * competing with the pointer handlers below for the same touch — the
       * one detail in `FingerPicker`'s note that matters just as much here.
       */}
      <div
        ref={stageRef}
        className="relative flex-1 select-none overflow-hidden"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transition: gesturing ? "none" : "transform 150ms ease-out",
          }}
        >
          <Image
            src={images.full.src}
            alt={doc.title}
            width={images.full.width}
            height={images.full.height}
            className="max-h-full max-w-full object-contain"
            sizes="100vw"
            priority
            draggable={false}
          />
        </div>
      </div>

      <p
        className="px-4 pb-3 text-center text-xs text-white/70"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        Pinch or scroll to zoom, drag to pan, double-tap to reset.
      </p>
    </div>,
    document.body,
  );
}
