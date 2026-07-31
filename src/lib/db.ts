import "server-only";

import { MongoClient, type Collection, type Db, type Document } from "mongodb";

import { COLLECTIONS, DB_NAME, type CollectionName } from "@/config/db";

/**
 * The MongoDB connection.
 *
 * One `MongoClient` per process, reused across every request. The driver keeps
 * an internal connection pool, so creating a second client would double the
 * connections against the cluster for no benefit — and Atlas's free tier has a
 * hard connection cap that is easy to exhaust that way.
 *
 * In development, `next dev` hot-reloads modules on every edit. Without the
 * `globalThis` cache below, each reload would leak a fresh pool and the cluster
 * would eventually refuse new connections. Stashing the promise on `globalThis`
 * survives module reloads; in production the module is evaluated once and the
 * cache is irrelevant.
 */

declare global {
  var __birchMongoClient: Promise<MongoClient> | undefined;
}

function connectionString(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env and fill it in " +
        "(locally), or add it to the Vercel project's environment variables " +
        "(deployed). See docs/database.md.",
    );
  }
  return uri;
}

function createClient(): Promise<MongoClient> {
  return new MongoClient(connectionString(), {
    // Fail fast with a clear error rather than hanging a page render for the
    // driver's 30s default when the cluster is unreachable or this machine's
    // IP is not on the Atlas Network Access allowlist.
    serverSelectionTimeoutMS: 10_000,
  }).connect();
}

/** The shared, lazily-established client. */
export function getClient(): Promise<MongoClient> {
  globalThis.__birchMongoClient ??= createClient();
  return globalThis.__birchMongoClient;
}

/**
 * This app's database — never the cluster default.
 *
 * Every read and write in the app funnels through here, which is what keeps
 * the promise made in `src/config/db.ts`: nothing outside `birch_family_app`
 * is ever touched.
 */
export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(DB_NAME);
}

/** A typed handle to one of the collections declared in `config/db.ts`. */
export async function getCollection<T extends Document>(
  name: CollectionName,
): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

/**
 * Turns the driver's opaque connection failures into something actionable.
 *
 * Atlas rejects connections from IPs that are not on its Network Access
 * allowlist at the TLS layer, which surfaces as a bare OpenSSL alert with no
 * mention of allowlists at all. That error costs a lot of time if you have not
 * seen it before, so name it explicitly.
 */
export function describeConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("tlsv1 alert internal error") || message.includes("SSL alert number 80")) {
    return (
      "MongoDB refused the TLS handshake. This almost always means this " +
      "machine's public IP is not on the Atlas Network Access allowlist. " +
      "Add it at https://cloud.mongodb.com → Network Access. " +
      `(Original: ${message})`
    );
  }

  if (message.includes("Server selection timed out")) {
    return (
      "Could not reach the MongoDB cluster within 10s. Check the cluster is " +
      "not paused, and that outbound port 27017 is not blocked. " +
      `(Original: ${message})`
    );
  }

  if (message.includes("Authentication failed")) {
    return (
      "MongoDB rejected the credentials in MONGODB_URI. Check the username " +
      `and password. (Original: ${message})`
    );
  }

  return message;
}

export { COLLECTIONS };
