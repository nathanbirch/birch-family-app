# Birch Family App — documentation

Everything about how this app is put together and how to change it.

**Repo:** <https://github.com/nathanbirch/birch-family-app> (owner
`nathanbirch`, branch `main`) · **Host:** Vercel · **Database:** MongoDB Atlas,
`birch_family_app`. See [Deployment](deployment.md) for the live URL and the
full project facts.

Start here if you are picking it up cold:

| Doc | What's in it |
|---|---|
| [Getting started](getting-started.md) | Install, run, test, build. Every npm script explained. |
| [Deployment](deployment.md) | Where it is hosted, Vercel setup, env vars, the GitHub Pages history. |
| [Database](database.md) | MongoDB collections, seeding, and the Atlas allowlist trap. |
| [Authentication](authentication.md) | How the login works, changing the password, adding people. |
| [Architecture](architecture.md) | How the app is laid out, what runs where, and how data flows. |
| [Family and seats](family-and-seats.md) | People, avatars, photos, seat coordinates, swapping the parents. |
| [Mantras](mantras.md) | The family mantras, the quoting rule, and the mantra of the day. |
| [Calendar](calendar.md) | Connecting the Google Calendar, and how the iCalendar reading works. |
| [Rotation](rotation.md) | The start date, the five-week schedule, why it isn't a simple rotation, and the fairness numbers. |
| [Themes](themes.md) | All ten themes, the token system, persistence, and the no-flash script. |
| [Animation](animation.md) | The three-second arrival choreography and the parent-swap glide. |
| [PWA and offline](pwa-and-offline.md) | Installing on each platform, the service worker, icons. |
| [Accessibility](accessibility.md) | What's been done and what it guarantees. |
| [Testing](testing.md) | What each test file covers, how to run them, current coverage. |
| [Maintenance](maintenance.md) | Recipes for common changes, plus troubleshooting. |
| [Decisions](decisions.md) | The non-obvious calls and why they were made. |

## The app in one paragraph

A private family app behind a single shared login. Signing in lands you on a
dashboard with a card per page; a bottom tab bar moves between them, with Home
in the middle. Today there are three real features — the **seating rotation**,
the **family mantras** and the **calendar** — plus an account page; chore
charts, rewards and stars are planned, and are listed on the dashboard so the
app itself is the roadmap. The
seating is still entirely self-contained: seven people, two places to sit, the
five children rotating through five numbered positions on a fixed five-week
cycle while the two parents stay put unless you swap them. Which week it is
comes from the device's own calendar, and the family, the schedule, the seat
coordinates and all ten themes are compiled into the app rather than stored
anywhere. The database holds only accounts and sessions.

## What changed when the login arrived

This began as `seating-rotation` / "Birch Family Seats" — a static export on
GitHub Pages with no server, no database and no accounts. Adding a login made
static hosting impossible, so it moved to Vercel and grew a MongoDB dependency.
The seating rotation code itself was untouched by that change; it simply lives
at `/seating` now instead of `/`. [Deployment](deployment.md) has the details.
