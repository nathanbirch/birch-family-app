import { jwtVerify, SignJWT } from "jose";

/**
 * The session cookie's format, and nothing else.
 *
 * Split out from `session.ts` on purpose: `proxy.ts` needs to read and verify
 * the cookie on every request, and importing `session.ts` there would pull the
 * whole MongoDB driver and `next/headers` into the proxy bundle. This module
 * has no dependencies beyond `jose`, so the proxy stays small and fast.
 *
 * Nothing here touches the database or the cookie store — it only signs and
 * verifies the token itself.
 */

/** Cookie name. Versioned so a format change can invalidate old cookies. */
export const SESSION_COOKIE = "birch_session_v1";

/** How long a login lasts. Long, because this is a family app on phones. */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** What the signed cookie carries. Nothing sensitive — just a pointer. */
export type SessionPayload = {
  sessionId: string;
};

function signingKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Copy .env.example to .env and fill it in " +
        "(locally), or add it to the Vercel project's environment variables " +
        "(deployed). See docs/authentication.md.",
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is too short to be a safe HS256 key. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
  return new TextEncoder().encode(secret);
}

export async function encryptSession(
  payload: SessionPayload,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(signingKey());
}

/**
 * Verifies the cookie's signature and returns its payload.
 *
 * Returns `null` for anything untrustworthy — tampered, expired, or signed
 * with a different secret — rather than throwing, because every caller's
 * response to a bad cookie is the same: treat the request as logged out.
 */
export async function decryptSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, signingKey(), {
      algorithms: ["HS256"],
    });
    return typeof payload.sessionId === "string"
      ? { sessionId: payload.sessionId }
      : null;
  } catch {
    return null;
  }
}
