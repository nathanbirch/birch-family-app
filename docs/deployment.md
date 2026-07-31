# Deployment

## Where this app lives

| | |
|---|---|
| **Repository** | <https://github.com/nathanbirch/birch-family-app> |
| **GitHub owner** | `nathanbirch` |
| **Branch deployed** | `main` |
| **Host** | Vercel |
| **Live URL** | _fill this in once the Vercel project exists_ |
| **Database** | MongoDB Atlas — see [Database](database.md) |

> **Update the Live URL row above** the moment the Vercel project is created,
> and the matching row in the [README](../README.md). Future-you will look for
> it in exactly these two places.

---

## Why not GitHub Pages any more

This app used to be a **static export** (`output: "export"` in
`next.config.ts`) published to GitHub Pages at `seating.nathanbirch.one`, built
by `.github/workflows/deploy.yml`. All three of those are now deleted.

The reason is not preference, it is arithmetic. GitHub Pages serves files. It
has no process that runs when a request arrives. A login needs one:

- comparing a submitted password against a bcrypt hash is *server* work — doing
  it in the browser would mean shipping the hash to the browser,
- a session cookie has to be set with `HttpOnly`, which only a server can do,
- the MongoDB connection string cannot be in client-side JavaScript.

So the moment the app grew a login, static hosting stopped being an option.
Nothing about the seating rotation itself required the change.

---

## First-time Vercel setup

1. **Import the repo.** <https://vercel.com/new> → import
   `nathanbirch/birch-family-app`. Vercel detects Next.js; accept every default.
   Do not set an "Output Directory" — that is a static-export concept and will
   break the build.

2. **Add the environment variables.** Project → Settings → Environment
   Variables. Add both, ticked for **Production**, **Preview** and
   **Development**:

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | the Atlas connection string from your local `.env` |
   | `SESSION_SECRET` | the same value as your local `.env`, or a fresh one |

   If `SESSION_SECRET` differs from your local value, that is fine — it just
   means a session created locally is not valid on the deployed site.

3. **Open Atlas to Vercel.** Vercel's outbound IP addresses are not fixed, so
   there is no specific address to allowlist. In Atlas → Network Access, add
   `0.0.0.0/0`. See [Database](database.md#the-allowlist) for what this does and
   does not expose.

4. **Deploy**, then **seed** — the deployed app cannot log anyone in until the
   user exists. Run the seed from your own machine; it writes to the same
   cluster:

   ```bash
   npm run db:seed
   ```

5. **Add the domain** (optional). Project → Settings → Domains. If you reuse
   `seating.nathanbirch.one`, first remove the GitHub Pages DNS records, then
   point it at Vercel as instructed. A fresh subdomain such as
   `family.nathanbirch.one` avoids the stale-cache confusion entirely.

6. **Record the URL** in this file and the README.

---

## How deploys work

Vercel builds every push to `main` and promotes it to production. Pull requests
get their own preview URL. There is no GitHub Actions workflow any more —
Vercel's own build runs `npm run build`.

`npm run build` does **not** run the tests. Run `npm run check` before pushing,
or add a `vercel.json` build command of
`npm run check && npm run build` if you would rather the deploy refuse to ship
a red build — which is what the old Pages workflow did.

---

## Environment variables

Both are required. The app throws a deliberately explicit error naming the
missing variable rather than failing obscurely.

| Variable | Used by | Effect if wrong |
|---|---|---|
| `MONGODB_URI` | `src/lib/db.ts` | Nobody can sign in; pages show a database error. |
| `SESSION_SECRET` | `src/lib/auth/session-token.ts` | Every existing session is invalidated — everyone is signed out. |

Neither is prefixed `NEXT_PUBLIC_`, so neither is ever sent to the browser.
Never add that prefix to either of them.

---

## Running the production build locally

```bash
npm run build
npm start          # http://localhost:3000
```

This is also the only way to test PWA and offline behaviour, since the service
worker is deliberately not registered by `npm run dev`. See
[PWA and offline](pwa-and-offline.md).

---

## Troubleshooting a deploy

**Build fails with a type error in `.next/types/`.** Stale generated types from
a route that has been deleted or moved. `rm -rf .next` and rebuild.

**Deployed site shows a database error on every page.** Almost always the Atlas
allowlist — Vercel's IP is not `0.0.0.0/0`-covered, or the entry was added to
the wrong Atlas project. See [Database](database.md).

**Signed out constantly after a deploy.** `SESSION_SECRET` differs between
environments, or was regenerated. Set one value and keep it.

**"Failed to find Server Action".** A browser tab still running the previous
build posted to an action ID that no longer exists. Reloading fixes it; it
only happens right after a deploy.
