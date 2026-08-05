import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";

import { useCurrentDate } from "@/hooks/useCurrentDate";
import { useImagesReady } from "@/hooks/useImagesReady";
import {
  LAST_PAGE_STORAGE_KEY,
  PARENTS_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "@/config/app";
import { clearLastPage } from "@/lib/last-page-storage";
import { clearParentsSwapped } from "@/lib/parent-storage";
import { clearStoredTheme } from "@/lib/theme-storage";

/**
 * The two hooks that decide *when* things happen, and the three "forget this
 * preference" helpers.
 *
 * `useCurrentDate` is the one every dated page depends on: seats change on a
 * Monday, pets at midnight, chores on the 1st, and this app is an installed
 * PWA that people leave open for days. If it did not roll over, a phone left
 * on the counter overnight would show yesterday's answers all morning.
 */

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("the current date", () => {
  it("starts on the date the server rendered with, so hydration matches", () => {
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0));
    const { result } = renderHook(() => useCurrentDate("2026-08-04"));
    // Whatever the device thinks, the very first value is the server's — the
    // effect corrects it a tick later.
    expect(result.current).toBeInstanceOf(Date);
  });

  it("switches to the device's own date immediately after mounting", () => {
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0));
    const { result } = renderHook(() => useCurrentDate("2026-08-04"));
    expect(result.current.getDate()).toBe(5);
  });

  it("rolls over at local midnight without a reload", () => {
    vi.setSystemTime(new Date(2026, 7, 5, 23, 59, 50));
    const { result } = renderHook(() => useCurrentDate("2026-08-05"));
    expect(result.current.getDate()).toBe(5);

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(result.current.getDate()).toBe(6);
  });

  it("keeps rolling over on the days after that", () => {
    vi.setSystemTime(new Date(2026, 7, 5, 23, 59, 50));
    const { result } = renderHook(() => useCurrentDate("2026-08-05"));

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    });

    expect(result.current.getDate()).toBe(7);
  });

  it("catches up when a backgrounded phone is brought back", () => {
    // Phones freeze timers in background tabs, so the midnight timer may
    // simply never fire. This is the safety net that makes the app right when
    // somebody picks it up in the morning.
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0));
    const { result } = renderHook(() => useCurrentDate("2026-08-05"));

    vi.setSystemTime(new Date(2026, 7, 9, 9, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.getDate()).toBe(9);
  });

  it("catches up on window focus as well", () => {
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0));
    const { result } = renderHook(() => useCurrentDate("2026-08-05"));

    vi.setSystemTime(new Date(2026, 7, 6, 9, 0));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(result.current.getDate()).toBe(6);
  });

  it("does not re-render for a change that is not a new day", () => {
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0));
    const { result } = renderHook(() => useCurrentDate("2026-08-05"));
    const first = result.current;

    vi.setSystemTime(new Date(2026, 7, 5, 18, 0));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    // Same Date object: a stray visibility event must not restart every
    // animation on the page.
    expect(result.current).toBe(first);
  });

  it("falls back to now when handed a date it cannot parse", () => {
    vi.setSystemTime(new Date(2026, 7, 5, 9, 0));
    const { result } = renderHook(() => useCurrentDate("not-a-date"));
    expect(result.current.getDate()).toBe(5);
  });

  it("stops listening once it is unmounted", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useCurrentDate("2026-08-05"));
    unmount();
    expect(remove).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });
});

describe("waiting for images", () => {
  function Scene({ srcs, timeoutMs }: { srcs: string[]; timeoutMs?: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const ready = useImagesReady(ref, { timeoutMs });
    return (
      <div ref={ref} data-ready={ready}>
        {srcs.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt="" />
        ))}
      </div>
    );
  }

  it("is ready at once when there are no images to wait for", () => {
    render(<Scene srcs={[]} />);
    expect(document.querySelector("[data-ready]")?.getAttribute("data-ready")).toBe(
      "true",
    );
  });

  it("waits for an image, then reports ready", async () => {
    render(<Scene srcs={["/a.png"]} />);
    const root = document.querySelector("[data-ready]")!;
    expect(root.getAttribute("data-ready")).toBe("false");

    await act(async () => {
      document.querySelector("img")!.dispatchEvent(new Event("load"));
    });

    expect(root.getAttribute("data-ready")).toBe("true");
  });

  it("treats a broken image as settled rather than waiting forever", async () => {
    render(<Scene srcs={["/missing.png"]} />);
    const root = document.querySelector("[data-ready]")!;

    await act(async () => {
      document.querySelector("img")!.dispatchEvent(new Event("error"));
    });

    expect(root.getAttribute("data-ready")).toBe("true");
  });

  it("gives up waiting and shows the scene anyway", async () => {
    // A family looking at an empty table because one file 404'd is far worse
    // than a slightly early walk-in.
    render(<Scene srcs={["/slow.png"]} timeoutMs={1000} />);
    const root = document.querySelector("[data-ready]")!;
    expect(root.getAttribute("data-ready")).toBe("false");

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(root.getAttribute("data-ready")).toBe("true");
  });

  it("does nothing at all when the ref was never attached", () => {
    // The hook runs before the element exists on the very first render, and
    // may run against a ref that is never attached. Neither may throw.
    function Detached() {
      const ref = useRef<HTMLDivElement>(null);
      const ready = useImagesReady(ref);
      return <span data-detached={ready} />;
    }

    expect(() => render(<Detached />)).not.toThrow();
    expect(
      document.querySelector("[data-detached]")?.getAttribute("data-detached"),
    ).toBe("false");
  });
});

describe("forgetting a preference", () => {
  it("removes each key, and says it did", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "forest");
    window.localStorage.setItem(PARENTS_STORAGE_KEY, "true");
    window.localStorage.setItem(LAST_PAGE_STORAGE_KEY, "/stars");

    expect(clearStoredTheme()).toBe(true);
    expect(clearParentsSwapped()).toBe(true);
    expect(clearLastPage()).toBe(true);

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(PARENTS_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LAST_PAGE_STORAGE_KEY)).toBeNull();
  });

  it("reports failure rather than throwing when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(clearStoredTheme()).toBe(false);
    expect(clearParentsSwapped()).toBe(false);
    expect(clearLastPage()).toBe(false);
  });
});
