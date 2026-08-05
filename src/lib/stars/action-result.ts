/**
 * The shape a star Server Action reports back in.
 *
 * It lives here rather than in `actions.ts` because `"use server"` turns every
 * export in a module into a callable endpoint, and Next.js rejects a module
 * that exports anything which is not an async function — a type alias
 * included. `tests/use-server.test.ts` guards that rule.
 */

export type StarActionResult =
  | { ok: true }
  | { ok: false; message: string };

export const STAR_ACTION_OK: StarActionResult = { ok: true };
