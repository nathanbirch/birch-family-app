# Authentication

A single shared login, self-contained: no Auth0, no NextAuth, no third party.
Email and password, bcrypt hashes and session documents in MongoDB.

**Seeded account: `birchfam` / `birchfam`.**

> That password is trivial on purpose — this is a family app behind a URL
> nobody else has. It is a reasonable trade *today*, and a bad one the moment
> the app holds anything you would mind a stranger reading. Changing it is two
> minutes of work; see [below](#changing-the-password).

---

## The shape of it

```
  Browser                    Server                      MongoDB
  ───────                    ──────                      ───────
  login form
      │  POST (Server Action)
      ├───────────────────────►  login()
      │                            │  find user by email
      │                            ├──────────────────────►  users
      │                            │  bcrypt.compare
      │                            │  create session doc
      │                            ├──────────────────────►  sessions
      │  Set-Cookie: signed JWT    │
      ◄────────────────────────────┤
      │                            │
  later requests
      │  Cookie: birch_session_v1  │
      ├───────────────────────►  proxy.ts    (verify signature only — fast)
      │                          requireUser() (load session doc — authoritative)
      │                            ├──────────────────────►  sessions, users
```

### The cookie is a pointer, not the session

The cookie holds a signed JWT whose entire payload is a session id. The session
itself is a document in MongoDB.

That indirection is the point: **deleting the session document signs that
device out immediately**. A self-contained JWT — one carrying the user id and
role directly — stays valid in the user's browser until it expires, no matter
what the server wants, because there is nothing to revoke. Signing out, or
kicking a lost phone off the app, would be impossible.

The signature stops anyone forging a pointer to somebody else's session.

Cookie settings (`src/lib/auth/session.ts`):

| Setting | Value | Why |
|---|---|---|
| `httpOnly` | `true` | No script on the page can read it, so an XSS bug cannot steal the session. |
| `secure` | `true` in production | HTTPS only. Off locally, where there is no TLS. |
| `sameSite` | `lax` | Not sent on cross-site POSTs, which blocks CSRF, while normal link navigation still works. |
| `expires` | 30 days | Long, because this is a phone app you should not have to keep signing into. |
| `path` | `/` | |

---

## Two checks, doing different jobs

**`src/proxy.ts`** — what earlier Next.js versions called *middleware*, renamed
in Next.js 16. Runs before every matched request. It verifies the cookie's
signature and redirects: signed-out visitors to `/login`, signed-in visitors
away from `/login`.

It deliberately **does not touch MongoDB**. Proxy runs on every request
including prefetches, so a query here would be paid many times over for every
page a user merely hovers, and every navigation would be as slow as the
cluster.

**`requireUser()` in `src/lib/auth/dal.ts`** — the real boundary. Every
protected page and layout calls it. It loads the session document *and* the
user from the database, so a cookie pointing at a revoked or deleted session
gets past the proxy and is stopped here.

This division is deliberate: the proxy is a fast, fallible convenience; the DAL
is the authority. Never move a security decision into the proxy.

### The redirect loop the two checks can cause

Because the two checks can *disagree*, they once deadlocked. A cookie whose
session has been revoked — deleted from `sessions`, or expired and swept by the
TTL index — is still perfectly signed, so:

1. `GET /turns` — proxy sees a valid signature, lets it through
2. `requireUser()` — no session document, redirects to `/login`
3. `GET /login` — proxy sees a valid signature, redirects to `/`
4. `GET /` — `requireUser()` redirects to `/login` … forever

The browser gives up with `ERR_TOO_MANY_REDIRECTS`, and the app stays unusable
until the cookie is cleared by hand.

Breaking the loop requires deleting the stale cookie, and a Server Component
cannot write cookies during a render — which is exactly where `requireUser()`
runs. A **Route Handler** can. So `requireUser()` redirects to
[`/signed-out`](../src/app/signed-out/route.ts), which deletes the cookie and
forwards to `/login`, leaving the proxy nothing to trust.

`proxy.ts` allows `/signed-out` unconditionally via `ALWAYS_ALLOW`. Without
that it would bounce away the very request that fixes the problem.

> Anything else that redirects on a failed session check must go to
> `/signed-out`, not `/login`, or it reintroduces the loop.

`requireUser()` is wrapped in React's `cache()`, so a layout and three
components calling it in one render issue a single query.

### Where the check lives

`src/app/(app)/layout.tsx` calls `await requireUser()`. `(app)` is a *route
group* — the parentheses keep it out of the URL, so `(app)/page.tsx` serves
`/`, not `/app`. Every page inside the group inherits the check, so a new page
is protected by where you put the file rather than by remembering to add it to
a list.

`/login` sits outside the group and gets neither the check nor the tab bar.

---

## Password handling

In `src/lib/auth/passwords.ts`, deliberately separate from the database code so
it can be unit-tested directly.

- **bcrypt, cost factor 12** (~250ms per hash). Each +1 doubles the work.
- **Salted per hash.** Two people with the same password get different hashes,
  so a stolen database cannot be attacked with a precomputed rainbow table.
- **72-byte limit.** bcrypt reads only the first 72 bytes and silently ignores
  the rest, so the login form rejects longer passwords rather than quietly
  truncating them. `tests/passwords.test.ts` demonstrates the truncation to
  show the limit is real.

### Unknown emails cost the same as known ones

`authenticate()` runs a bcrypt comparison against a decoy hash when the email
does not exist. Without it, a failed login for an unregistered address would
return in about a millisecond while a real one took 250ms — and that difference
alone reveals which addresses have accounts.

For the same reason, the error message is identical for "no such user" and
"wrong password": *"That email and password do not match."*

A genuine database outage gets its own distinct message, because telling
someone their password is wrong when the cluster is simply unreachable sends
them chasing the wrong problem.

---

## Changing the password

There is no "change password" screen. Two options:

**Replace the seeded account.** Edit `SEED_USER` in
[`scripts/seed-database.ts`](../scripts/seed-database.ts), delete the existing
user, then re-seed:

```js
// in mongosh, or Atlas → Browse Collections
db.users.deleteOne({ email: "birchfam" })
```

```bash
npm run db:seed
```

**Or update the hash directly:**

```bash
node -e "console.log(require('bcryptjs').hashSync('YOUR-NEW-PASSWORD', 12))"
```

then set that string as `passwordHash` on the user document in Atlas.

Existing sessions survive a password change — they point at session documents,
not at the password. To force everyone out, empty the `sessions` collection or
change `SESSION_SECRET`.

---

## Adding another person

`createUserIfAbsent()` in `src/lib/auth/users.ts` does the work. The quickest
route is to extend the seed script to loop over several accounts rather than
one, and re-run it.

There is intentionally **no signup page**. Anything reachable at a public URL
that creates accounts is a door into a private family app, and this app does
not need one.

If you add real per-person accounts, revisit two things: `displayName` is
currently shown as the dashboard greeting, and nothing in the app yet
distinguishes a parent from a child.

---

## What is not here

Worth knowing before you rely on this for anything sensitive:

- **No rate limiting.** Nothing slows down repeated login attempts. bcrypt at
  cost 12 makes brute force expensive, not impossible.
- **No password reset**, no email verification, no 2FA.
- **No roles or permissions.** Anyone signed in sees everything.
- **No audit log.** `sessions.createdAt` is the only record that anyone signed
  in.
- **No CSRF token** beyond `SameSite=Lax` and the `Origin` check Next.js
  performs on every Server Action.
- **Nothing in `public/` is behind the login.** The proxy skips any path with a
  file extension, so `/avatars/hannah.png` is fetchable by anyone who knows the
  URL — as are the scene photographs and the icons. **This includes photographs
  of the children.**

  It has to be that way as things stand: `next/image` optimises images by
  fetching them server-side without the user's cookie, so gating them makes the
  optimiser fail and every avatar renders as a blank circle. That is exactly
  the bug that produced the coloured-circle regression.

  If those photographs should genuinely be private, the fix is to serve them
  from a Route Handler that calls `verifySession()` and to stop routing them
  through `next/image` — the browser sends its cookie, so a plain `<img>`
  works. That is a real change, not a config flag, and it has not been made.

All of these are reasonable omissions for one shared family login. All of them
become worth revisiting if the app ever holds more than a seating chart.

---

## Files

| File | Role |
|---|---|
| `src/proxy.ts` | Fast optimistic redirects. No database. |
| `src/lib/auth/dal.ts` | `getCurrentUser()`, `requireUser()` — the real boundary. |
| `src/lib/auth/actions.ts` | `login()` / `logout()` Server Actions. **Async functions only** — see below. |
| `src/lib/auth/login-state.ts` | The form-state type and its empty value, kept out of the `"use server"` module. |
| `src/app/signed-out/route.ts` | Clears a stale cookie, breaking the redirect loop. |
| `src/lib/auth/session.ts` | Session documents and the cookie. |
| `src/lib/auth/session-token.ts` | JWT signing and verification only, so the proxy stays light. |
| `src/lib/auth/users.ts` | User lookups, `authenticate()`. |
| `src/lib/auth/passwords.ts` | bcrypt hashing, testable in isolation. |
| `src/app/login/page.tsx` | The one page reachable signed out. |
| `src/components/auth/LoginForm.tsx` | The form, `useActionState`. |

## A `"use server"` module may export only async functions

Worth stating loudly, because breaking this rule breaks sign-in **completely**
and nothing in the toolchain warns you.

`"use server"` turns every export into a callable server endpoint, so a plain
constant has no meaning. Next.js rejects the whole module:

```
A "use server" file can only export async functions, found object.
```

`actions.ts` briefly exported a two-line `EMPTY_LOGIN_STATE` constant next to
`login()`. The result was that *every* sign-in attempt — right credentials,
wrong credentials, empty form — threw and hit the error boundary. Not the
constant: the entire module, `login()` included.

Three layers all missed it, which is why the rule is now tested:

- `tsc` is happy — it is a framework convention, not a type error.
- `next build` passes — `/login` prerenders fine, and the action module is only
  evaluated when someone actually submits the form.
- The unit tests pass — Vitest imports the module directly and never applies
  the `"use server"` transform.

`tests/use-server.test.ts` reads the source and fails if a non-function export
appears in any `"use server"` module. Crude, but it is the only layer where the
mistake is visible short of clicking the button.
