/**
 * The shop's fixed numbers — the live connection's timings, mirroring
 * `config/shopping.ts` exactly. See that file for why each one is what it is;
 * the shop's stream is built on the same shape for the same reasons, just
 * carrying balances and pool progress instead of a list.
 */

/** How often the open stream asks the database whether anything changed. */
export const SHOP_STREAM_POLL_MS = 1_500;

/** How long one connection lives before it hands over to a fresh one. */
export const SHOP_STREAM_LIFETIME_MS = 50_000;

/** How often a comment line is sent when nothing has changed. */
export const SHOP_STREAM_HEARTBEAT_MS = 15_000;

/** How long the browser waits before reconnecting on its own. */
export const SHOP_STREAM_RETRY_MS = 3_000;
