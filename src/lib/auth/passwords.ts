import bcrypt from "bcryptjs";

/**
 * Password hashing, and nothing else.
 *
 * Split out from `users.ts` for the same reason `session-token.ts` is split
 * from `session.ts`: this module has no `server-only` marker and no MongoDB
 * import, so it can be unit-tested directly. `users.ts` re-exports everything
 * here, so call sites are unaffected.
 *
 * Passwords are never stored, only a bcrypt hash. bcrypt salts every hash
 * individually, so two people with the same password get different hashes and
 * a stored value cannot be reversed or looked up in a rainbow table.
 */

/** Cost factor. Each +1 doubles the work; 12 is ~250ms on modern hardware. */
export const BCRYPT_COST = 12;

/**
 * bcrypt only reads the first 72 bytes of a password and silently ignores the
 * rest. Callers reject longer input rather than quietly truncating it.
 */
export const MAX_PASSWORD_BYTES = 72;

/** Emails are matched case-insensitively, so they are stored lowercased. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A real bcrypt hash of a random value nobody can log in with, used purely to
 * burn the same CPU time as a genuine password check when the email does not
 * exist. Without it, unknown emails would return measurably faster than known
 * ones, which is enough to discover which addresses have accounts.
 *
 * Generated once per process and cached. A hand-written constant would risk
 * being malformed, and `bcrypt.compare` returns `false` almost instantly on a
 * malformed hash — silently reintroducing the exact timing gap this closes.
 */
let decoy: Promise<string> | undefined;

export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(
    `decoy:${Math.random().toString(36)}:${Date.now().toString(36)}`,
  );
  return decoy;
}

/** Burns a password-check's worth of CPU. Always resolves `false`. */
export async function burnPasswordCheck(password: string): Promise<false> {
  await verifyPassword(password, await decoyHash());
  return false;
}
