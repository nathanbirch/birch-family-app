"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { THEMES, themeSwatches, type ThemeId } from "@/config/themes";

import { useAppTheme } from "./ThemeProvider";

/** Tailwind's `sm` breakpoint, where the sheet becomes an anchored popover. */
const WIDE_SCREEN = "(min-width: 640px)";

/**
 * Compact theme control for the header.
 *
 * A single 44px button opens a bottom sheet on phones and a popover anchored
 * under the trigger on wider screens. Selection is never communicated by
 * colour alone — the active theme carries a checkmark and `aria-checked`.
 *
 * The panel is rendered through a portal into `document.body`. That is not
 * incidental: the cards on the page run entrance animations, which give them
 * their own stacking contexts, and a panel left inside the header would be
 * painted underneath them no matter what z-index it carried.
 */
export function ThemePicker() {
  const { themeId, theme, setTheme } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
    null,
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Track the breakpoint so the panel knows which layout to use. Falls back to
  // the phone layout anywhere `matchMedia` is missing, which is the safer of
  // the two — a bottom sheet works at any width.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(WIDE_SCREEN);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Measure the trigger before paint, so the popover never appears misplaced.
  useLayoutEffect(() => {
    if (!open) return;

    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        close(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  const choose = (next: ThemeId) => {
    setTheme(next);
    close();
  };

  const panel = (
    <>
      {/* Scrim, phones only — the sheet slides up from the bottom there. */}
      {!wide ? (
        <div
          className="fixed inset-0 z-[90]"
          style={{ backgroundColor: "var(--color-shadow)" }}
          aria-hidden="true"
        />
      ) : null}

      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-label="Choose a colour theme"
        className={
          wide
            ? "themed-transition fixed z-[100] w-80 overflow-hidden rounded-2xl"
            : "themed-transition fixed inset-x-2 bottom-2 z-[100] max-h-[75vh] overflow-y-auto rounded-3xl"
        }
        style={{
          ...(wide && anchor ? { top: anchor.top, right: anchor.right } : null),
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 18px 48px -16px var(--color-shadow)",
          paddingBottom: wide ? undefined : "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2
            className="text-sm font-bold uppercase tracking-wide"
            style={{ color: "var(--color-text-muted)" }}
          >
            Theme
          </h2>
          {!wide ? (
            <button
              type="button"
              onClick={() => close()}
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ color: "var(--color-text-muted)" }}
            >
              <span className="sr-only">Close theme picker</span>
              <CloseIcon />
            </button>
          ) : null}
        </div>

        <div
          role="radiogroup"
          aria-label="Colour themes"
          className="grid gap-1 px-2 pb-3"
        >
          {THEMES.map((option) => {
            const selected = option.id === themeId;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(option.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold"
                style={{
                  backgroundColor: selected
                    ? "var(--color-surface-muted)"
                    : "transparent",
                  color: "var(--color-text)",
                  border: selected
                    ? "1px solid var(--color-primary)"
                    : "1px solid transparent",
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex shrink-0 items-center gap-1 rounded-full p-1"
                  style={{ backgroundColor: option.colors.background }}
                >
                  {themeSwatches(option).map((swatch) => (
                    <span
                      key={swatch}
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </span>
                <span className="flex-1">{option.name}</span>
                {option.isDark ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase"
                    style={{
                      backgroundColor: "var(--color-surface-muted)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Dark
                  </span>
                ) : null}
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center"
                  style={{ color: "var(--color-primary)" }}
                >
                  {selected ? <CheckIcon /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="themed-transition flex h-11 min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold sm:px-4"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 1px 2px var(--color-shadow)",
        }}
      >
        <PaletteIcon />
        <span className="hidden sm:inline">Theme</span>
        <span className="sr-only">
          Choose a colour theme. Current theme: {theme.name}.
        </span>
        {/* Decorative preview of the active theme; dropped on the narrowest
            screens, where the header needs the room more than the hint. */}
        <span
          aria-hidden="true"
          className="hidden items-center gap-0.5 rounded-full p-0.5 min-[380px]:flex"
        >
          {themeSwatches(theme).map((swatch) => (
            <span
              key={swatch}
              className="h-3 w-3 rounded-full"
              style={{
                backgroundColor: swatch,
                boxShadow: "0 0 0 1px var(--color-border)",
              }}
            />
          ))}
        </span>
      </button>

      {open ? createPortal(panel, document.body) : null}
    </div>
  );
}

function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.9 0-.6-.2-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.9-1.8h1.4A4.8 4.8 0 0 0 21 9.8C21 6 17 3 12 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="7.8" cy="11.5" r="1.3" fill="currentColor" />
      <circle cx="11" cy="7.6" r="1.3" fill="currentColor" />
      <circle cx="15.6" cy="8.6" r="1.3" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="m5 12.5 4.5 4.5L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M6 6 18 18M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
