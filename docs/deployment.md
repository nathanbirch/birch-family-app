# Deployment

## Where this app lives

| | |
|---|---|
| **Live URL** | <https://family.nathanbirch.one> |
| **Repository** | <https://github.com/nathanbirch/birch-family-app> |
| **GitHub owner** | `nathanbirch` |
| **Branch deployed** | `main` — every push builds and goes straight to production |
| **Host** | Vercel |
| **Vercel scope** | `nathanbirchs-projects` (your personal team) |
| **Vercel project** | `birch-family-app` |
| **Vercel account** | `nathantbirch@gmail.com`, signed in **with GitHub** |
| **Registrar** | Squarespace Domains — holds `nathanbirch.one` |
| **DNS records** | **Netlify**, not Squarespace, not Vercel — see [DNS](#dns-lives-at-netlify) |
| **Database** | MongoDB Atlas — see [Database](database.md) |

---

## The three links you actually need

Bookmark these. Everything else in the Vercel dashboard is noise for a project
this size.

| What | Where |
|---|---|
| Deploys, build logs, rollbacks | <https://vercel.com/nathanbirchs-projects/birch-family-app> |
| **Domains** | <https://vercel.com/nathanbirchs-projects/birch-family-app/settings/domains> |
| Environment variables | <https://vercel.com/nathanbirchs-projects/birch-family-app/settings/environment-variables> |

### Signing in to Vercel

**Use the "Continue with GitHub" button, not an email and password.** The
account is `nathantbirch@gmail.com`, and it exists only as a GitHub identity —
there is no Vercel password to remember, and trying to reset one will send you
in a circle. If GitHub lets you in and Vercel does not show the project, check
you are in the **`nathanbirchs-projects`** scope using the team switcher at the
top left, rather than a different team.

---

## The domain

`family.nathanbirch.one` → this Vercel project. Set up 2026-08-04.

### DNS lives at Netlify

This is the part that will confuse you later, so read it slowly. Three
different companies each own one piece:

| Piece | Who | What you do there |
|---|---|---|
| **Registration** | Squarespace Domains | Renew the domain. Nothing else. |
| **DNS records** | **Netlify** (`dns1–4.p01.nsone.net`) | Add, edit and delete records. |
| **The site itself** | Vercel | Attach the domain, get the certificate. |

Squarespace is only the registrar; its nameservers point at Netlify, so the
Squarespace DNS panel is empty and editing it does nothing. **To change a DNS
record, go to <https://app.netlify.com> → Domains (the top-level nav, not a
site's settings) → `nathanbirch.one`.**

Confirm the chain any time with:

```bash
whois nathanbirch.one | grep -i "registrar:\|name server"   # Squarespace, nsone.net
dig +short CNAME family.nathanbirch.one                     # *.vercel-dns-017.com
```

### The live record

```
CNAME   family.nathanbirch.one   →   <hash>.vercel-dns-017.com
```

The target is generated per-domain by Vercel — read the current one off the
[Domains page](https://vercel.com/nathanbirchs-projects/birch-family-app/settings/domains)
rather than copying the value out of this file. Vercel issues and renews the
TLS certificate automatically once the record resolves; there is nothing to
install and nothing that expires.

**Do not touch the apex `nathanbirch.one` A records.** They point at a
different site of yours, on AWS, that has nothing to do with this app.

### Adding another domain later

1. Vercel → Domains → add the hostname. It will show you the record it wants.
2. Netlify → Domains → `nathanbirch.one` → add that record.
3. Wait for Vercel to go green; the certificate follows on its own.

---

## What was cleaned up

`seating.nathanbirch.one` — the old GitHub Pages address — was deliberately
dismantled on 2026-08-04, so there is no half-live copy of this app anywhere:

- its `CNAME` record was deleted from Netlify DNS (it no longer resolves),
- GitHub Pages was switched off for the repo and the custom domain released,
- the build workflow and `public/CNAME` were already gone from the repo.

An old bookmark to it is dead, and that is intentional.

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
   | `CALENDAR_ICS_URL` | optional — the calendar's secret iCal address |

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

The first two are required, and the app throws a deliberately explicit error
naming the missing variable rather than failing obscurely.

| Variable | Required | Used by | Effect if wrong |
|---|---|---|---|
| `MONGODB_URI` | yes | `src/lib/db.ts` | Nobody can sign in; pages show a database error. |
| `SESSION_SECRET` | yes | `src/lib/auth/session-token.ts` | Every existing session is invalidated — everyone is signed out. |
| `CALENDAR_ICS_URL` | no | `src/lib/calendar/feed.ts` | Unset: the Calendar page explains how to connect one. Wrong: it names the failure. |

None is prefixed `NEXT_PUBLIC_`, so none is ever sent to the browser. **Never
add that prefix to any of them** — `CALENDAR_ICS_URL` especially, since it is a
bearer credential for the whole calendar. See [Calendar](calendar.md).

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
