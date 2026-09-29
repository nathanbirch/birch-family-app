/**
 * What the Meals page's Server Actions answer with.
 *
 * In its own file for the mechanical reason `lib/shopping/action-result.ts`
 * gives: a `"use server"` module may only export async functions, so a type
 * exported from `actions.ts` would fail the build.
 */

export type MealActionResult = { ok: true } | { ok: false; message: string };

/** The "Add to the shopping list" answer: how many lines went on, and how many were already there. */
export type SendToListResult =
  | { ok: true; added: number; alreadyThere: number; skippedFull: number }
  | { ok: false; message: string };

/** An admin save answers with the id, so a new recipe's editor can stay on it. */
export type MealAdminResult = { ok: true; id: string } | { ok: false; message: string };
