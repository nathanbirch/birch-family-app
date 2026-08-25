import "server-only";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import {
  PARENT_PIN_COOKIE,
  PARENT_PIN_DURATION_MS,
  decryptParentPin,
  encryptParentPin,
} from "./parent-pin-token";

/**
 * The parent-only gate in front of `/shop/admin`.
 *
 * ---------------------------------------------------------------------------
 * A SECOND, SEPARATE COOKIE FROM THE FAMILY SESSION
 * ---------------------------------------------------------------------------
 * There is one shared family login and no per-person accounts (see
 * `lib/auth/dal.ts`) — every child who can unlock the front door can already
 * sign in as "Birch Family". The PIN is not a second *account*, it is a
 * second *lock*, on the one screen where "signed in" is not enough: catalogue
 * prices, approving an outing, correcting a balance.
 *
 * It is deliberately not folded into the session cookie. A device can be
 * signed in for a month (`SESSION_DURATION_MS`) but the PIN unlock lasts two
 * hours (`PARENT_PIN_DURATION_MS`) and is checked on every admin Server
 * Action, not only on the page — see the note on `requireParentPin` below.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PIN ITSELF IS COMPARED, NOT HASHED
 * ---------------------------------------------------------------------------
 * `PARENT_PIN` already lives in the same place `MONGODB_URI` and
 * `SESSION_SECRET` do — the server's environment, never sent to the browser
 * except as this cookie's yes/no answer. Hashing it the way a password is
 * hashed buys nothing here: there is no leaked-database scenario to protect
 * against, because there is no database row to leak — it is one string in
 * Vercel's project settings. What a short PIN *is* exposed to is a guessing
 * script, and `timingSafeEqual` is what actually matters against that: it
 * stops the comparison itself from leaking how many leading digits were
 * right through response timing, which a plain `===` on V8 does not
 * guarantee.
 */

function correctPin(): string {
  const pin = process.env.PARENT_PIN;
  if (!pin) {
    throw new Error(
      "PARENT_PIN is not set. Copy .env.example to .env and fill it in " +
        "(locally), or add it to the Vercel project's environment variables " +
        "(deployed).",
    );
  }
  return pin;
}

/** Whether `candidate` is the family's parent PIN. */
export function checkParentPin(candidate: string): boolean {
  const expected = Buffer.from(correctPin());
  const given = Buffer.from(candidate);
  // Equal-length buffers only: `timingSafeEqual` throws on a length mismatch,
  // and a wrong-length guess is exactly as wrong as any other.
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** Sets the short-lived unlock cookie. Only callable from a Server Action. */
export async function setParentPinCookie(): Promise<void> {
  const expiresAt = new Date(Date.now() + PARENT_PIN_DURATION_MS);
  const token = await encryptParentPin(expiresAt);

  const store = await cookies();
  store.set(PARENT_PIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** Ends the admin unlock early — a "lock" button, or a good habit on leaving. */
export async function clearParentPinCookie(): Promise<void> {
  const store = await cookies();
  store.delete(PARENT_PIN_COOKIE);
}

/** Whether this request is carrying a currently-valid unlock. Never throws. */
export async function hasParentPinUnlock(): Promise<boolean> {
  const store = await cookies();
  const payload = await decryptParentPin(store.get(PARENT_PIN_COOKIE)?.value);
  return payload !== null;
}

/**
 * Guards an admin Server Action. Throws if the PIN has not been entered.
 *
 * `/shop/admin` itself checks `hasParentPinUnlock()` to decide whether to draw
 * the PIN form or the admin board — a redirect has nowhere sensible to go,
 * since this *is* the only admin route. But per the rule stated throughout
 * this codebase ("every export of a `\"use server\"` file is a public
 * endpoint"), the page's own gate is not the real boundary: every export in
 * `lib/rewards/admin-actions.ts` calls this first, so a request built by hand
 * against `createRewardItem` — bypassing the page entirely — is refused
 * exactly as the page would refuse it.
 */
export async function requireParentPin(): Promise<void> {
  if (!(await hasParentPinUnlock())) {
    throw new Error("Locked. Enter the parent PIN first.");
  }
}
