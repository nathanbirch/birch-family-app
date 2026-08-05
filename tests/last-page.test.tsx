import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  LastPageMemory,
  resetLastPageRestore,
} from "@/components/LastPageMemory";
import { LAST_PAGE_STORAGE_KEY } from "@/config/app";
import {
  clearLastPage,
  isKnownPage,
  readLastPage,
  writeLastPage,
} from "@/lib/last-page-storage";

/*
 * `next/navigation` needs stubbing: `usePathname` has no router to read in a
 * bare render, and `useRouter().replace` is the thing under test.
 */
const replace = vi.fn();
let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  replace.mockClear();
  pathname = "/";
  // Each test is a fresh page load, which is what resets the one-shot guard.
  resetLastPageRestore();
});

describe("last page storage", () => {
  it("has nothing saved to begin with", () => {
    expect(readLastPage()).toBeNull();
  });

  it("remembers a real page", () => {
    expect(writeLastPage("/seating")).toBe(true);
    expect(window.localStorage.getItem(LAST_PAGE_STORAGE_KEY)).toBe("/seating");
    expect(readLastPage()).toBe("/seating");
  });

  it("recognises exactly the app's real pages", () => {
    expect(isKnownPage("/")).toBe(true);
    expect(isKnownPage("/seating")).toBe(true);
    expect(isKnownPage("/account")).toBe(true);
    expect(isKnownPage("/chores")).toBe(false);
  });

  it("refuses to store a path that is not a page", () => {
    expect(writeLastPage("/login")).toBe(false);
    expect(writeLastPage("https://example.com")).toBe(false);
    expect(readLastPage()).toBeNull();
  });

  it("ignores a stale page left by an older build", () => {
    // A route that has since been deleted must not strand the app on a 404.
    window.localStorage.setItem(LAST_PAGE_STORAGE_KEY, "/chores");
    expect(readLastPage()).toBeNull();
  });

  it("can be forgotten", () => {
    writeLastPage("/account");
    clearLastPage();
    expect(readLastPage()).toBeNull();
  });

  it("survives storage being unavailable", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    expect(readLastPage()).toBeNull();
    expect(writeLastPage("/seating")).toBe(false);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe("reopening on the last page", () => {
  it("records the page you are on", () => {
    pathname = "/account";
    render(<LastPageMemory />);
    expect(readLastPage()).toBe("/account");
  });

  it("reopens the saved page when the app starts at the entry point", () => {
    writeLastPage("/seating");
    render(<LastPageMemory />);
    expect(replace).toHaveBeenCalledWith("/seating");
  });

  it("does not overwrite the saved page while redirecting to it", () => {
    writeLastPage("/seating");
    render(<LastPageMemory />);
    expect(readLastPage()).toBe("/seating");
  });

  it("stays put when the app is opened directly on another page", () => {
    // An explicit destination — a bookmark, a shared link, a reload — always
    // beats what happens to be in storage.
    writeLastPage("/seating");
    pathname = "/account";
    render(<LastPageMemory />);
    expect(replace).not.toHaveBeenCalled();
    expect(readLastPage()).toBe("/account");
  });

  it("does nothing on a first visit with nothing saved", () => {
    render(<LastPageMemory />);
    expect(replace).not.toHaveBeenCalled();
    expect(readLastPage()).toBe("/");
  });

  it("does not redirect when the saved page is the entry point itself", () => {
    writeLastPage("/");
    render(<LastPageMemory />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("lets you navigate to Home after being restored", () => {
    // The one that makes or breaks this feature: restoring is once per page
    // load, so tapping Home later must not bounce straight back to Seats.
    writeLastPage("/seating");
    const view = render(<LastPageMemory />);
    expect(replace).toHaveBeenCalledTimes(1);

    pathname = "/seating";
    view.rerender(<LastPageMemory />);
    replace.mockClear();

    pathname = "/";
    view.rerender(<LastPageMemory />);
    expect(replace).not.toHaveBeenCalled();
    expect(readLastPage()).toBe("/");
  });
});
