# Birch Family Seats

A small, installable web app that answers one question every week: **where does
everyone sit?** It shows this week's places at the dinner table and in the Ford
Expedition, and rotates the five children through a balanced five-week schedule.

No accounts, no database, no server, no tracking. The seating is derived
entirely from three things:

1. the rotation start date in the config,
2. the device's current local date,
3. the hardcoded five-week schedule.

Two preferences are stored on the device: the chosen colour theme, and whether
the two parents have swapped seats. Neither syncs anywhere.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run check      # typecheck + lint + tests — run before committing
npm run build      # production build
npm start          # serve it, and test PWA/offline behaviour
```

Requires Node 20 or newer.

> Offline behaviour cannot be tested with `npm run dev` — the service worker is
> deliberately only registered in production builds. Use
> `npm run build && npm start`.

## What it does

- **Dinner Table** and **Ford Expedition**, each a photograph of the real thing
  with everyone placed on their actual seat.
- The five children rotate through five numbered positions on a fixed five-week
  cycle. The same position number applies to both scenes.
- The parents stay put — unless you press the ⇄ button, which trades their
  seats in both scenes and remembers it on that device.
- Everyone walks in through a doorway and takes their seat over three seconds
  on load, and again whenever the week rolls over.
- Ten themes, including one dark. Installable as a PWA and fully usable offline
  after the first visit.

## Documentation

Everything lives in **[`docs/`](docs/README.md)**:

| Doc | What's in it |
|---|---|
| [Getting started](docs/getting-started.md) | Install, run, test, build. Every npm script. |
| [Architecture](docs/architecture.md) | Layout, what runs where, how data flows. |
| [Family and seats](docs/family-and-seats.md) | People, avatars, photos, seat coordinates, the parent swap. |
| [Rotation](docs/rotation.md) | Start date, the schedule, why it isn't a simple rotation, fairness numbers. |
| [Themes](docs/themes.md) | All ten themes, tokens, persistence, the no-flash script. |
| [Animation](docs/animation.md) | The three-second arrival and the swap glide. |
| [PWA and offline](docs/pwa-and-offline.md) | Installing, the service worker, icons. |
| [Accessibility](docs/accessibility.md) | What's been done and what it guarantees. |
| [Testing](docs/testing.md) | What each test file covers, and current coverage. |
| [Maintenance](docs/maintenance.md) | Recipes for common changes, plus troubleshooting. |
| [Decisions](docs/decisions.md) | The non-obvious calls and why. |

## The most common change

Almost everything you would want to adjust is data, not code, and lives in
[`src/config/`](src/config/):

| Want to change | File |
|---|---|
| Names, colours, avatar photos | `family.ts` |
| Rotation start date, app name | `app.ts` |
| The five-week schedule | `rotation.ts` |
| Seat positions, parent defaults, animation timing | `seating.ts` |
| The ten themes | `themes.ts` |

See [Maintenance](docs/maintenance.md) for step-by-step recipes.
