/**
 * @vitest-environment node
 *
 * The in-process limiters.
 *
 * The clock is injected into every call rather than mocked, so a window
 * boundary is walked exactly instead of slept through — these run in
 * milliseconds and test the boundary itself rather than something near it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  WindowStore,
  checkAuthFailure,
  checkBurst,
  checkSustained,
  resetLimiters,
} from "@/lib/family-api/rate-limit";

const MINUTE = 60_000;

beforeEach(() => {
  resetLimiters();
});

describe("a fixed window", () => {
  it("allows exactly the limit and refuses the next", () => {
    const store = new WindowStore();
    const at = 1_000_000;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(
        store.hit("k", { limit: 5, windowMs: MINUTE }, at).allowed,
        `attempt ${attempt}`,
      ).toBe(true);
    }

    expect(store.hit("k", { limit: 5, windowMs: MINUTE }, at).allowed).toBe(false);
  });

  it("reports how long to wait", () => {
    const store = new WindowStore();
    const at = 1_000_000;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      store.hit("k", { limit: 5, windowMs: MINUTE }, at);
    }

    const decision = store.hit("k", { limit: 5, windowMs: MINUTE }, at + 10_000);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets when the window rolls over", () => {
    const store = new WindowStore();
    const at = 1_000_000;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      store.hit("k", { limit: 5, windowMs: MINUTE }, at);
    }
    expect(store.hit("k", { limit: 5, windowMs: MINUTE }, at).allowed).toBe(false);

    expect(
      store.hit("k", { limit: 5, windowMs: MINUTE }, at + MINUTE + 1).allowed,
    ).toBe(true);
  });

  it("keeps different keys apart", () => {
    const store = new WindowStore();
    const at = 1_000_000;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      store.hit("a", { limit: 5, windowMs: MINUTE }, at);
    }

    expect(store.hit("a", { limit: 5, windowMs: MINUTE }, at).allowed).toBe(false);
    expect(store.hit("b", { limit: 5, windowMs: MINUTE }, at).allowed).toBe(true);
  });

  it("blocks past the window when a block is configured", () => {
    const store = new WindowStore();
    const at = 1_000_000;
    const options = { limit: 2, windowMs: MINUTE, blockMs: 15 * MINUTE };

    store.hit("k", options, at);
    store.hit("k", options, at);
    expect(store.hit("k", options, at).allowed).toBe(false);

    // The minute has passed, but the block has not.
    expect(store.hit("k", options, at + MINUTE + 1).allowed).toBe(false);
    // And once it has, the key works again.
    expect(store.hit("k", options, at + 16 * MINUTE).allowed).toBe(true);
  });
});

describe("the bound on how many keys are tracked", () => {
  /*
   * An attacker with a large address pool could otherwise make the limiter
   * allocate without limit, turning the defence into the denial of service it
   * exists to prevent.
   */
  it("refuses new keys rather than growing without limit", () => {
    const store = new WindowStore(3);
    const at = 1_000_000;
    const options = { limit: 5, windowMs: MINUTE };

    expect(store.hit("a", options, at).allowed).toBe(true);
    expect(store.hit("b", options, at).allowed).toBe(true);
    expect(store.hit("c", options, at).allowed).toBe(true);

    // Full. A fourth source is refused...
    expect(store.hit("d", options, at).allowed).toBe(false);
    expect(store.size()).toBe(3);

    // ...and, crucially, refusing does not evict anybody. An attacker must not
    // be able to flush their own block by spraying fresh keys at it.
    expect(store.hit("a", options, at).allowed).toBe(true);
  });

  it("frees space once entries expire", () => {
    const store = new WindowStore(2);
    const at = 1_000_000;
    const options = { limit: 5, windowMs: MINUTE };

    store.hit("a", options, at);
    store.hit("b", options, at);
    expect(store.hit("c", options, at).allowed).toBe(false);

    // A minute later the first two have expired and are pruned.
    expect(store.hit("c", options, at + 2 * MINUTE).allowed).toBe(true);
  });
});

describe("the configured limiters", () => {
  it("stops invalid credentials after the fifth attempt in a minute", () => {
    const at = 2_000_000;
    const options = { limit: 5, blockSeconds: 900 };

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(checkAuthFailure("source", options, at).allowed).toBe(true);
    }

    const sixth = checkAuthFailure("source", options, at);
    expect(sixth.allowed).toBe(false);
    // And the block, not just the window, is what they now have to wait out.
    expect(sixth.retryAfterSeconds).toBeGreaterThan(60);
  });

  it("applies the burst limit per credential", () => {
    const at = 3_000_000;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      expect(checkBurst("v-current", 10, at).allowed).toBe(true);
    }
    expect(checkBurst("v-current", 10, at).allowed).toBe(false);
    // The other key in a rotation has its own allowance.
    expect(checkBurst("v-next", 10, at).allowed).toBe(true);
  });

  it("applies the sustained limit over an hour", () => {
    const at = 4_000_000;
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      expect(checkSustained("v-current", 60, at).allowed).toBe(true);
    }
    expect(checkSustained("v-current", 60, at).allowed).toBe(false);

    // Still blocked half an hour later — this is an hour window, not a minute.
    expect(checkSustained("v-current", 60, at + 30 * MINUTE).allowed).toBe(false);
    expect(checkSustained("v-current", 60, at + 61 * MINUTE).allowed).toBe(true);
  });
});
