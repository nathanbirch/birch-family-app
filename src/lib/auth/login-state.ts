/**
 * The shape of the login form's state.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT IN `actions.ts`
 * ---------------------------------------------------------------------------
 * A module marked `"use server"` may export **async functions and nothing
 * else**. Every export becomes a callable server endpoint, so there is no
 * meaning for a plain object; Next.js rejects the whole module:
 *
 *     A "use server" file can only export async functions, found object.
 *
 * The failure is total rather than partial — `login` itself stops working too,
 * and every submission throws — so a single stray constant takes the entire
 * sign-in flow down with it. Keeping the constant here makes that impossible.
 *
 * Types are erased before the rule is applied, so `LoginState` could live in
 * `actions.ts`; it sits beside its constant instead.
 */

export type LoginState = {
  /** Shown above the form. Deliberately vague — see `actions.ts`. */
  error?: string;
  /** Preserved so a failed attempt does not clear the email field. */
  email?: string;
};

export const EMPTY_LOGIN_STATE: LoginState = {};
