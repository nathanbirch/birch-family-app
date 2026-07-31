"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { login } from "@/lib/auth/actions";
import { EMPTY_LOGIN_STATE } from "@/lib/auth/login-state";

/**
 * Email and password.
 *
 * `useActionState` wires the form to the `login` Server Action and gives back
 * whatever the action returned — here, an error message and the email to put
 * back in the field so a failed attempt does not make you retype it.
 *
 * Mobile keyboard hints matter more than they look:
 *
 * - `autoComplete` lets a password manager fill both fields.
 * - `autoCapitalize="none"` and `autoCorrect="off"` stop phones from
 *   "helpfully" capitalising or autocorrecting a username into something else.
 * - The inputs are 16px (`text-base`); anything smaller makes iOS Safari zoom
 *   in when the field is focused, which is jarring and hard to undo.
 */
export function LoginForm() {
  const [state, formAction] = useActionState(login, EMPTY_LOGIN_STATE);

  return (
    <form action={formAction} className="app-card flex flex-col gap-4 p-6">
      {/*
        `aria-live` so a screen reader announces the failure, which it would
        otherwise miss — the page does not navigate on a bad password.
      */}
      <div aria-live="polite">
        {state.error ? (
          <p
            className="rounded-xl px-3 py-2.5 text-sm font-semibold"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-primary) 12%, transparent)",
              color: "var(--color-primary)",
            }}
          >
            {state.error}
          </p>
        ) : null}
      </div>

      <Field
        id="email"
        name="email"
        label="Email"
        type="text"
        defaultValue={state.email}
        autoComplete="username"
      />

      <Field
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
      />

      <SubmitButton />
    </form>
  );
}

function Field({
  id,
  name,
  label,
  type,
  defaultValue,
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  type: "text" | "password";
  defaultValue?: string;
  autoComplete: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="themed-transition w-full rounded-xl px-3.5 py-3 text-base outline-none"
        style={{
          backgroundColor: "var(--color-surface-muted)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
        }}
      />
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="themed-transition mt-1 min-h-[3rem] w-full rounded-xl text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-70"
      style={{
        backgroundColor: "var(--color-primary)",
        color: "var(--color-on-primary)",
      }}
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
