"use client";

import { APP_NAME } from "@/config/app";

/**
 * Last-resort fallback.
 *
 * Configuration mistakes (an unknown person id, a malformed start date) throw
 * loudly in development so they are caught immediately. In production the
 * family should still see something friendly and actionable rather than a
 * blank white screen.
 *
 * Since the app grew a database, by far the most likely thing to land here is
 * MongoDB being unreachable — an Atlas free-tier cluster that has paused itself
 * after 60 days idle, or an IP that is not on the Network Access allowlist. The
 * copy below hints at that without asking the family to care about it, and the
 * development-only detail at the bottom names it outright.
 *
 * Next.js strips server error messages in production before they reach this
 * component, so there is no reliable way to branch on the cause here. Anything
 * more specific has to be handled where the error is thrown.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {APP_NAME} hit a snag
      </h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        That page could not be loaded just now. Trying again usually sorts it —
        if it keeps happening, the app probably cannot reach its database.
      </p>
      <button
        type="button"
        onClick={reset}
        className="min-h-11 rounded-full px-5 text-sm font-semibold"
        style={{
          backgroundColor: "var(--color-primary)",
          color: "var(--color-on-primary)",
        }}
      >
        Try again
      </button>
      {process.env.NODE_ENV !== "production" ? (
        <pre className="mt-4 max-w-full overflow-x-auto whitespace-pre-wrap rounded-xl p-4 text-left text-xs"
          style={{
            backgroundColor: "var(--color-surface-muted)",
            border: "1px solid var(--color-border)",
          }}
        >
          {error.message}
        </pre>
      ) : null}
    </main>
  );
}
