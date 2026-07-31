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
 */
export const ROTATION_START_DATE = "2026-08-03";

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
