import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SwapParentsButton } from "@/components/SwapParentsButton";
import { PARENTS_STORAGE_KEY } from "@/config/app";
import { useParentSwap } from "@/hooks/useParentSwap";
import {
  clearParentsSwapped,
  readParentsSwapped,
  writeParentsSwapped,
} from "@/lib/parent-storage";

describe("parent swap storage", () => {
  it("defaults to the configured seats", () => {
    expect(readParentsSwapped()).toBe(false);
  });

  it("remembers a swap", () => {
    writeParentsSwapped(true);
    expect(window.localStorage.getItem(PARENTS_STORAGE_KEY)).toBe("1");
    expect(readParentsSwapped()).toBe(true);
  });

  it("remembers swapping back", () => {
    writeParentsSwapped(true);
    writeParentsSwapped(false);
    expect(readParentsSwapped()).toBe(false);
  });

  it("treats an unrecognised value as not swapped", () => {
    window.localStorage.setItem(PARENTS_STORAGE_KEY, "yes-please");
    expect(readParentsSwapped()).toBe(false);
  });

  it("can be cleared", () => {
    writeParentsSwapped(true);
    clearParentsSwapped();
    expect(window.localStorage.getItem(PARENTS_STORAGE_KEY)).toBeNull();
    expect(readParentsSwapped()).toBe(false);
  });

  it("does not throw when localStorage is unavailable", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(() => readParentsSwapped()).not.toThrow();
    expect(readParentsSwapped()).toBe(false);
    expect(writeParentsSwapped(true)).toBe(false);

    get.mockRestore();
    set.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/* Hook + button                                                       */
/* ------------------------------------------------------------------ */

function SwapHarness() {
  const { swapped, swapping, toggle } = useParentSwap();
  return (
    <>
      <p data-testid="state">{`${swapped}:${swapping}`}</p>
      <SwapParentsButton swapped={swapped} onToggle={toggle} />
    </>
  );
}

function state(): string {
  return screen.getByTestId("state").textContent ?? "";
}

function clickSwap() {
  const button = screen.getByRole("button", { name: /swap|usual seats/i });
  act(() => button.click());
}

describe("useParentSwap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts unswapped with no saved preference", () => {
    render(<SwapHarness />);
    expect(state()).toBe("false:false");
  });

  it("restores a saved swap on mount", () => {
    writeParentsSwapped(true);
    render(<SwapHarness />);
    expect(state()).toBe("true:false");
  });

  it("toggles, saves, and toggles back", () => {
    render(<SwapHarness />);

    clickSwap();
    expect(state()).toBe("true:true");
    expect(window.localStorage.getItem(PARENTS_STORAGE_KEY)).toBe("1");

    clickSwap();
    expect(state()).toBe("false:true");
    expect(window.localStorage.getItem(PARENTS_STORAGE_KEY)).toBe("0");
  });

  it("keeps the preference across a remount", () => {
    const first = render(<SwapHarness />);
    clickSwap();
    first.unmount();

    render(<SwapHarness />);
    expect(state()).toBe("true:false");
  });

  it("stops animating once the glide is over", () => {
    vi.useFakeTimers();
    render(<SwapHarness />);

    clickSwap();
    expect(state()).toBe("true:true");

    act(() => {
      vi.runAllTimers();
    });
    expect(state()).toBe("true:false");
  });

  it("still swaps when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    render(<SwapHarness />);
    expect(() => clickSwap()).not.toThrow();
    // Works for this session, it just will not survive a reload.
    expect(state()).toBe("true:true");
  });
});

describe("SwapParentsButton", () => {
  it("reports its state without relying on colour", () => {
    render(<SwapHarness />);
    const button = screen.getByRole("button", { name: /swap/i });
    expect(button.getAttribute("aria-pressed")).toBe("false");

    clickSwap();
    expect(
      screen.getByRole("button", { name: /usual seats/i }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("names both parents in its accessible label", () => {
    render(<SwapHarness />);
    const button = screen.getByRole("button", { name: /swap/i });
    expect(button.textContent).toContain("Nathan");
    expect(button.textContent).toContain("Sarah");
  });

  it("meets the 44px touch target", () => {
    render(<SwapHarness />);
    const button = screen.getByRole("button", { name: /swap/i });
    expect(button.className).toContain("min-h-11");
  });

  it("shows both parents' faces instead of the word Swap", () => {
    const { container } = render(<SwapHarness />);
    const images = container.querySelectorAll("img");

    expect(images).toHaveLength(2);
    // The visible word is gone; only the screen-reader label mentions swapping.
    const visible = screen.getByRole("button", { name: /swap/i }).querySelector(".sr-only");
    expect(visible?.textContent).toMatch(/swap/i);
  });

  it("leaves the faces out of the accessible name", () => {
    // The button's label already names both parents in a full sentence; alt
    // text on the photographs would repeat them and read as four people.
    const { container } = render(<SwapHarness />);
    for (const image of container.querySelectorAll("img")) {
      expect(image.getAttribute("alt")).toBe("");
    }
  });

  it("sizes the faces so the button keeps its width", () => {
    // 20px each, overlapping by 6, is 34px of layout against roughly 37px for
    // the word it replaced. If either number is edited the button visibly
    // resizes, which is the thing this is guarding.
    const { container } = render(<SwapHarness />);
    const [first, second] = [...container.querySelectorAll("img")].map(
      (image) => image.parentElement as HTMLElement,
    );

    expect(first.style.width).toBe("20px");
    expect(first.style.height).toBe("20px");
    expect(first.style.marginLeft).toBe("0px");
    expect(second.style.marginLeft).toBe("-6px");
  });

  it("rings each face the way the seats do", () => {
    // One ring survives whichever colour the button is: unpressed, the primary
    // ring reads against `surface`; pressed, the surface gap reads against
    // `primary`. So the faces never blend into the button.
    const { container } = render(<SwapHarness />);
    const face = container.querySelector("img")!.parentElement as HTMLElement;

    expect(face.style.boxShadow).toContain("var(--color-surface)");
    expect(face.style.boxShadow).toContain("var(--color-primary)");
  });
});
