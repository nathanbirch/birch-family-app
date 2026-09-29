"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * A panel over the page: a sheet from the bottom on a phone, a centred card on
 * anything wider.
 *
 * Portalled to `<body>` for the reason spelled out beside `.animate-soft-fade`
 * in `globals.css`: the Meals list sits inside an animated, transformed
 * wrapper, and a `position: fixed` child of a transformed element is pinned to
 * that element instead of to the screen.
 *
 * It does the three things a modal owes a keyboard and a screen reader: focus
 * moves into it, Escape closes it, and focus goes back to whatever opened it.
 * The page behind stops scrolling while it is open, so a thumb dragging the
 * sheet's contents does not scroll the list underneath instead.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  /** What a screen reader announces the dialog as. */
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ backgroundColor: "color-mix(in srgb, black 45%, transparent)" }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="meals-sheet themed-transition relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl outline-none sm:max-w-xl sm:rounded-3xl"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          boxShadow: "0 -12px 40px -12px var(--color-shadow)",
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function subscribeNever(): () => void {
  return () => {};
}

/** The round ✕ in a sheet's corner. */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: "var(--color-surface-muted)", color: "var(--color-text-muted)" }}
    >
      <span className="sr-only">Close</span>
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}
