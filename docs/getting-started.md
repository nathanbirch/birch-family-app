# Getting started

Requires **Node 20 or newer** (22 recommended), and access to the MongoDB Atlas
cluster.

```bash
npm install
cp .env.example .env    # then paste in the real values
npm run db:seed         # creates indexes + the first login account
npm run dev             # http://localhost:3000
```

Sign in with **`birchfam` / `birchfam`**.

## Setting up `.env`

Two variables, both required, neither ever sent to the browser:

| Variable | Where to get it |
|---|---|
| `MONGODB_URI` | Atlas → Cluster → Connect → Drivers. Or copy from Vercel's env settings. |
| `SESSION_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

`.env` is gitignored. `.env.example` is committed as the template.

> **If anything database-related fails**, run `npm run db:check` before
> debugging anything else. Connection failures here have several very different
> causes — a blocked port, an unallowlisted IP, a paused cluster, bad
> credentials — and the driver reports most of them identically. The check
> works through the layers and names the actual cause.

## Every script

| Script | What it does |
|---|---|
| `npm run dev` | Development server. Fast refresh; the service worker is deliberately **not** registered here. |
| `npm run build` | Production build. Also runs a full TypeScript check. |
| `npm start` | Serves the production build. Use this to test PWA and offline behaviour. |
| `npm run db:check` | Diagnoses the database connection layer by layer (DNS → TCP → TLS → MongoDB) and names the cause. Start here when anything database-related misbehaves. |
| `npm run db:seed` | Creates the indexes and the first login account. Safe to re-run; never overwrites an existing account. |
| `npm run lint` | ESLint, using `eslint-config-next`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | The whole test suite, once. |
| `npm run test:watch` | Tests in watch mode while you work. |
| `npm run test:coverage` | Tests plus a coverage report. |
| `npm run check` | `typecheck` → `lint` → `test`. Run this before you commit. |
| `npm run schedule:generate` | Development only. Searches every possible five-week schedule and prints the best, with fairness statistics. |
| `npm run icons:generate` | Development only. Rebuilds every icon from `assets/icon-master.png`. |
| `npm run avatars:generate` | Development only. Resizes and content-hashes the avatars from `assets/avatars/`, and rewrites `src/config/avatar-manifest.ts`. |
| `npm run cache:clear` | Clears Next's optimised-image cache. Run this after replacing a photo that keeps its filename, then restart. |

## Things that will confuse you

**The service worker is not registered in dev,** so **offline behaviour cannot
be tested with `npm run dev`**. That is on purpose — a cache sitting in front of
the dev server's constantly-changing assets causes nothing but confusion. To
test offline:

```bash
npm run build && npm start
```

then use DevTools → Network → **Offline** and reload.

**Stale route types.** If `npm run typecheck` complains about a module under
`.next/types/` that does not exist, it is holding onto a route you moved or
deleted. `rm -rf .next` and re-run.

**A paused cluster.** Atlas free-tier clusters pause themselves after 60 days
idle. If this project has been sitting untouched, resume it in Atlas first.

## Project layout

```
docs/          you are here
assets/        BUILD INPUTS — hand-made masters, never served
  icon-master.png
  avatars/     the full-size photographs
public/        SERVED AS-IS — most of it generated from assets/
  avatars/     resized, content-hashed (generated)
  scenes/      the dinner table and Expedition photographs
  icons/       generated PWA icons
  sw.js        the offline service worker
scripts/       development-only utilities, plus the database seed
  lib/png.mjs  the shared PNG codec both asset scripts use
src/
  app/
    login/       the one page reachable signed out
    (app)/       every protected page — dashboard, seating, account
  components/  everything rendered
  config/      all the data: family, seats, rotation, themes, navigation, db
  hooks/       the client-side hooks
  lib/
    auth/        sessions, users, passwords, the data access layer
    db.ts        the shared MongoDB client
    …            pure logic: dates, rotation, storage
  proxy.ts     runs before every request (Next 16's renamed middleware)
tests/         the test suite
```

See [Architecture](architecture.md) for what lives where and why.
