/**
 * What the shop's Server Actions answer with.
 *
 * In its own file for the same mechanical reason as
 * `lib/shopping/action-result.ts` — `actions.ts` and `admin-actions.ts` both
 * carry `"use server"`, which rejects a module that exports anything besides
 * an async function.
 */

export type RedeemActionResult =
  | { ok: true; status: "completed" | "pending" }
  | { ok: false; message: string };

export type ContributeActionResult =
  | { ok: true; total: number; target: number; justFunded: boolean }
  | { ok: false; message: string };

export type RewardAdminActionResult =
  | { ok: true }
  | { ok: false; message: string };
