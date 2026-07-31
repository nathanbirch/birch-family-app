/**
 * @vitest-environment node
 *
 * Node, not the project's default jsdom. This module only ever runs on the
 * server, and jsdom supplies its own `TextEncoder` whose `Uint8Array` comes
 * from a different JavaScript realm — `jose` checks `instanceof Uint8Array`
 * on the signing key and rejects it. That is a jsdom artefact, not a bug in
 * the app, and running these tests where the code actually runs avoids
 * contorting the source to satisfy a fake browser.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  decryptSession,
  encryptSession,
} from "@/lib/auth/session-token";

/*
 * The session cookie is the only thing standing between a stranger and the
 * app, so these tests are mostly about what it must *refuse*.
 */

const SECRET = "test-secret-that-is-comfortably-long-enough-for-hs256";
const OTHER_SECRET = "a-completely-different-secret-of-sufficient-length!!";

let original: string | undefined;

beforeEach(() => {
  original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  if (original === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = original;
});

function inAnHour() {
  return new Date(Date.now() + 60 * 60 * 1000);
}

describe("round trip", () => {
  it("returns the session id it was given", async () => {
    const token = await encryptSession({ sessionId: "abc123" }, inAnHour());
    expect(await decryptSession(token)).toEqual({ sessionId: "abc123" });
  });

  it("produces an opaque token that does not leak the payload", async () => {
    const token = await encryptSession({ sessionId: "abc123" }, inAnHour());
    // The JWT body is base64, not encrypted — so assert the *raw* id is not
    // sitting in the string, which is what a naive cookie would do.
    expect(token).not.toContain("abc123");
  });
});

describe("rejects anything untrustworthy", () => {
  it("rejects a missing cookie", async () => {
    expect(await decryptSession(undefined)).toBeNull();
  });

  it("rejects an empty cookie", async () => {
    expect(await decryptSession("")).toBeNull();
  });

  it("rejects a cookie that is not a JWT at all", async () => {
    expect(await decryptSession("not-a-token")).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await encryptSession({ sessionId: "abc123" }, inAnHour());
    const [header, payload, signature] = token.split(".");

    /*
     * Change a character in the *middle* of the signature, not the last one.
     *
     * An HMAC-SHA256 signature is 32 bytes, which base64url encodes as 43
     * characters — but 43 characters carry 258 bits, so the final character
     * only has 4 significant bits and its low 2 bits are padding. Several
     * different last characters therefore decode to the identical 32 bytes,
     * and "tampering" with it leaves a perfectly valid signature. (This test
     * flaked roughly one run in five before it edited the middle instead.)
     */
    const at = Math.floor(signature.length / 2);
    const tampered =
      signature.slice(0, at) +
      (signature[at] === "A" ? "B" : "A") +
      signature.slice(at + 1);

    expect(tampered).not.toBe(signature);
    expect(await decryptSession(`${header}.${payload}.${tampered}`)).toBeNull();
  });

  it("rejects a payload edited to point at someone else's session", async () => {
    const token = await encryptSession({ sessionId: "abc123" }, inAnHour());
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sessionId: "victim" }))
      .toString("base64url");
    expect(await decryptSession(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await encryptSession({ sessionId: "abc123" }, inAnHour());
    process.env.SESSION_SECRET = OTHER_SECRET;
    expect(await decryptSession(token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await encryptSession(
      { sessionId: "abc123" },
      new Date(Date.now() - 1000),
    );
    expect(await decryptSession(token)).toBeNull();
  });

  it("rejects an unsigned 'alg: none' token", async () => {
    // The classic JWT attack: strip the signature and claim no algorithm.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }))
      .toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sessionId: "victim" }))
      .toString("base64url");
    expect(await decryptSession(`${header}.${payload}.`)).toBeNull();
  });
});

describe("secret validation", () => {
  it("refuses to run without a secret rather than signing with nothing", async () => {
    delete process.env.SESSION_SECRET;
    await expect(
      encryptSession({ sessionId: "abc" }, inAnHour()),
    ).rejects.toThrow(/SESSION_SECRET is not set/);
  });

  it("refuses a secret too short to be a safe HS256 key", async () => {
    process.env.SESSION_SECRET = "too-short";
    await expect(
      encryptSession({ sessionId: "abc" }, inAnHour()),
    ).rejects.toThrow(/too short/);
  });
});

describe("cookie settings", () => {
  it("versions the cookie name, so a format change invalidates old cookies", () => {
    expect(SESSION_COOKIE).toMatch(/_v\d+$/);
  });

  it("keeps people signed in for 30 days", () => {
    expect(SESSION_DURATION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
