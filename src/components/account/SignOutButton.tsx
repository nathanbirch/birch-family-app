"use client";

import { useFormStatus } from "react-dom";

import { logout } from "@/lib/auth/actions";

/**
 * Sign out.
 *
 * A real `<form>` posting to a Server Action rather than an `onClick` fetch,
 * so it still works if the JavaScript has not loaded yet — and so the session
 * is destroyed on the server, which is the only place it can actually be
 * revoked.
 */
export function SignOutButton() {
  return (
    <form action={logout}>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  // `useFormStatus` reads the pending state of the enclosing form, which is
  // why this is a separate component — the hook returns nothing useful when
  // called from the component that renders the <form> itself.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="app-card themed-transition w-full p-5 text-center text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
      style={{ color: "var(--color-primary)" }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
