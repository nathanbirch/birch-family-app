import type { ReactNode } from "react";

import { LastPageMemory } from "@/components/LastPageMemory";
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
        Inside `(app)`, so it only ever records signed-in pages — and it sits
        above the content because it renders nothing and has no layout effect.
      */}
      <LastPageMemory />
      <PageBackground />
      <div className="flex min-h-full w-full flex-1 flex-col">
        {children}
        <BottomNavSpacer />
      </div>
      <BottomNav />
    </>
  );
}
