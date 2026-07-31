"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { describeConnectionError } from "@/lib/db";

import type { LoginState } from "./login-state";
import { createSession, destroySession } from "./session";
import { authenticate } from "./users";

/**
 * Server Actions for signing in and out.
 *
 * These are POST endpoints reachable by anyone who can reach the site, whether
 * or not they went through the form — so every check lives *inside* the
 * action. Rendering the form only on the login page is not a security boundary.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE MAY ONLY EXPORT ASYNC FUNCTIONS
 * ---------------------------------------------------------------------------
 * `"use server"` turns every export into a callable endpoint, so exporting
 * anything else — a constant, an object, a class — makes Next.js reject the
 * whole module and take `login` down with it. `EMPTY_LOGIN_STATE` lives in
 * `login-state.ts` for exactly that reason, and `tests/use-server.test.ts`
 * fails if a non-function export creeps back in.
 */

const LoginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email.")
    .max(200, "That email is too long."),
  password: z
    .string()
    .min(1, "Enter your password.")
    // bcrypt only looks at the first 72 bytes; rejecting longer input avoids
    // silently ignoring the tail, and caps the work an attacker can ask for.
    .max(72, "Passwords are at most 72 characters."),
});

/**
 * Signs in and redirects to the dashboard.
 *
 * The failure message is the same whether the email is unknown or the password
 * is wrong. Distinguishing them would let anyone probe which email addresses
 * have accounts on this app.
 */
export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  /*
   * `formData.get()` returns `null` for a field that was not submitted at all,
   * and `File` for a file upload. Both are coerced to a string here so the
   * schema's own messages ("Enter your email.") are what the user sees —
   * otherwise zod reports a type mismatch and the browser shows raw validator
   * text like "expected string, received null".
   *
   * The browser form marks both fields `required`, but a Server Action is a
   * plain POST endpoint that anyone can call directly, so it cannot rely on
   * that.
   */
  const email = readField(formData, "email");
  const password = readField(formData, "password");

  const parsed = LoginSchema.safeParse({ email, password });

  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Check your details.";
    return { error: first, email };
  }

  let user;
  try {
    user = await authenticate(parsed.data.email, parsed.data.password);
  } catch (error) {
    // A database outage is not a credentials problem, and telling the user
    // "wrong password" when the cluster is down sends them down a rabbit hole.
    console.error("[login] database error:", describeConnectionError(error));
    return {
      error: "Could not reach the database. Please try again in a moment.",
      email,
    };
  }

  if (!user) {
    return { error: "That email and password do not match.", email };
  }

  await createSession(user._id);

  // Outside the try/catch: redirect() signals by throwing, and catching it
  // here would turn a successful login into an error message.
  redirect("/");
}

/** A form field as a plain string. Absent fields and files become "". */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Signs out and returns to the login page. */
export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
