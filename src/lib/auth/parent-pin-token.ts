import { jwtVerify, SignJWT } from "jose";

/**
 * The parent-PIN cookie's format, and nothing else.
 *
 * Split out from `parent-pin.ts` for the same reason `session-token.ts` is
 * split from `session.ts`: this has no dependency on MongoDB or
 * `next/headers`, only on `jose`, which keeps it cheap to import anywhere that
 * only needs to *verify* a cookie rather than read or write one.
 *
 * This is deliberately a second, separate cookie from the family's session —
 * see the note at the top of `parent-pin.ts` for why the two must not be
 * conflated.
 */

/** Cookie name. Versioned so a format change can invalidate old cookies. */
export const PARENT_PIN_COOKIE = "birch_parent_pin_v1";

/** How long a PIN unlock lasts before the admin screen asks again. */
export const PARENT_PIN_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * What the signed cookie carries.
 *
 * `kind` exists purely so this token can never be mistaken for the session
 * token even though both are HS256 JWTs signed with the same secret — a
 * session cookie handed to `decryptParentPin` is rejected for having the
 * wrong `kind` rather than being accidentally accepted because the shapes
 * happen to overlap.
 */
export type ParentPinPayload = {
  kind: "parent-pin";
};

function signingKey(): Uint8Array {
  // Reusing `SESSION_SECRET` rather than inventing a second environment
  // variable. The two tokens cannot be confused for each other even though
  // they share a key — `kind` is checked on every read — and one more secret
  // to generate, document and rotate would buy nothing a family app needs.
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Copy .env.example to .env and fill it in " +
        "(locally), or add it to the Vercel project's environment variables " +
        "(deployed).",
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is too short to be a safe HS256 key. See session-token.ts.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function encryptParentPin(expiresAt: Date): Promise<string> {
  return new SignJWT({ kind: "parent-pin" } satisfies ParentPinPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(signingKey());
}

/**
 * Verifies the cookie's signature and shape.
 *
 * Returns `null` for anything untrustworthy — tampered, expired, signed with a
 * different secret, or simply not a parent-PIN token — rather than throwing,
 * so every caller's response to a bad cookie is the same: treat it as locked.
 */
export async function decryptParentPin(
  token: string | undefined,
): Promise<ParentPinPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<ParentPinPayload>(token, signingKey(), {
      algorithms: ["HS256"],
    });
    return payload.kind === "parent-pin" ? { kind: "parent-pin" } : null;
  } catch {
    return null;
  }
}
