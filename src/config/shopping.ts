/**
 * The shopping list's fixed numbers.
 *
 * Everything here is a limit or a timing rather than a fact about the family,
 * which is what makes this the shortest config file in the app: a shopping list
 * has no content of its own. What it needs instead is a handful of ceilings —
 * on the length of a line, on how much history is worth carrying, and on how
 * long a live connection is allowed to sit open.
 */

/**
 * The longest an item may be.
 *
 * Long enough for "the big tub of Greek yoghurt, not the small one" and short
 * enough that one line cannot push the tick out of a thumb's reach. Names longer
 * than this are trimmed rather than refused — somebody typing a sentence into a
 * shopping list should get their shopping list item, not an error.
 */
export const ITEM_NAME_MAX_LENGTH = 80;

/**
 * How much of the finished list is kept on screen.
 *
 * The accordion is a receipt, not an archive: it answers "did somebody already
 * get the milk?" and nothing else. Older rows stay in the database — nothing is
 * deleted for being old — they are simply past the point where anybody scrolls.
 */
export const COMPLETED_HISTORY_LIMIT = 100;

/**
 * How many things may be wanted at once.
 *
 * Not a storage concern — it is a child with a thumb on the Add button. A real
 * week's shopping is thirty or forty lines, so two hundred is far past anything
 * anybody means and near enough to be an obvious accident when it is hit. The
 * finished half has no equivalent ceiling: it grows by the same rows leaving
 * here, and only the newest hundred are ever shown.
 */
export const ACTIVE_ITEM_LIMIT = 200;

/* -------------------------------------------------------------------------- */
/* The live connection                                                         */
/* -------------------------------------------------------------------------- */

/**
 * How often the open stream asks the database whether anything changed.
 *
 * This is the *other* devices' latency, not this one's: whoever tapped saw
 * their own change on the frame they tapped it, and this is how long the phone
 * on the other side of the kitchen takes to agree. A second and a half reads as
 * "immediately" to somebody who is not looking at a clock, and it is slow enough
 * that a handful of open phones cost the free-tier cluster nothing measurable.
 *
 * The query behind it is deliberately tiny — a count and a maximum, not the
 * list. See `readShoppingRevision()`.
 */
export const STREAM_POLL_MS = 1_500;

/**
 * How long one connection lives before it hands over to a fresh one.
 *
 * Serverless functions are killed at a platform-imposed ceiling, and being
 * killed mid-stream is indistinguishable from the network dropping. So the
 * stream retires itself with ten seconds to spare, says goodbye first, and the
 * page opens the next one immediately — which turns an unavoidable interruption
 * into a seam nobody can see.
 *
 * Must stay comfortably under the `maxDuration` exported by the route.
 */
export const STREAM_LIFETIME_MS = 50_000;

/**
 * How often a comment line is sent when nothing has changed.
 *
 * Proxies and phone radios drop connections that have been silent for a while,
 * and a shopping list is silent almost all of the time. Fifteen seconds is well
 * inside every timeout that matters and costs two bytes.
 */
export const STREAM_HEARTBEAT_MS = 15_000;

/**
 * How long the browser waits before reconnecting on its own.
 *
 * Only reached when a connection dies *without* saying goodbye — a tunnel, a
 * dropped wifi, a function killed early. The orderly handover does not wait for
 * this.
 */
export const STREAM_RETRY_MS = 3_000;

/**
 * How long an unconfirmed local change is trusted over the server's answer.
 *
 * A tick is drawn the instant it is tapped, before the write has finished, so
 * for a moment the screen is ahead of the database. That gap normally closes on
 * its own — see `reconcile()` — and this is the backstop for when it does not:
 * past it, the server is believed and the tick springs back. Four seconds is
 * long enough to cover a slow write on a bad connection and short enough that
 * nobody walks away with a wrong list.
 */
export const PENDING_GRACE_MS = 4_000;
