/**
 * Database and collection names.
 *
 * ---------------------------------------------------------------------------
 * WHY A DEDICATED DATABASE
 * ---------------------------------------------------------------------------
 * The Atlas connection string points at a shared cluster that also hosts other
 * applications. Rather than prefixing collection names inside somebody else's
 * database, this app claims a database of its own and never reads or writes
 * outside it. Nothing this app does can collide with, overwrite, or even see
 * another app's data.
 *
 * The connection string in `.env` deliberately has no database path (it ends
 * in `.mongodb.net/`), so the name below is the only thing that decides where
 * data lands. `getDb()` in `src/lib/db.ts` is the single place that resolves
 * it, and every query in the app goes through there.
 *
 * When you add chore charts, rewards, stars, mantras or the calendar, add the
 * collection name here — do not hardcode strings at the call site.
 */

/** Every collection this app touches lives in this database. Nothing else. */
export const DB_NAME = "birch_family_app";

export const COLLECTIONS = {
  /** Login accounts. One document per person who can sign in. */
  users: "users",
  /**
   * Server-side session records. The cookie holds a signed pointer to one of
   * these, so a session can be revoked server-side by deleting the document.
   */
  sessions: "sessions",
  /**
   * The nightly pet rotation. One document per animal, holding the order the
   * children take their turn in and the anchor that fixes where in it we are.
   *
   * This is the first collection that holds something the family can *see*
   * rather than something the login needs, and it is in the database rather
   * than in `src/config/pets.ts` precisely so it can be re-anchored without a
   * deploy. See docs/pets.md.
   */
  petRotations: "petRotations",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
