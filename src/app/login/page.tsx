import type { Metadata } from "next";

import { AppMark } from "@/components/AppMark";
import { LoginForm } from "@/components/auth/LoginForm";
import { PageBackground } from "@/components/PageBackground";
import { APP_NAME } from "@/config/app";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * The only page reachable signed out.
 *
 * It sits outside the `(app)` route group on purpose, so it gets neither the
 * bottom navigation bar nor the `requireUser()` check — there is nowhere to
 * navigate to yet, and requiring a user here would be a redirect loop.
 */
export default function LoginPage() {
  return (
    <>
      <PageBackground />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-10">
        <div className="animate-soft-rise">
          <header className="mb-7 flex flex-col items-center text-center">
            <AppMark size={72} />
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
              {APP_NAME}
            </h1>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Sign in to carry on.
            </p>
          </header>

          <LoginForm />
        </div>
      </main>
    </>
  );
}

