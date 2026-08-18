/**
 * What a shopping-list Server Action answers with.
 *
 * In its own file for a mechanical reason worth knowing: `actions.ts` carries
 * the `"use server"` directive, and Next.js rejects a module with that directive
 * if it exports anything other than an async function. A type exported from
 * there would fail the build. `lib/stars/action-result.ts` exists for exactly
 * the same reason.
 */

export type ShoppingActionResult =
  | { ok: true }
  | {
      ok: false;
      /** Shown to whoever tapped, verbatim. Written for a child to read. */
      message: string;
      /**
       * The row that already says what somebody just tried to add.
       *
       * Set only by the duplicate case, and it is the reason that case is a
       * refusal rather than a silent no-op: the page flashes the existing line
       * instead of leaving somebody wondering where their milk went.
       */
      duplicateId?: string;
    };
