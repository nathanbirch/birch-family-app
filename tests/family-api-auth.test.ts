/**
 * @vitest-environment node
 *
 * Bearer authentication, and the kill switches in front of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `src/lib/family-api/auth.ts` is marked `server-only`, which has no meaning
// in a Node test.
vi.mock("server-only", () => ({}));

import {
  MIN_KEY_LENGTH,
  authenticate,
  extractBearerToken,
  hasConfiguredKey,
} from "@/lib/family-api/auth";
import { isDenyAll, isEnabled } from "@/lib/family-api/config";

/** 43 base64url characters — 256 bits, the documented minimum. */
const GOOD_KEY = "A".repeat(MIN_KEY_LENGTH);
const OTHER_KEY = "B".repeat(MIN_KEY_LENGTH);

const SAVED = { ...process.env };

beforeEach(() => {
  delete process.env.BIRCH_FAMILY_API_KEY;
  delete process.env.BIRCH_FAMILY_API_KEY_NEXT;
  delete process.env.BIRCH_FAMILY_API_ENABLED;
  delete process.env.BIRCH_FAMILY_API_DENY_ALL;
});

afterEach(() => {
  process.env = { ...SAVED };
});

describe("with no key configured", () => {
  it("authenticates nobody, rather than everybody", () => {
    expect(authenticate(`Bearer ${GOOD_KEY}`)).toEqual({
      ok: false,
      reason: "no-keys-configured",
    });
  });

  it("rejects an empty token as firmly as a wrong one", () => {
    expect(authenticate("Bearer ")).toMatchObject({ ok: false });
    expect(authenticate("")).toMatchObject({ ok: false });
  });

  it("reports that it has no key", () => {
    expect(hasConfiguredKey()).toBe(false);
  });
});

describe("with a key configured", () => {
  beforeEach(() => {
    process.env.BIRCH_FAMILY_API_KEY = GOOD_KEY;
  });

  it("accepts the right key", () => {
    expect(authenticate(`Bearer ${GOOD_KEY}`)).toEqual({
      ok: true,
      keyVersion: "v-current",
    });
  });

  it("accepts the scheme case-insensitively, as RFC 7235 requires", () => {
    expect(authenticate(`bearer ${GOOD_KEY}`)).toMatchObject({ ok: true });
    expect(authenticate(`BEARER ${GOOD_KEY}`)).toMatchObject({ ok: true });
  });

  it("rejects a wrong key", () => {
    expect(authenticate(`Bearer ${OTHER_KEY}`)).toEqual({
      ok: false,
      reason: "wrong-key",
    });
  });

  it("rejects a key that is right apart from its case", () => {
    expect(authenticate(`Bearer ${GOOD_KEY.toLowerCase()}`)).toMatchObject({
      ok: false,
    });
  });

  it("rejects a missing header", () => {
    expect(authenticate(null)).toEqual({ ok: false, reason: "missing-header" });
  });

  it.each([
    ["Basic", `Basic ${GOOD_KEY}`],
    ["a bare token", GOOD_KEY],
    ["a token with a space in it", `Bearer ${GOOD_KEY} extra`],
    ["an empty bearer", "Bearer"],
  ])("rejects %s", (_label, header) => {
    expect(authenticate(header)).toMatchObject({ ok: false });
  });

  it("does not spend time parsing an enormous header", () => {
    expect(extractBearerToken(`Bearer ${"x".repeat(100_000)}`)).toBeNull();
  });

  it("never returns the key, or any part of it", () => {
    const result = authenticate(`Bearer ${GOOD_KEY}`);
    expect(JSON.stringify(result)).not.toContain(GOOD_KEY);
    expect(JSON.stringify(result)).not.toContain(GOOD_KEY.slice(0, 8));
  });
});

describe("a key that is too short is treated as absent", () => {
  it("refuses to protect the endpoint with a placeholder", () => {
    process.env.BIRCH_FAMILY_API_KEY = "changeme";
    // The important half: the short key does not work...
    expect(authenticate("Bearer changeme")).toMatchObject({ ok: false });
    // ...and the reason is that there is no key at all, not that this one was
    // wrong. A deployment with a placeholder in it is an unconfigured one.
    expect(authenticate("Bearer changeme")).toEqual({
      ok: false,
      reason: "no-keys-configured",
    });
  });

  it("accepts a key exactly at the minimum length", () => {
    process.env.BIRCH_FAMILY_API_KEY = "c".repeat(MIN_KEY_LENGTH);
    expect(authenticate(`Bearer ${"c".repeat(MIN_KEY_LENGTH)}`)).toMatchObject({
      ok: true,
    });
  });

  it("rejects a key one character short", () => {
    process.env.BIRCH_FAMILY_API_KEY = "c".repeat(MIN_KEY_LENGTH - 1);
    expect(hasConfiguredKey()).toBe(false);
  });
});

describe("rotation", () => {
  it("accepts both keys during the overlap, and says which one was used", () => {
    process.env.BIRCH_FAMILY_API_KEY = GOOD_KEY;
    process.env.BIRCH_FAMILY_API_KEY_NEXT = OTHER_KEY;

    expect(authenticate(`Bearer ${GOOD_KEY}`)).toEqual({
      ok: true,
      keyVersion: "v-current",
    });
    expect(authenticate(`Bearer ${OTHER_KEY}`)).toEqual({
      ok: true,
      keyVersion: "v-next",
    });
  });

  it("revokes the old key the moment it is removed", () => {
    process.env.BIRCH_FAMILY_API_KEY = OTHER_KEY;
    expect(authenticate(`Bearer ${GOOD_KEY}`)).toMatchObject({ ok: false });
  });

  it("revoking both keys closes the endpoint entirely", () => {
    expect(authenticate(`Bearer ${GOOD_KEY}`)).toMatchObject({ ok: false });
    expect(authenticate(`Bearer ${OTHER_KEY}`)).toMatchObject({ ok: false });
  });
});

describe("the kill switches fail closed", () => {
  it("is off when the flag is unset", () => {
    expect(isEnabled()).toBe(false);
  });

  it.each(["false", "FALSE", "0", "", "  ", "yes", "TRUE", "trues"])(
    "is off for %j",
    (value) => {
      process.env.BIRCH_FAMILY_API_ENABLED = value;
      expect(isEnabled()).toBe(false);
    },
  );

  it("is on only for the exact string 'true'", () => {
    process.env.BIRCH_FAMILY_API_ENABLED = "true";
    expect(isEnabled()).toBe(true);
  });

  it("deny-all is off unless deliberately set", () => {
    expect(isDenyAll()).toBe(false);
    process.env.BIRCH_FAMILY_API_DENY_ALL = "true";
    expect(isDenyAll()).toBe(true);
  });
});
