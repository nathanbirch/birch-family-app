import { describe, expect, it } from "vitest";

import { STREAM_LIFETIME_MS, STREAM_POLL_MS, STREAM_RETRY_MS } from "@/config/shopping";
import { EMPTY_LIST, revisionToken } from "@/lib/shopping/list";
import {
  BYE_EVENT,
  LIST_EVENT,
  REVISION_PARAM,
  SHOPPING_STREAM_PATH,
  parseListEvent,
  sseComment,
  sseEvent,
  sseRetry,
  streamUrl,
} from "@/lib/shopping/stream";

/*
 * The wire format. Every rule here is one that fails silently if broken — a
 * frame with a stray newline in it does not error, it simply delivers half a
 * shopping list — so these are the tests that make the protocol readable.
 */

describe("the frames", () => {
  it("ends an event with a blank line", () => {
    // Without the double newline the browser never dispatches: it is still
    // waiting for the rest of the frame.
    expect(sseEvent("list", { a: 1 })).toBe('event: list\ndata: {"a":1}\n\n');
  });

  it("keeps the payload on one line", () => {
    /*
     * The rule that matters most. A `data:` field ends at the first newline, so
     * a pretty-printed payload would be truncated at its first line break and the
     * page would be handed unparseable JSON.
     */
    const frame = sseEvent(LIST_EVENT, {
      active: [{ name: "Milk\nand bread" }],
      completed: [],
      revision: "1:2",
    });
    const dataLines = frame
      .trimEnd()
      .split("\n")
      .filter((line) => line.startsWith("data: "));
    expect(dataLines).toHaveLength(1);
  });

  it("escapes the two characters JSON leaves as line terminators", () => {
    /*
     * U+2028 and U+2029 are legal, unescaped, inside a JSON string — and are
     * line terminators to some parsers. They can only get into a shopping list by
     * being pasted, which is exactly the sort of thing somebody does once and
     * nobody ever manages to reproduce.
     */
    const frame = sseEvent("list", { name: "milk\u2028bread\u2029eggs" });
    expect(frame).not.toContain("\u2028");
    expect(frame).not.toContain("\u2029");
    expect(frame.split("\n").filter((line) => line.startsWith("data: "))).toHaveLength(1);
  });

  it("writes a retry the browser can read", () => {
    expect(sseRetry(1234)).toBe("retry: 1234\n\n");
    expect(sseRetry()).toBe(`retry: ${STREAM_RETRY_MS}\n\n`);
  });

  it("writes the heartbeat as a comment", () => {
    // A comment is ignored by `EventSource` entirely, which is the point: it puts
    // bytes on a silent connection without the page having to know.
    expect(sseComment("still here")).toBe(": still here\n\n");
  });

  it("gives the two event names distinct values", () => {
    expect(LIST_EVENT).not.toBe(BYE_EVENT);
  });
});

describe("the URL", () => {
  it("carries the revision the page already has", () => {
    const revision = revisionToken(3, 1_700_000_000_000);
    const url = new URL(streamUrl(revision), "https://example.test");
    expect(url.pathname).toBe(SHOPPING_STREAM_PATH);
    expect(url.searchParams.get(REVISION_PARAM)).toBe(revision);
  });

  it("escapes the revision rather than trusting its shape", () => {
    // It is a colon-separated token today. Encoding it means the day it stops
    // being one is not the day the stream breaks.
    const url = new URL(streamUrl("2:3&x=1"), "https://example.test");
    expect(url.searchParams.get(REVISION_PARAM)).toBe("2:3&x=1");
  });
});

describe("reading a payload back", () => {
  it("round-trips a list", () => {
    const frame = sseEvent(LIST_EVENT, EMPTY_LIST);
    const data = frame.slice(frame.indexOf("data: ") + 6, frame.indexOf("\n\n"));
    expect(parseListEvent(data)).toEqual(EMPTY_LIST);
  });

  it("refuses anything that is not a list", () => {
    /*
     * Not a trust boundary — the stream is same-origin and authenticated — but a
     * version boundary. A deploy can leave a page holding a connection opened
     * against the previous build, and being handed a shape it does not understand
     * should cost one message rather than the page.
     */
    expect(parseListEvent("not json")).toBeNull();
    expect(parseListEvent("null")).toBeNull();
    expect(parseListEvent("42")).toBeNull();
    expect(parseListEvent("{}")).toBeNull();
    expect(parseListEvent('{"active":[],"completed":[]}')).toBeNull();
    expect(parseListEvent('{"active":{},"completed":[],"revision":"1:1"}')).toBeNull();
  });
});

describe("the timings hold together", () => {
  it("retires the connection before the platform can kill it", () => {
    // `maxDuration` on the route is 60 seconds. Anything at or above that and
    // the handover stops being orderly.
    expect(STREAM_LIFETIME_MS).toBeLessThan(60_000);
  });

  it("polls often enough to feel immediate and rarely enough to be free", () => {
    expect(STREAM_POLL_MS).toBeGreaterThanOrEqual(500);
    expect(STREAM_POLL_MS).toBeLessThanOrEqual(3_000);
  });

  it("gets many polls out of one connection", () => {
    // If this ever fails, the connection is being rebuilt so often that the
    // handover is the dominant cost rather than a seam.
    expect(STREAM_LIFETIME_MS / STREAM_POLL_MS).toBeGreaterThan(10);
  });
});
