/**
 * What a Bored Page Server Action answers with.
 *
 * In its own file for the mechanical reason `lib/stars/action-result.ts` and
 * `lib/shopping/action-result.ts` are: Next.js rejects a `"use server"` module
 * that exports anything other than an async function, so a type exported from
 * `actions.ts` would fail the build.
 */

export type BoredActionResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * Shown to whoever tapped, verbatim.
       *
       * Kept to one short sentence on this page more than anywhere else. Every
       * other page can lean on a line of prose; this one is read by a
       * four-year-old, and the words here are the only ones on it that are not a
       * caption.
       */
      message: string;
    };
