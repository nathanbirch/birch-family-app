# Architecture

## The shape of it

Next.js App Router, React server components by default, Tailwind v4 for layout
and semantic CSS custom properties for colour. No database, no API routes, no
server actions, no external services.

The whole app is one page. Seating is **derived**, never stored:

```
ROTATION_START_DATE  ─┐
device's local date  ─┼──►  which week (0-4)  ──►  child positions 1-5  ──►  two scenes
five-week schedule   ─┘
parent swap (local)  ─────────────────────────►  which parent sits where
```

There is nothing to save because there is nothing to decide. Two devices
looking at the app on the same day always show the same seats.

## Server and client

Server components are the default. Exactly one client island exists:

- **`SeatingBoard`** (`"use client"`) — because the assignments depend on the
  *device's* local date and must roll over at local midnight without a reload.
  Everything it renders (the header, the status panel, both scenes) is a plain
  pure component that happens to be in the client bundle.

Everything else that is a client component is there for a specific interactive
reason:

| Component | Why it's a client component |
|---|---|
| `ThemeProvider` / `ThemePicker` | `localStorage`, a popover, focus management |
| `SwapParentsButton` | reads the swap store |
| `ServiceWorker` | calls `navigator.serviceWorker.register` |
| `error.tsx` | React error boundaries must be client components |

`page.tsx` and `layout.tsx` stay on the server. The page renders the shell and
hands the island an initial date, so the very first paint already shows real
assignments before any JavaScript runs.

## Directories

### `src/config/` — the data

Everything that could reasonably be called "a fact about this family" lives
here, strongly typed, with no logic beyond simple lookups.

| File | Holds |
|---|---|
| `app.ts` | App name, rotation start date, the two `localStorage` keys |
| `family.ts` | The seven people: names, roles, identifying colours, faces, photos |
| `rotation.ts` | The hardcoded five-week schedule |
| `seating.ts` | Seat coordinates, doorways, parent assignments, adjacency model, scene layout and arrival timing |
| `themes.ts` | All ten themes and the token mapping |

### `src/lib/` — the logic

Pure functions. Nothing here imports React.

| File | Does |
|---|---|
| `dates.ts` | Local-calendar maths and `Intl` formatting |
| `rotation.ts` | Which week it is, who sits where, countdown copy |
| `schedule-analysis.ts` | Schedule validation and sibling-adjacency counting |
| `seating-summary.ts` | The screen-reader description of each scene |
| `theme-storage.ts` / `parent-storage.ts` | Guarded `localStorage` access |
| `theme-store.ts` / `parent-store.ts` | Tiny external stores for `useSyncExternalStore` |

### `src/components/` — the rendering

```
SeatingBoard          the client island; owns the date and the swap
├── AppHeader         name, date, week badge, countdown
│   ├── SwapParentsButton
│   └── ThemePicker
├── RotationStatus    week, date range, next rotation, days remaining
├── DinnerTable  ─┐
└── Expedition   ─┴─► SceneCard   card shell + screen-reader description
                      ├── ScenePhoto   the photograph and its themed wash
                      └── SceneSeats   places the seven people
                          └── Seat     position, arrival timing, swap glide
                              └── Avatar   photo or illustration, name, initial
```

`DinnerTable` and `Expedition` are deliberately thin: they pick a layout and a
photo, and hand everything else to the shared `SceneCard` / `SceneSeats` pair.
The two scenes differ only in their config.

## How state is held

There are three pieces of state, and each is held the way it actually behaves:

1. **The current date** — `useCurrentDate`, a `useState` seeded from the
   server's date, then corrected after mount and re-checked at local midnight
   and whenever the app returns to the foreground. State only changes when the
   *calendar day* changes, so nothing re-renders on a stray visibility event.

2. **The theme** — an external store over `localStorage`, read through
   `useSyncExternalStore`. It genuinely lives outside React (a pre-hydration
   script has already applied it to `<html>` before React starts), so modelling
   it as external state is what avoids both a cascading effect and a hydration
   mismatch.

3. **The parent swap** — the same pattern, in `parent-store.ts`.

Both stores are module-level, so the header button and the seating board share
one source of truth with no context provider.

## Sizing and positioning

No pixel measurements anywhere in the scenes.

- Each scene frame has a fixed `aspect-ratio` and `container-type: size`.
- Seat coordinates are **percentages** of that frame.
- Avatar and text sizes are in **`cqh`** — container-query *height* units.

Height units rather than width units matter: both photographs are portrait, and
sizing off the width would make avatars far taller than the gap between rows.
Because both scenes share one aspect ratio and one set of size constants, an
avatar renders at exactly the same pixel size in both cards, at any screen
width. A test asserts it.

## Colour

Components never reference a theme id or a hex value. They read semantic custom
properties (`--color-primary`, `--scene-overlay`, …). `ThemeStyles` emits one
`[data-theme="…"]` block per theme into the document head, generated from
`config/themes.ts`, so a token name meets a value in exactly one place. See
[Themes](themes.md).
