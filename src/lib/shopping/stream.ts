/**
 * The wire between the two halves of the live list.
 *
 * Pure string formatting and the two names the protocol uses, shared by the
 * route handler that writes the stream and the hook that reads it — so neither
 * side can drift from the other, and both can be tested without a socket.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SERVER-SENT EVENTS AND NOT A WEBSOCKET
 * ---------------------------------------------------------------------------
 * The requirement is "when somebody else adds something, my screen shows it
 * without a reload". A WebSocket is the usual way to say that, and it is not
 * available here: this app is deployed as serverless functions on Vercel (see
 * docs/deployment.md), which terminate the HTTP request before any handler runs
 * and have nowhere to keep an upgraded socket. Next.js Route Handlers have no
 * upgrade hook for the same reason. A WebSocket would need a long-lived Node
 * process — a second host, or a hosted realtime service — for a family shopping
 * list.
 *
 * Server-sent events give the same guarantee over the connection Vercel already
 * serves: one long-lived streaming GET, pushed from the server, with automatic
 * reconnection built into the browser. The differences from a WebSocket are both
 * in this feature's favour:
 *
 *   - It is one-directional, and everything this page sends upstream is a
 *     mutation that wants a Server Action's authentication anyway.
 *   - It is an ordinary HTTP request, so it carries the session cookie and is
 *     authenticated by exactly the same check as every page.
 *
 * What it costs is a ceiling on how long one connection lives, which the handler
 * turns into a seam nobody sees — see `STREAM_LIFETIME_MS`.
 */

import { STREAM_RETRY_MS } from "@/config/shopping";
import type { ShoppingList } from "./list";

/** Where the stream lives. One route, one client. */
export const SHOPPING_STREAM_PATH = "/api/shopping/stream";

/**
 * The revision the browser already has, handed over when it connects.
 *
 * Without it, every reconnection — and there is one every fifty seconds — would
 * begin by re-sending a list the page is already showing. With it, a reconnect
 * that happens during a quiet minute costs a few headers and nothing else.
 */
export const REVISION_PARAM = "revision";

/** The whole list, because something about it changed. */
export const LIST_EVENT = "list";

/**
 * This connection is retiring; open another.
 *
 * The alternative is letting the browser's own reconnection handle it, which
 * works but is slower (it waits out `STREAM_RETRY_MS`) and reconnects to the
 * *original* URL, revision parameter and all — so it would arrive claiming to
 * know a revision from a minute ago and be sent the list again for nothing.
 */
export const BYE_EVENT = "bye";

/** The URL to open, telling the server what this page already knows. */
export function streamUrl(revision: string): string {
  const params = new URLSearchParams({ [REVISION_PARAM]: revision });
  return `${SHOPPING_STREAM_PATH}?${params.toString()}`;
}

/**
 * One `event:`/`data:` frame.
 *
 * The JSON is emitted on a single line, which is what makes this safe: a `data:`
 * field ends at the first newline, so a pretty-printed payload would be
 * truncated at its first line break. `JSON.stringify` without a spacer never
 * produces one, and `\u2028`/`\u2029` — legal in JSON strings and treated as
 * line terminators by some parsers — are escaped below to keep that true for
 * pasted text as well.
 */
export function sseEvent(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${encode(payload)}\n\n`;
}

/** How long the browser should wait before reconnecting on its own. */
export function sseRetry(ms: number = STREAM_RETRY_MS): string {
  return `retry: ${ms}\n\n`;
}

/**
 * A comment line — the heartbeat.
 *
 * Ignored by `EventSource` entirely, which is the point: it exists to put bytes
 * on a connection that has been silent, so that proxies and mobile radios do not
 * decide it has been abandoned.
 */
export function sseComment(text: string): string {
  return `: ${text}\n\n`;
}

/**
 * Read a `list` event's payload back into a list, or `null` if it is not one.
 *
 * The stream is same-origin and authenticated, so this is not a trust boundary —
 * it is a version boundary. A deploy can leave a page holding an `EventSource`
 * opened against the previous build; being handed a shape it does not understand
 * should cost that one message, not the page.
 */
export function parseListEvent(raw: string): ShoppingList | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ShoppingList>;
  if (
    !Array.isArray(candidate.active) ||
    !Array.isArray(candidate.completed) ||
    typeof candidate.revision !== "string"
  ) {
    return null;
  }

  return {
    active: candidate.active,
    completed: candidate.completed,
    revision: candidate.revision,
  };
}

function encode(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
