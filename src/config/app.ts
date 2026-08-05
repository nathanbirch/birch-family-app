/**
 * Application-level configuration.
 *
 * Change the app title, tagline and rotation start date here.
 */

/** Displayed in the header, the document title and the PWA manifest. */
export const APP_NAME = "Birch Family App";

/** Used for the PWA `short_name` (keep it under ~12 characters). */
export const APP_SHORT_NAME = "Birch Fam";

/** One-line description used in metadata and the manifest. */
export const APP_DESCRIPTION =
  "The Birch family's home for seating, chores and everything else.";

/**
 * The Monday that Week 1 of the rotation begins, as a local calendar date
 * (`YYYY-MM-DD`). Change this to re-anchor the five-week cycle.
 *
 * This was originally 2026-08-03, the Monday *after* the app was built. But the
 * app happily showed Week 1's seats during the days before that date, and the
 * family sat in them — so when 2026-08-03 arrived nothing moved, and the week
 * that should have been Week 2 was Week 1 all over again. Re-anchored one week
 * earlier to the Monday the seats were actually first used.
 */
export const ROTATION_START_DATE = "2026-07-27";

/*
 * Versioned localStorage keys for the two device-local preferences.
 *
 * These kept their original `birch-family-seats:` prefix through the rename to
 * Birch Family App. Changing them would silently reset everyone's saved theme
 * and parent-swap choice on their next visit, which is a worse outcome than a
 * slightly dated string.
 */

export const THEME_STORAGE_KEY = "birch-family-seats:theme:v1";

/** Whether the two parents have been swapped out of their configured seats. */
export const PARENTS_STORAGE_KEY = "birch-family-seats:parents-swapped:v1";

/**
 * The last page visited, reopened on the next cold start.
 *
 * Newer than the other two, so it carries the current app name rather than the
 * historical `birch-family-seats:` prefix. There is nothing to preserve — the
 * key has never shipped under another name.
 */
export const LAST_PAGE_STORAGE_KEY = "birch-family-app:last-page:v1";

/**
 * Whether the star charts cheer out loud when a column is finished.
 *
 * Per device rather than per family: the phone on the kitchen counter should
 * celebrate, the one in a quiet room at bedtime should not, and neither should
 * decide for the other. Defaults to on when the key is absent.
 */
export const SOUND_STORAGE_KEY = "birch-family-app:sound:v1";
