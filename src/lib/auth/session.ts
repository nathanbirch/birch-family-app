import "server-only";

import { ObjectId, type Collection } from "mongodb";
import { cookies } from "next/headers";

import { COLLECTIONS } from "@/config/db";
import { getCollection } from "@/lib/db";

import {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  decryptSession,
  encryptSession,
} from "./session-token";

/**
 * Sessions — the database half. The cookie's format lives in `session-token.ts`.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS WORKS
 * ---------------------------------------------------------------------------
 * The session is stored in *two* places, deliberately:
 *
 *   1. A document in the `sessions` collection — the source of truth.
 *   2. A signed JWT in an HttpOnly cookie, containing only the session id.
 *
 * The cookie is a pointer, not the session itself. That is what makes a
 * session revocable: deleting the document logs that device out immediately,
 * whereas a self-contained JWT would stay valid in the user's browser until it
 * expired no matter what the server did.
 *
 * The JWT signature stops anyone forging a pointer to somebody else's session,
 * and it lets `proxy.ts` do a cheap "is this plausibly a login?" check without
 * a database round trip on every single request.
 */

export {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  decryptSession,
  encryptSession,
  type SessionPayload,
} from "./session-token";

export type SessionDocument = {
  _id: ObjectId;
  userId: ObjectId;
  createdAt: Date;
  /** Refreshed on use, so an active device is not logged out mid-week. */
  lastSeenAt: Date;
  /** MongoDB deletes the document itself once this passes. See the TTL index. */
  expiresAt: Date;
};

async function sessions(): Promise<Collection<SessionDocument>> {
  return getCollection<SessionDocument>(COLLECTIONS.sessions);
}

/**
 * Starts a session for `userId` and sets the cookie.
 *
 * Called from a Server Action, which is the only place a cookie may be
 * written. Setting it on the server is what keeps it `HttpOnly` and therefore
 * unreadable by any script on the page.
 */
export async function createSession(userId: ObjectId): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  const collection = await sessions();
  const doc: SessionDocument = {
    _id: new ObjectId(),
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  };
  await collection.insertOne(doc);

  const token = await encryptSession(
    { sessionId: doc._id.toHexString() },
    expiresAt,
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Allows the cookie over plain HTTP on localhost, where there is no TLS.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** The live session document, or `null` if the cookie is stale or forged. */
export async function readSession(): Promise<SessionDocument | null> {
  const store = await cookies();
  const payload = await decryptSession(store.get(SESSION_COOKIE)?.value);
  if (!payload || !ObjectId.isValid(payload.sessionId)) return null;

  const collection = await sessions();
  const doc = await collection.findOne({
    _id: new ObjectId(payload.sessionId),
  });
  if (!doc) return null;

  // Belt and braces: the TTL index below removes expired documents, but Mongo
  // only sweeps once a minute, so a just-expired session can still be read.
  if (doc.expiresAt.getTime() <= Date.now()) return null;

  return doc;
}

/** Ends the current session everywhere: database first, then the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const payload = await decryptSession(store.get(SESSION_COOKIE)?.value);

  if (payload && ObjectId.isValid(payload.sessionId)) {
    const collection = await sessions();
    await collection.deleteOne({ _id: new ObjectId(payload.sessionId) });
  }

  store.delete(SESSION_COOKIE);
}

/**
 * Indexes for the sessions collection. Idempotent; the seed script runs it.
 *
 * The TTL index on `expiresAt` makes MongoDB delete expired sessions for us,
 * so the collection cannot grow without bound and no cleanup job is needed.
 */
export async function ensureSessionIndexes(): Promise<void> {
  const collection = await sessions();
  await collection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: "session_ttl" },
  );
  await collection.createIndex({ userId: 1 }, { name: "by_user" });
}
