# Birch Family App

A private, installable web app for the Birch family. It sits behind a login and
currently holds the weekly **seating rotation**, the **family mantras** and the
**Healthy Birches** lists — with chore charts, rewards and stars planned.

---

## Project facts

Everything you need to find your way back into this project after months away.

| | |
|---|---|
| **Repository** | <https://github.com/nathanbirch/birch-family-app> |
| **GitHub owner** | `nathanbirch` |
| **Default branch** | `main` |
| **Package name** | `birch-family-app` |
| **Live URL** | <https://family.nathanbirch.one> |
| **Hosting** | Vercel — project [`nathanbirchs-projects/birch-family-app`](https://vercel.com/nathanbirchs-projects/birch-family-app). Previously GitHub Pages; see below. |
| **Vercel login** | `nathantbirch@gmail.com`, **via GitHub** — see [Deployment](docs/deployment.md#signing-in-to-vercel) |
| **Framework** | Next.js 16.2 (App Router) · React 19 · TypeScript · Tailwind 4 |
| **Database** | MongoDB Atlas, `cluster0.pmxixtt.mongodb.net` |
| **Database name** | `birch_family_app` — this app touches nothing else on the cluster |
| **Node version** | 20 or newer (22 recommended) |
| **Secrets** | `.env`, gitignored. Template in `.env.example`. |

> **The app was renamed.** It began life as `seating-rotation` /
> "Birch Family Seats", a static site on GitHub Pages at
> `seating.nathanbirch.one`. When it grew a login it stopped being hostable as
> static files and moved to Vercel. The old Pages workflow and `CNAME` were
> deleted. If an old link is still bookmarked somewhere, that is why it is dead.

> **This repo is private-by-obscurity, not by hardening.** One shared login
> guards it. Do not put anything in here you would mind a stranger reading if
> the URL leaked. See [Authentication](docs/authentication.md).

---

## Quick start

```bash
npm install
cp .env.example .env    # then paste in the real values — see docs/database.md
npm run db:seed         # creates indexes + the first login account
npm run dev             # http://localhost:3000
```

Sign in with **`birchfam` / `birchfam`**.

```bash
npm run check      # typecheck + lint + tests — run before committing
npm run build      # production build
npm start          # serve the production build locally
```

> **First run will fail to connect** unless your current IP is on the Atlas
> Network Access allowlist. The error is a bare TLS failure that says nothing
> about allowlists — [Database](docs/database.md) explains the fix.

---

## What's in it

### Working now

- **Login** — email and password, bcrypt-hashed, sessions in MongoDB. One
  seeded account. No signup page; accounts are created by the seed script.
- **Dashboard** (`/`) — a card per page, plus honest "coming soon" cards for
  the planned features.
- **Seating rotation** (`/turns`) — the original app. Photographs of the real
  dinner table and Ford Expedition with everyone on their actual seat, rotating
  the five children through a balanced five-week schedule.
- **Tonight's pets** (`/turns`, beneath the seats) — Bella and Leia, each
  with tonight's child pinned on them, rotating **nightly** and never landing
  on the same child at once. The one rotation that lives in the database, so it
  can be re-anchored without a deploy. See [Pets](docs/pets.md).
- **Family mantras** (`/mantras`) — the phrases this family says to each other,
  each paired with the verbatim words that gave it to us, attributed and linked.
  A different one on top every morning. See [Mantras](docs/mantras.md).
- **Healthy Birches** (`/health`) — the five lists off the wall at home, one
  picture-card each: body, mind, emotions, spirit, and how to keep the Spirit in
  our home. Tap a card to read the whole list. The words are a transcription of
  the paper and stay that way. See [Healthy Birches](docs/health.md).
- **Star charts** (`/stars`) — the three charts off the fridge — chores,
  summer learning and hygiene — merged into one page per child, with the stars
  tappable. The chores swap every Monday morning between two pairs of children
  — Hannah and Emily, Clara and William — from an anchor stored in the
  database. James's chores stay his. See
  [Star charts](docs/stars.md).
- **Bored?** (`/bored`) — what to do when there is nothing to do. Three
  pictures — Inside, Outside, Money — then a grid of pictures behind each.
  Almost wordless on purpose: the child most likely to be bored is the one
  least able to read their way out of it. The Money list prices jobs in **Dad
  Bucks** (`Đ`). See [The Bored Page](docs/bored.md).
- **Account** (`/account`) — who's signed in, the theme picker, sign out.
- **Bottom tab bar** — Home pinned on the left, then every page on a strip that
  scrolls sideways: Stars · Turns · Calendar · Bored · Ceremony · Healthy ·
  Mantras · Account. Home never scrolls away and is always drawn more strongly
  than the rest; the current page is a filled pill, and the strip slides itself
  so that pill is on screen.
- Ten themes including a dark one. Installable as a PWA.

- **Family-context API** (`/api/family/v1/family-context`) — an
  authenticated, read-only endpoint that lets a private Custom GPT, on the
  family's existing ChatGPT subscription, answer questions about today's chores,
  stars, calendar, rotations and birthdays. **Off unless
  `BIRCH_FAMILY_API_ENABLED=true`.** No OpenAI developer API, no model bill,
  no write path. See [ChatGPT API](docs/family-api/README.md).

### Planned

Weekly celebration report · Rewards.

These are listed in `PLANNED_FEATURES` in
[`src/config/navigation.ts`](src/config/navigation.ts) and rendered on the
dashboard, so the app itself is the roadmap. Delete an entry as you build it.

---

## Documentation

Everything lives in **[`docs/`](docs/README.md)**:

| Doc | What's in it |
|---|---|
| [Getting started](docs/getting-started.md) | Install, run, test, build. Every npm script. |
| [Deployment](docs/deployment.md) | Vercel setup, env vars, domains, the GitHub Pages history. |
| [Mantras](docs/mantras.md) | The family mantras, the quoting rule, and the mantra of the day. |
| [Star charts](docs/stars.md) | The three charts, the weekly chore swap, and how a star is stored. |
| [Healthy Birches](docs/health.md) | The five lists off the wall, the transcription rule, and the drawings. |
| [Database](docs/database.md) | MongoDB, collections, seeding, the Atlas allowlist trap. |
| [Authentication](docs/authentication.md) | How login works, changing the password, adding people. |
| [Architecture](docs/architecture.md) | Routes, layout, what runs where, how data flows. |
| [Family and seats](docs/family-and-seats.md) | People, avatars, photos, seat coordinates, the parent swap. |
| [Rotation](docs/rotation.md) | Start date, the schedule, why it isn't a simple rotation, fairness numbers. |
| [Themes](docs/themes.md) | All ten themes, tokens, persistence, the no-flash script. |
| [Animation](docs/animation.md) | The three-second arrival and the swap glide. |
| [PWA and offline](docs/pwa-and-offline.md) | Installing, the service worker, icons. |
| [Accessibility](docs/accessibility.md) | What's been done and what it guarantees. |
| [Testing](docs/testing.md) | What each test file covers, and current coverage. |
| [Maintenance](docs/maintenance.md) | Recipes for common changes, plus troubleshooting. |
| [The Bored Page](docs/bored.md) | Three pictures for a bored child, and the Dad Bucks price list. |
| [Decisions](docs/decisions.md) | The non-obvious calls and why. |
| [Family-context API](docs/family-api/README.md) | The read-only endpoint the private Birch Family Custom GPT calls. Off by default. |

---

## The most common change

Almost everything you would want to adjust is data, not code, and lives in
[`src/config/`](src/config/):

| Want to change | File |
|---|---|
| The app icon | `assets/icon-master.png`, then `npm run icons:generate` |
| Names, colours, avatar photos | `family.ts` |
| App name, rotation start date | `app.ts` |
| Pages, the tab bar, the roadmap cards | `navigation.ts` |
| Database and collection names | `db.ts` |
| The five-week schedule | `rotation.ts` |
| Bella and Leia: photos, where a face is pinned | `pets.ts`, then `npm run pets:generate` |
| Who has which pet tonight | the `petRotations` collection — see [Pets](docs/pets.md#re-anchoring) |
| The family mantras and their quotes | `mantras.ts` |
| The five healthy lists off the wall | `health.ts` |
| Things to do when bored, and Dad Bucks prices | `bored.ts` |
| Seat positions, parent defaults, animation timing | `seating.ts` |
| The ten themes | `themes.ts` |

See [Maintenance](docs/maintenance.md) for step-by-step recipes.

---

## Adding the next feature

The app is set up so a new page is roughly four steps:

1. Add a collection name to `COLLECTIONS` in [`src/config/db.ts`](src/config/db.ts).
2. Add an entry to `NAV_ITEMS` in [`src/config/navigation.ts`](src/config/navigation.ts)
   (and delete the matching `PLANNED_FEATURES` entry).
3. Create `src/app/(app)/<page>/page.tsx`. Call `await requireUser()` first.
4. Extend `scripts/seed-database.ts` with any indexes the collection needs.

The tab bar and the dashboard pick the new page up automatically.
