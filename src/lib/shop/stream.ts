import { SHOP_STREAM_RETRY_MS } from "@/config/shop";
import type { ShopState } from "./state";

/**
 * The wire between `/api/shop/stream` and the hook that reads it.
 *
 * Same reasoning as `lib/shopping/stream.ts` for why this is server-sent
 * events rather than a WebSocket — this app has nowhere to keep an upgraded
 * socket on Vercel — with one difference worth calling out: there is no
 * revision parameter here. The shopping list needed one because reconnecting
 * without it meant re-sending a potentially large list; a `ShopState` is a
 * handful of numbers, so every connection simply asks for the current state
 * and gets it, revision or not.
 */

export const SHOP_STREAM_PATH = "/api/shop/stream";

/** The current balances, pool progress and pending count. */
export const STATE_EVENT = "state";

/** This connection is retiring; open another. */
export const BYE_EVENT = "bye";

export function sseEvent(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${encode(payload)}\n\n`;
}

export function sseRetry(ms: number = SHOP_STREAM_RETRY_MS): string {
  return `retry: ${ms}\n\n`;
}

export function sseComment(text: string): string {
  return `: ${text}\n\n`;
}

/** Read a `state` event's payload back, or `null` if it is not one. */
export function parseStateEvent(raw: string): ShopState | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ShopState>;
  if (
    typeof candidate.balances !== "object" ||
    candidate.balances === null ||
    typeof candidate.pendingCount !== "number"
  ) {
    return null;
  }

  return {
    balances: candidate.balances as Record<string, number>,
    pool: candidate.pool ?? null,
    pendingCount: candidate.pendingCount,
  };
}

/**
 * `JSON.stringify` without a second argument never emits U+2028/U+2029, but a
 * pasted note (an admin adjustment's `note`) could contain one literally, and
 * both are legal inside a JSON string while some SSE parsers treat them as
 * line terminators. Escaped here the same way `lib/shopping/stream.ts` does.
 */
function encode(payload: unknown): string {
  return JSON.stringify(payload)
    .split("\u2028").join("\\u2028")
    .split("\u2029").join("\\u2029");
}
