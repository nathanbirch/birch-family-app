/**
 * What a coins Server Action answers with.
 *
 * In its own file for the same mechanical reason as
 * `lib/shopping/action-result.ts`: `actions.ts` carries `"use server"`, and
 * Next.js rejects a module with that directive if it exports anything other
 * than an async function.
 */

export type CoinsActionResult =
  | { ok: true; amount: number; alreadyConverted: boolean }
  | { ok: false; message: string };
