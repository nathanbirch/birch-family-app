import type { ReactNode } from "react";

import { BottomNav, BottomNavSpacer } from "@/components/nav/BottomNav";
import { PageBackground } from "@/components/PageBackground";
import { requireUser } from "@/lib/auth/dal";

/**
 * The shell every signed-in page renders inside.
 *
 * `(app)` is a route group: the parentheses keep it out of the URL, so the
 * page at `(app)/page.tsx` is served at `/`, not `/app`. It exists purely to
 * give the authenticated pages a shared layout that `/login` does not get.
 *
 * `requireUser()` runs here, before any child page renders, so no protected
 * markup can be produced for a signed-out visitor. `proxy.ts` will usually
 * have redirected them already, but this is the check that actually hits the
 * database and therefore the one that catches a revoked or deleted session.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await requireUser();

  return (
    <>
      {/*
        There used to be a `<LastPageMemory />` here, which reopened the app on
        whichever page it was last on. It is gone, and the app now always
        *launches* on the dashboard.

        Nothing replaced it, because nothing had to. The PWA's `start_url` is
        `/`, so a cold launch from the home-screen icon lands on the dashboard
        by itself — and an app that was merely *backgrounded* is not launched
        at all: iOS and Android hand the same document back, still on the same
        page, with no reload and no code involved. The old component was the
        only thing standing between those two behaviours and what the family
        actually wanted.
      */}
      <PageBackground />
      <div className="flex min-h-full w-full flex-1 flex-col">
        {children}
        <BottomNavSpacer />
      </div>
      <BottomNav />
    </>
  );
}
