import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { readSession } from "./session";
import { findUserById, toPublicUser, type PublicUser } from "./users";

/**
 * The Data Access Layer.
 *
 * Every page, layout and Server Action that needs to know who is signed in
 * asks here — never by reading the cookie directly. Centralising it means the
 * authorisation check sits next to the data access it guards, so a new page
 * cannot accidentally skip it by forgetting a `proxy.ts` matcher entry.
 *
 * `proxy.ts` also redirects unauthenticated visitors, but that is only a fast
 * first pass: it trusts the cookie's signature without checking the session
 * still exists. These functions are the real boundary, because they read the
 * session document from the database on every call.
 *
 * `cache()` memoises per render pass, so a layout and three components can all
 * call `getCurrentUser()` and only one query is issued.
 */

/** The signed-in user, or `null`. Never throws, never redirects. */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const user = await findUserById(session.userId.toHexString());
  if (!user) return null;

  return toPublicUser(user);
});

/**
 * The signed-in user, or a redirect out of the app.
 *
 * Use this at the top of any protected page. `redirect()` throws a control-flow
 * exception, so nothing after the call runs and no protected markup can leak.
 *
 * It redirects to `/signed-out` rather than straight to `/login`, because the
 * request may be carrying a validly-signed cookie whose session no longer
 * exists. `proxy.ts` trusts that signature and would bounce it back off
 * `/login`, looping forever. `/signed-out` deletes the cookie first — a Server
 * Component cannot write cookies mid-render, but a Route Handler can. See
 * `src/app/signed-out/route.ts`.
 */
export const requireUser = cache(async (): Promise<PublicUser> => {
  const user = await getCurrentUser();
  if (!user) redirect("/signed-out");
  return user;
});
