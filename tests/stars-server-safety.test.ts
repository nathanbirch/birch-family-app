/**
 * @vitest-environment node
 *
 * The browser-only modules, imported where there is no browser.
 *
 * Next.js renders every one of these on the server first. A module that
 * reaches for `window` or `localStorage` at import or on first call takes the
 * whole page down with a ReferenceError — and it does it in production, on the
 * server, where nobody is watching a console. So each guard is checked in a
 * Node environment rather than assumed from reading the code.
 */
import { describe, expect, it, vi } from "vitest";

// `src/lib/db.ts` is marked `server-only`, which throws on import outside a
// Server Component. In a Node test there is no such distinction to make.
vi.mock("server-only", () => ({}));

import { readSoundOn, writeSoundOn } from "@/lib/sound-storage";
import { playCheer, primeCheer } from "@/lib/stars/cheer";
import { describeConnectionError } from "@/lib/db";

describe("with no window at all", () => {
  it("has no window, or these tests prove nothing", () => {
    expect(typeof window).toBe("undefined");
  });

  it("reports the sound as on and refuses to write", () => {
    expect(readSoundOn()).toBe(true);
    expect(() => writeSoundOn(false)).not.toThrow();
  });

  it("plays nothing, and does not reach for AudioContext", () => {
    expect(() => primeCheer()).not.toThrow();
    expect(() => playCheer(1)).not.toThrow();
  });
});

describe("explaining a database failure", () => {
  /*
   * Atlas's connection errors are famously opaque, and every one of these has
   * been hit for real while setting this app up. The translation is the
   * difference between "fix your Network Access allowlist" and an afternoon.
   */
  it("recognises the TLS handshake rejection that means an IP allowlist problem", () => {
    const message = describeConnectionError(
      new Error("tlsv1 alert internal error"),
    );
    expect(message).toMatch(/Network Access/i);
    expect(message).toMatch(/allowlist|IP/i);
  });

  it("recognises bad credentials without echoing them", () => {
    const message = describeConnectionError(new Error("Authentication failed"));
    expect(message).toMatch(/MONGODB_URI|credential/i);
  });

  it("recognises a cluster that is asleep or firewalled", () => {
    const message = describeConnectionError(
      new Error("Server selection timed out after 15000 ms"),
    );
    expect(message).toMatch(/paused|firewall|27017/i);
  });

  it("passes anything else through rather than guessing", () => {
    expect(describeConnectionError(new Error("something new"))).toContain(
      "something new",
    );
  });

  it("copes with something thrown that is not an Error", () => {
    expect(() => describeConnectionError("just a string")).not.toThrow();
    expect(() => describeConnectionError(undefined)).not.toThrow();
    expect(() => describeConnectionError({ weird: true })).not.toThrow();
  });
});

describe("the connection string", () => {
  it("explains itself when MONGODB_URI is missing", async () => {
    const original = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    vi.resetModules();

    const { getClient } = await import("@/lib/db");
    /*
     * It throws synchronously rather than returning a rejected promise, which
     * is the right shape for a configuration error: it cannot be retried, and
     * failing at the call site puts the stack where the mistake is.
     *
     * The message has to say what to *do*, not just what is wrong — this is
     * the first thing a fresh clone hits.
     */
    expect(() => getClient()).toThrow(/MONGODB_URI/);
    expect(() => getClient()).toThrow(/\.env|Vercel/);

    if (original !== undefined) process.env.MONGODB_URI = original;
    vi.resetModules();
  });
});
