# Architecture

## The shape of it

Next.js 16 App Router, React server components by default, Tailwind v4 for
layout and semantic CSS custom properties for colour. MongoDB Atlas behind a
single shared login. Server Actions for the two mutations there are (sign in,
sign out); no REST API routes.

## Routes

```
src/app/
├── layout.tsx              root: theme, fonts, service worker
├── login/page.tsx          the only page reachable signed out
└── (app)/                  route group — parentheses keep it out of the URL
    ├── layout.tsx          requireUser() + the bottom tab bar
    ├── page.tsx            /          the dashboard
    ├── turns/page.tsx      /turns     the seating rotation, and tonight's pets
    ├── stars/page.tsx      /stars     the three star charts, one child at a time
    ├── mantras/page.tsx    /mantras   the family mantras
    ├── health/page.tsx     /health    the five healthy lists, as cards
    ├── health/[section]/   /health/…  one list, in full
    │   └── page.tsx
    ├── bored/page.tsx      /bored     inside, outside, or earn some money
    ├── bored/[category]/   /bored/…   one category's ideas, as a grid
    │   └── page.tsx
    ├── ceremonies/page.tsx  /ceremonies    every award ceremony, newest first
    ├── ceremonies/[week]/   /ceremonies/…  one week's award ceremony
    │   └── page.tsx
    ├── calendar/page.tsx   /calendar  the family Google Calendar
    ├── note/page.tsx       /note      the pad on the fridge — a *tool*
    ├── picker/page.tsx     /picker    who goes first — a *tool*
    └── account/page.tsx    /account   theme, sign out, app info
```

The last two are marked as tools rather than pages, which is a distinction
`config/navigation.ts` makes and the dashboard renders: a page is somewhere you
go, a tool is something you pick up for a minute. See [the Note](note.md) and
[Finger Picker](picker.md). `/picker` is also the one route that paints over
the tab bar — five hands land on an iPad at once and none of them aim.

Everything inside `(app)` is protected by *where the file is*, not by
remembering to add it to a list: the group's layout calls `requireUser()` before
any child renders. `src/proxy.ts` does a fast cookie-signature check in front of
that. See [Authentication](authentication.md) for why there are two checks.

`config/navigation.ts` is the single source of truth for what pages exist. The
bottom tab bar and the dashboard cards are both generated from it.

## Two kinds of data

The app deliberately keeps two categories apart.

**Derived, never stored** — the entire seating rotation:

```
ROTATION_START_DATE  ─┐
device's local date  ─┼──►  which week (0-4)  ──►  child positions 1-5  ──►  two scenes
five-week schedule   ─┘
parent swap (local)  ─────────────────────────►  which parent sits where
```

There is nothing to save because there is nothing to decide. Two devices
looking at the app on the same day always show the same seats, and the database
being unreachable does not change a single seat.

**Stored in MongoDB** — accounts, sessions, the nightly pet rotation, the
weekly chore swap and the ticked stars. The chores follow the pets' pattern
exactly: the *maths* is derived from an anchor plus elapsed weeks, and only the
anchor is stored, so no row per week exists anywhere. The stars
themselves are the app's first genuinely accumulating data — see
[Star charts](stars.md). The weekly report is then *derived from stored data*:
it adds no collection of its own and is `starWeeks` read back through the same
counting the chart uses, which is why it can never disagree with it — see
[Weekly report](report.md). The
pets are the one thing on the seating page that is *not* derived, and that was
a deliberate choice rather than an oversight: re-anchoring "who has Bella
tonight" is something the family may want to do at 9pm, and a deploy is a poor
way to do it. The page still degrades rather than breaks — an unreachable or
malformed rotation falls back to the copy compiled into `config/pets.ts`. See
[Database](database.md) and [Pets](pets.md).

**Fetched, owned elsewhere** — the calendar. It is neither derived nor stored:
Google holds it, the app reads a copy every fifteen minutes and never writes
back. That makes it the first part of the app that can be *unavailable*, which
is why the calendar page and the dashboard badge each sit behind their own
`<Suspense>` boundary and degrade to an explanation rather than an error. See
[Calendar](calendar.md).

Keep new features on the right side of that line where you can. A chore *chart*
(who is assigned what, on what cycle) may well be derivable config like the
seating schedule; whether a chore was *done* is genuinely state and belongs in
the database.

## Server and client

Server components are the default. Every `page.tsx` and `layout.tsx` stays on
the server, which is what lets them call `requireUser()` and query MongoDB
directly with no API layer in between.

Client components exist only where there is a specific interactive reason:

| Component | Why it's a client component |
|---|---|
| `SeatingBoard` | assignments depend on the *device's* local date and must roll over at local midnight without a reload |
| `PetNights` | same, nightly rather than weekly; the rotation it works from is read on the server and passed down |
| `SeatingCardBadge` | same, for the dashboard's "Week 3 of 5" badge |
| `CalendarBoard` | which day it is, and Day/Week/Month is a choice that must not cost a round trip |
| `TimeGrid` | scrolls to the first event on mount, and ticks a "now" line once a minute |
| `CalendarCardBadge` | same, for the dashboard's "next event" pill |
| `BottomNav` | needs `usePathname()` to know which tab is current |
| `LoginForm` | `useActionState` for the pending state and the error message |
| `SignOutButton` | `useFormStatus` for the pending state |
| `ThemeProvider` / `ThemePicker` | `localStorage`, a popover, focus management |
| `SwapParentsButton` | reads the swap store |
| `ServiceWorker` | calls `navigator.serviceWorker.register` |
| `error.tsx` | React error boundaries must be client components |

The seating page renders the shell on the server and hands the island an
initial date, so the very first paint already shows real assignments before any
JavaScript runs.

### Keeping the server bundle honest

Two modules are split in half specifically to control what gets pulled where:

- **`session-token.ts`** (JWT only, no MongoDB) is separate from
  `session.ts`, because `proxy.ts` runs on every request and importing the
  whole driver into it would be expensive.
- **`passwords.ts`** (bcrypt only) is separate from `users.ts`, so password
  hashing can be unit-tested without `server-only` or a database.

A third split exists for the same reason: **`lib/calendar/feed.ts`** holds the
only code that reads `CALENDAR_ICS_URL`, deliberately *not*
`config/calendar.ts`, which the client bundle imports for the view list. That
URL is a bearer credential for the whole calendar.

Server-only modules import `"server-only"`, which turns "this accidentally
ended up in the client bundle" from a silent data leak into a build error.

## Directories

### `src/config/` — the data

Everything that could reasonably be called "a fact about this family" lives
here, strongly typed, with no logic beyond simple lookups.

| File | Holds |
|---|---|
| `app.ts` | App name, rotation start date, every `localStorage` key |
| `db.ts` | The database name and every collection name |
| `navigation.ts` | The pages, the tools, where each sits in the tab bar, the planned-feature cards |
| `note.ts` | The Note's tools, inks, nibs, papers and the pad's fixed shape |
| `picker.ts` | Finger Picker's timings and its ten circle colours |
| `mantras.ts` | The family mantras, their verbatim quotes and sources |
| `health.ts` | The five healthy lists, transcribed from the sheets on the wall |
| `family.ts` | The seven people: names, roles, identifying colours, faces, photos |
| `rotation.ts` | The hardcoded five-week schedule |
| `pets.ts` | Bella and Leia: photographs, where a child's face is pinned on them, and the rotation the database is seeded from |
| `seating.ts` | Seat coordinates, doorways, parent assignments, adjacency model, scene layout and arrival timing |
| `calendar.ts` | Feed refresh interval, expansion window, the three views |
| `themes.ts` | All ten themes and the token mapping |

### `src/lib/` — the logic

Pure functions. Nothing here imports React.

| File | Does |
|---|---|
| `dates.ts` | Local-calendar maths and `Intl` formatting |
| `rotation.ts` | Which week it is, who sits where, countdown copy |
| `schedule-analysis.ts` | Schedule validation and sibling-adjacency counting |
| `seating-summary.ts` | The screen-reader description of each scene |
| `theme-storage.ts` / `parent-storage.ts` / `last-page-storage.ts` | Guarded `localStorage` access |
| `theme-store.ts` / `parent-store.ts` | Tiny external stores for `useSyncExternalStore` |
| `calendar/` | iCalendar reading, `RRULE` expansion, timezone conversion, grid layout, the feed fetch |
| `pets/rotation.ts` | Which child sleeps with which animal tonight, and the rule that keeps them apart |
| `pets/store.ts` | Reads the `petRotations` collection, falling back to the compiled default |
| `db.ts` | The shared MongoDB client, and readable connection errors |
| `auth/` | Sessions, users, passwords, the DAL, the sign-in/out actions |

Everything outside `auth/`, `pets/store.ts` and `db.ts` is still pure and
React-free, and is tested as such — including `pets/rotation.ts`, which is
deliberately split from the store beside it for exactly that reason.

### `src/components/` — the rendering

```
nav/BottomNav         the tab bar: Home pinned, the rest on a scrolling strip
nav/NavIcon           the icon set
mantras/MantraCard    one mantra: ours in large type, theirs in a blockquote
mantras/MantraOfDay   client island; today's mantra, rolls over at midnight
health/HealthArt      the five flat drawings, and the palette they tint with
health/HealthSectionCard  one tappable list card, picture and count
health/HealthList     one whole list, numbered as the paper is
auth/LoginForm        email + password, useActionState
account/SignOutButton posts to the logout Server Action
dashboard/SeatingCardBadge   the live "Week 3 of 5" pill
dashboard/CalendarCardBadge  the live "next event" pill
pets/PetNights        client island; tonight's animals, rolls over at midnight
pets/PetCard          one animal, with tonight's child pinned on it

calendar/CalendarBoard  the client island; owns the view, layout and cursor
├── DayView             one day in full            ─┐ list layout
├── WeekView            seven stacked rows          ├─ (the default)
├── EventRow            one event: title, timing   ─┘
├── TimeGrid            the hour grid — Day (1 column) or Week (7)
└── MonthView           six rows of seven, with event chips
calendar/CalendarNotice not connected, or connected and failing

note/StickyNote       pointer events into strokes, and two stacked canvases
note/NoteToolbar      the tray: tools, nibs, inks, papers, undo, clear
picker/FingerPicker   the full-screen overlay, the clock and the draw
picker/EdgeConfetti   paper fired inward from all four edges

PageBackground        the soft themed shapes behind every page
LastPageMemory        renders nothing; reopens the app on the last page used

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

4. **The last page visited** — deliberately *not* a store. Nothing renders from
   it, so there is nothing to subscribe to: `LastPageMemory` writes the current
   path on every navigation and reads it back once per page load. See
   [Navigation memory](#navigation-memory).

## Navigation memory

Opening the app returns you to whichever page you were last on, rather than
always to the dashboard. `LastPageMemory` sits in the `(app)` layout and is the
whole of it.

Two rules keep it from being irritating, and both are load-bearing:

- **It only redirects from `/`.** Any other entry URL — a bookmark, a shared
  link, a reload of `/account` — wins over what is in storage. Storage is a
  fallback for the app's own entry point, not an override.
- **It only redirects once per page load.** Without that, tapping Home would
  bounce straight back to Turns and the Home tab would be unreachable. The
  guard is a module-level flag, which a fresh load resets and a client-side
  navigation does not.

The stored path is validated against `NAV_ITEMS` on the way out, so deleting or
renaming a route can never strand someone on a 404 they have no way to clear.
It uses `replace`, not `push`, so Back from the restored page leaves the app
instead of returning to an entry point that immediately redirects again.

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
