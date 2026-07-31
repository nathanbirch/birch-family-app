/**
 * @vitest-environment node
 *
 * Password hashing only ever happens on the server, so it is tested there.
 */
import { describe, expect, it } from "vitest";

import {
  BCRYPT_COST,
  MAX_PASSWORD_BYTES,
  burnPasswordCheck,
  hashPassword,
  normaliseEmail,
  verifyPassword,
} from "@/lib/auth/passwords";

/*
 * bcrypt at cost 12 is deliberately slow — that is the entire point of it —
 * so these tests take a few seconds. That is the cost of testing the real
 * thing rather than a mock of it.
 */

describe("hashing", () => {
  it("accepts the password it hashed", async () => {
    const hash = await hashPassword("birchfam");
    expect(await verifyPassword("birchfam", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("birchfam");
    expect(await verifyPassword("birchfa", hash)).toBe(false);
    expect(await verifyPassword("Birchfam", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("never stores the password itself", async () => {
    const hash = await hashPassword("birchfam");
    expect(hash).not.toContain("birchfam");
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([
      hashPassword("birchfam"),
      hashPassword("birchfam"),
    ]);
    expect(a).not.toBe(b);
    // Both still verify — the salt travels inside the hash.
    expect(await verifyPassword("birchfam", a)).toBe(true);
    expect(await verifyPassword("birchfam", b)).toBe(true);
  });

  it("uses a cost factor that is actually expensive", async () => {
    expect(BCRYPT_COST).toBeGreaterThanOrEqual(12);
    const hash = await hashPassword("birchfam");
    // bcrypt encodes the cost in the hash: $2b$12$…
    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`));
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("birchfam", "not-a-hash")).toBe(false);
  });
});

describe("timing-safe unknown users", () => {
  it("burns real work, so an unknown email is not measurably faster", async () => {
    /*
     * The point of `burnPasswordCheck` is that a login attempt for an email
     * that has no account takes about as long as one that does. If it
     * short-circuited, response times alone would reveal which addresses are
     * registered.
     *
     * Asserting on wall-clock time is flaky on shared CI, so this asserts the
     * weaker but stable property: it takes real time, not ~0ms.
     */
    const started = performance.now();
    expect(await burnPasswordCheck("anything")).toBe(false);
    expect(performance.now() - started).toBeGreaterThan(20);
  });

  it("always fails, whatever it is handed", async () => {
    expect(await burnPasswordCheck("")).toBe(false);
    expect(await burnPasswordCheck("birchfam")).toBe(false);
  });
});

describe("email normalisation", () => {
  it("lowercases, so logging in is not case-sensitive", () => {
    expect(normaliseEmail("BirchFam")).toBe("birchfam");
    expect(normaliseEmail("Nathan@Example.COM")).toBe("nathan@example.com");
  });

  it("trims whitespace a phone keyboard likes to add", () => {
    expect(normaliseEmail("  birchfam ")).toBe("birchfam");
    expect(normaliseEmail("birchfam\n")).toBe("birchfam");
  });

  it("is idempotent", () => {
    expect(normaliseEmail(normaliseEmail(" BirchFam "))).toBe("birchfam");
  });
});

describe("bcrypt's 72-byte limit", () => {
  it("is the documented maximum the login form enforces", async () => {
    expect(MAX_PASSWORD_BYTES).toBe(72);

    /*
     * Proof the limit is real, and why the form rejects longer input rather
     * than truncating: bcrypt ignores everything past byte 72, so these two
     * different passwords are the same password as far as it is concerned.
     */
    const long = "a".repeat(MAX_PASSWORD_BYTES);
    const longer = `${long}-completely-different-tail`;
    const hash = await hashPassword(long);
    expect(await verifyPassword(longer, hash)).toBe(true);
  });
});
