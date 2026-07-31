"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { getNavBarItems, isActivePath } from "@/config/navigation";

import { NavIcon } from "./NavIcon";

/**
 * The bottom tab bar.
 *
 * A client component for one reason: it needs `usePathname()` to know which
 * tab is current. Everything it renders is otherwise static.
 *
 * Layout notes that matter on a real phone:
 *
 * - `fixed` to the bottom, so it stays put as the page scrolls and as mobile
 *   browser chrome hides and reappears.
 * - `env(safe-area-inset-bottom)` padding keeps the labels clear of the iPhone
 *   home indicator. The matching space below the content is added by the
 *   layout, so nothing is ever hidden behind the bar.
 * - Every tap target is at least 44px tall, which is the smallest reliably
 *   hittable size on a touchscreen.
 * - `backdrop-blur` with a translucent surface, so content scrolling underneath
 *   reads as "behind the bar" rather than colliding with it.
 */
export function BottomNav() {
  const pathname = usePathname();
  const items = getNavBarItems();

  return (
    <nav
      aria-label="Main"
      className="themed-transition fixed inset-x-0 bottom-0 z-40 border-t"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-surface) 88%, transparent)",
        borderColor: "var(--color-border)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        paddingBottom: "env(safe-area-inset-bottom)",
        boxShadow: "0 -6px 24px -18px var(--color-shadow)",
      }}
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch justify-around px-2">
        {items.map((item) => {
          const active = isActivePath(item.href, pathname);
          const isHome = item.slot === "home";

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="group flex min-h-[3.5rem] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 transition-colors"
                style={{
                  color: active
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
                }}
              >
                <span
                  className="themed-transition flex items-center justify-center rounded-full transition-transform group-active:scale-90"
                  style={
                    /*
                     * Home gets a filled pill when active. It is the anchor of
                     * the app and the centre of the bar, so it earns a stronger
                     * treatment than the tabs either side of it.
                     */
                    isHome && active
                      ? {
                          backgroundColor: "var(--color-primary)",
                          color: "var(--color-on-primary)",
                          padding: "0.4rem 1.1rem",
                        }
                      : { padding: "0.4rem 1.1rem" }
                  }
                >
                  <NavIcon name={item.icon} className="h-6 w-6" />
                </span>
                <span
                  className="text-[0.7rem] font-semibold leading-none"
                  style={{ fontWeight: active ? 700 : 600 }}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
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
      className="h-[calc(4.5rem+env(safe-area-inset-bottom))] shrink-0"
    />
  );
}
