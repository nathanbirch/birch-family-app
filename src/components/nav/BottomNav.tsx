"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BOTTOM_NAV_SPACE,
  getNavHome,
  getNavStripItems,
  isActivePath,
  type NavItem,
} from "@/config/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";

import { NavIcon } from "./NavIcon";

/**
 * The bottom tab bar: Home pinned, everything else on a strip that scrolls.
 *
 * A client component for two reasons now. It needs `usePathname()` to know
 * which tab is current, and it has to *move the strip* when that changes —
 * see below.
 *
 * ---------------------------------------------------------------------------
 * WHY HOME IS OUT OF THE SCROLL
 * ---------------------------------------------------------------------------
 * A scrolling bar has one failure mode that a fixed one does not: you push it
 * along, tap something, and now the way back is somewhere off the left edge.
 * On a phone that is a small maze. Pinning Home means that however far the
 * strip has been pushed, the middle of the app is exactly where it always is —
 * and it is on the *left*, which is where a strip's own scroll position can
 * never take it.
 *
 * It is also drawn more strongly than the rest, always: a filled tile rather
 * than an icon over a word. That is not decoration. Home is the one control in
 * the bar that is a way *out* of wherever you are rather than a way to
 * somewhere else, and it should not have to be found among nine identical
 * tabs.
 *
 * ---------------------------------------------------------------------------
 * THE STRIP MOVES ITSELF
 * ---------------------------------------------------------------------------
 * Tap a card on the dashboard for a page near the end of the strip and, without
 * `keepActiveInView`, you would arrive on it with the bar still showing the
 * start — the current tab highlighted somewhere off-screen, which is worse than
 * no highlight at all. So the strip scrolls the active tab to the middle
 * whenever the route changes: animated on a navigation, instantly on the first
 * paint, because a bar that slides on load looks like something has gone wrong.
 *
 * `scrollIntoView` would do this in one line and is not used. It scrolls
 * *every* scrollable ancestor, so on a long page it drags the whole document
 * as well, and the bar is fixed — the page has no business moving because the
 * tab bar tidied itself up.
 */

/** How wide the fade at a scrollable edge is. */
const EDGE_FADE = "1.75rem";

export function BottomNav() {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  const home = getNavHome();
  const strip = getNavStripItems();

  const stripRef = useRef<HTMLUListElement | null>(null);
  const activeRef = useRef<HTMLLIElement | null>(null);
  /** Whether the strip has been positioned once. Drives animate-or-not. */
  const settledRef = useRef(false);

  /**
   * Which ends of the strip have more content beyond them.
   *
   * Drives the fades. They are a real signal rather than a flourish: a row of
   * tabs that simply stops at the edge of the screen looks like the whole row,
   * and nobody scrolls something they do not know is scrollable.
   */
  const [edges, setEdges] = useState({ start: false, end: false });

  /* Keep the fades honest as the strip is pushed about, and as it resizes. */
  useEffect(() => {
    const node = stripRef.current;
    if (!node) return;

    const measure = () => {
      const { scrollLeft, scrollWidth, clientWidth } = node;
      // A pixel of slack at each end: sub-pixel layout means `scrollLeft` is
      // rarely exactly 0 or exactly the maximum, and a fade that never quite
      // switches off is a fade that looks like a rendering bug.
      setEdges((current) => {
        const next = {
          start: scrollLeft > 1,
          end: scrollLeft + clientWidth < scrollWidth - 1,
        };
        return current.start === next.start && current.end === next.end
          ? current
          : next;
      });
    };

    measure();
    node.addEventListener("scroll", measure, { passive: true });

    if (typeof ResizeObserver === "undefined") {
      return () => node.removeEventListener("scroll", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [strip.length]);

  /* Bring the current tab into the middle of the strip. */
  useEffect(() => {
    const node = stripRef.current;
    const active = activeRef.current;
    if (!node) return;

    // Home is pinned, so it is never *in* the strip — landing on it should
    // leave the strip where the last page put it rather than snapping it back.
    if (!active) return;

    const target = active.offsetLeft - (node.clientWidth - active.clientWidth) / 2;
    node.scrollTo({
      left: Math.max(0, target),
      behavior: settledRef.current && !reducedMotion ? "smooth" : "auto",
    });
    settledRef.current = true;
  }, [pathname, reducedMotion]);

  const homeActive = isActivePath(home.href, pathname);

  return (
    <nav
      aria-label="Main"
      className="themed-transition fixed inset-x-0 bottom-0 z-40 border-t"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-surface) 92%, transparent)",
        borderColor: "var(--color-border)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        paddingBottom: "env(safe-area-inset-bottom)",
        boxShadow: "0 -6px 24px -18px var(--color-shadow)",
        height: BOTTOM_NAV_SPACE,
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-3xl items-center gap-1 pe-1 ps-2">
        {/*
          Pinned, and `shrink-0` so a long strip can never squeeze it. The
          hairline after it is what makes it read as a fixed button beside a
          list rather than as the first item of one.
        */}
        <Link
          href={home.href}
          aria-current={homeActive ? "page" : undefined}
          className="group flex h-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-3 transition-transform active:scale-95"
          style={{
            backgroundColor: homeActive
              ? "var(--color-primary)"
              : "var(--color-surface-muted)",
            color: homeActive
              ? "var(--color-on-primary)"
              : "var(--color-primary)",
          }}
        >
          <NavIcon name={home.icon} className="h-6 w-6" />
          <span className="text-[0.65rem] font-extrabold leading-none">
            {home.label}
          </span>
        </Link>

        <span
          aria-hidden="true"
          className="h-8 w-px shrink-0"
          style={{ backgroundColor: "var(--color-border)" }}
        />

        <ul
          ref={stripRef}
          className="nav-strip flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
          style={{
            /*
             * `contain` stops a swipe that has run out of tabs from turning
             * into the browser's own back gesture, which on iOS would take
             * somebody out of the app for flicking the nav bar too hard.
             */
            overscrollBehaviorX: "contain",
            maskImage: fadeFor(edges),
            WebkitMaskImage: fadeFor(edges),
          }}
        >
          {strip.map((item) => {
            const active = isActivePath(item.href, pathname);
            return (
              <li
                key={item.href}
                ref={active ? activeRef : undefined}
                /*
                 * `shrink-0` is what makes this a strip rather than a squeeze.
                 * A flex item shrinks below its own width by default, so
                 * without it nine tabs simply compress into the space
                 * available — `scrollWidth` never exceeds `clientWidth`,
                 * nothing scrolls, and the labels collide into one grey smear.
                 */
                className="shrink-0"
              >
                <StripTab item={item} active={active} />
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/**
 * One tab in the strip.
 *
 * The active one is a filled pill, which is the same treatment Home gets and
 * deliberately so: on a bar where most tabs are scrolled past rather than
 * looked at, "which page am I on" has to survive being seen out of the corner
 * of an eye. Colour alone would not — it is also the widest tab, the only
 * filled one, and the only one whose label is at full weight.
 */
function StripTab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="group flex h-[3.25rem] w-[4.25rem] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl transition-transform active:scale-95"
      style={{
        backgroundColor: active ? "var(--color-primary)" : "transparent",
        color: active ? "var(--color-on-primary)" : "var(--color-text-muted)",
      }}
    >
      <NavIcon name={item.icon} className="h-[1.35rem] w-[1.35rem]" />
      <span
        className="w-full truncate px-1 text-center text-[0.65rem] leading-none"
        style={{ fontWeight: active ? 800 : 600 }}
      >
        {item.label}
      </span>
    </Link>
  );
}

/**
 * The mask that fades whichever ends have more tabs beyond them.
 *
 * `none` when the strip fits, so a bar with nothing to scroll has no soft
 * edges at all — a permanent fade would be a permanent hint to do something
 * that does not work.
 */
function fadeFor(edges: { start: boolean; end: boolean }): string {
  if (!edges.start && !edges.end) return "none";
  const from = edges.start ? `transparent 0, black ${EDGE_FADE}` : "black 0";
  const to = edges.end
    ? `black calc(100% - ${EDGE_FADE}), transparent 100%`
    : "black 100%";
  return `linear-gradient(to right, ${from}, ${to})`;
}

/**
 * The space the fixed bar would otherwise cover.
 *
 * Rendered as the last thing in the scrolling content so the end of a page is
 * always reachable — without this, the final card sits permanently behind the
 * bar and cannot be scrolled into view.
 */
export function BottomNavSpacer() {
  return (
    <div
      aria-hidden="true"
      className="shrink-0"
      style={{ height: BOTTOM_NAV_SPACE }}
    />
  );
}
