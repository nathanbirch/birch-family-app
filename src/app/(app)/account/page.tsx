import type { Metadata } from "next";

import { SignOutButton } from "@/components/account/SignOutButton";
import { ThemePicker } from "@/components/ThemePicker";
import { APP_DESCRIPTION, APP_NAME } from "@/config/app";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Account",
};

/**
 * Who is signed in, the theme control, and the way out.
 *
 * The theme picker used to live in the seating page's header. It moved here
 * because it is an app-wide preference, not a seating one, and the header of
 * every future page should not have to carry it.
 */
export default async function AccountPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <h1 className="animate-soft-fade mb-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
        Account
      </h1>

      <div className="animate-soft-rise flex flex-col gap-3">
        <section className="app-card p-5">
          <h2
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            Signed in as
          </h2>
          <p className="mt-2 text-lg font-bold tracking-tight">
            {user.displayName}
          </p>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {user.email}
          </p>
        </section>

        <section className="app-card flex items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight">Theme</h2>
            <p
              className="mt-0.5 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              Saved on this device only.
            </p>
          </div>
          <ThemePicker />
        </section>

        <section className="app-card p-5">
          <h2 className="text-base font-bold tracking-tight">{APP_NAME}</h2>
          <p
            className="mt-0.5 text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            {APP_DESCRIPTION}
          </p>
        </section>

        <SignOutButton />
      </div>
    </main>
  );
}
