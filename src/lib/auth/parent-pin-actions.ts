"use server";

import { z } from "zod";

import { requireUser } from "./dal";
import {
  checkParentPin,
  clearParentPinCookie,
  setParentPinCookie,
} from "./parent-pin";

/**
 * Unlocking and locking the parent-only admin screen.
 *
 * `"use server"` — every export here is reachable directly, so `requireUser()`
 * runs first even though a signed-out visitor could not see the PIN form in
 * the first place. `checkParentPin` itself is the real gate; there is no
 * rate limiting on it beyond what a family typing a PIN by hand implies,
 * which matches the threat model described in `parent-pin.ts`.
 */

const PinSchema = z.object({ pin: z.string().min(1).max(32) });

export async function unlockParentPin(input: {
  pin: string;
}): Promise<{ ok: boolean; message?: string }> {
  await requireUser();

  const parsed = PinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter the PIN." };

  try {
    if (!checkParentPin(parsed.data.pin)) {
      return { ok: false, message: "That is not the right PIN." };
    }
  } catch (error) {
    // `PARENT_PIN` missing from the environment. Reported plainly rather than
    // as "wrong PIN" — a parent staring at this needs to know to set the
    // variable, not to keep retyping.
    console.error("[shop] Could not check the parent PIN:", error);
    return { ok: false, message: "The parent PIN is not configured yet." };
  }

  await setParentPinCookie();
  return { ok: true };
}

export async function lockParentPin(): Promise<{ ok: true }> {
  await requireUser();
  await clearParentPinCookie();
  return { ok: true };
}
