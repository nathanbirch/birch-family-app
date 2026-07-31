import "server-only";

import { ObjectId, type Collection } from "mongodb";

import { COLLECTIONS } from "@/config/db";
import { getCollection } from "@/lib/db";

import {
  burnPasswordCheck,
  hashPassword,
  normaliseEmail,
  verifyPassword,
} from "./passwords";

/**
 * Login accounts — the database half. The hashing lives in `passwords.ts`.
 */

export {
  BCRYPT_COST,
  MAX_PASSWORD_BYTES,
  hashPassword,
  normaliseEmail,
  verifyPassword,
} from "./passwords";

export type UserDocument = {
  _id: ObjectId;
  /** Lowercased. The login identifier — unique across the collection. */
  email: string;
  /** bcrypt hash of the password. Never leaves the server. */
  passwordHash: string;
  /** Shown in the UI, e.g. "Birch Family". */
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The safe shape of a user — everything the rest of the app is allowed to see.
 *
 * `passwordHash` is deliberately absent. Server Components serialize whatever
 * they pass to Client Components, so a stray full document would ship the hash
 * to the browser. Returning a DTO from the data layer makes that mistake
 * impossible rather than merely unlikely.
 */
export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
};

export function toPublicUser(doc: UserDocument): PublicUser {
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    displayName: doc.displayName,
  };
}

async function users(): Promise<Collection<UserDocument>> {
  return getCollection<UserDocument>(COLLECTIONS.users);
}

export async function findUserByEmail(
  email: string,
): Promise<UserDocument | null> {
  const collection = await users();
  return collection.findOne({ email: normaliseEmail(email) });
}

export async function findUserById(id: string): Promise<UserDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const collection = await users();
  return collection.findOne({ _id: new ObjectId(id) });
}

/**
 * Checks an email/password pair.
 *
 * Returns `null` for both "no such user" and "wrong password", and — crucially
 * — runs a bcrypt comparison even when the user does not exist. Skipping the
 * hash for unknown emails would make those responses measurably faster, which
 * lets an attacker discover which email addresses have accounts just by timing
 * the responses.
 */
export async function authenticate(
  email: string,
  password: string,
): Promise<UserDocument | null> {
  const user = await findUserByEmail(email);

  if (!user) {
    await burnPasswordCheck(password);
    return null;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? user : null;
}

/**
 * Creates the account if the email is free, otherwise leaves it untouched.
 *
 * Used by the seed script, which must be safe to run repeatedly — re-running
 * it should never reset a password that has since been changed.
 */
export async function createUserIfAbsent(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ user: UserDocument; created: boolean }> {
  const collection = await users();
  const email = normaliseEmail(input.email);

  const existing = await collection.findOne({ email });
  if (existing) return { user: existing, created: false };

  const now = new Date();
  const doc: UserDocument = {
    _id: new ObjectId(),
    email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await collection.insertOne(doc);
    return { user: doc, created: true };
  } catch (error) {
    // Lost a race against a concurrent seed — the unique index rejected us.
    // The other writer's document is just as good, so use it.
    if (isDuplicateKeyError(error)) {
      const winner = await collection.findOne({ email });
      if (winner) return { user: winner, created: false };
    }
    throw error;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * The indexes the users collection needs.
 *
 * `createIndex` is idempotent, so the seed script can call this every run.
 * The unique index on `email` is what actually enforces one-account-per-email;
 * the check in `createUserIfAbsent` is a convenience, not the guarantee.
 */
export async function ensureUserIndexes(): Promise<void> {
  const collection = await users();
  await collection.createIndex({ email: 1 }, { unique: true, name: "email_unique" });
}
