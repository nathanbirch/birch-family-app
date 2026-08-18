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
| [Healthy Birches](health.md) | The five lists off the wall, the transcription rule, and the drawings. |
| [Calendar](calendar.md) | Connecting the Google Calendar, and how the iCalendar reading works. |
| [Rotation](rotation.md) | The start date, the five-week schedule, why it isn't a simple rotation, and the fairness numbers. |
| [Family Home Evening](family-home-evening.md) | The seven jobs, the house picture, and why this one turns over on Sunday. |
| [Star charts](stars.md) | The three charts off the fridge, the monthly chore rotation, and how a star is stored. |
| [The shopping list](shopping.md) | The one live page: server-sent events instead of a WebSocket, and how a tick stays drawn before its write lands. |
| [Weekly report](report.md) | Monday's award ceremony: how a week is counted, what a star is worth, and the fanfare. |
| [Pets](pets.md) | Bella and Leia, the nightly rotation in the database, and why nobody ever gets both. |
| [Themes](themes.md) | All ten themes, the token system, persistence, and the no-flash script. |
| [Animation](animation.md) | The three-second arrival choreography and the parent-swap glide. |
| [PWA and offline](pwa-and-offline.md) | Installing on each platform, the service worker, icons. |
| [Accessibility](accessibility.md) | What's been done and what it guarantees. |
| [Testing](testing.md) | What each test file covers, how to run them, current coverage. |
| [The Bored Page](bored.md) | Three pictures for a bored child, what a Dad Buck is worth, and how the family adds their own idea with a word and an emoji. |
| [The Note](note.md) | The pad on the fridge: the Apple Pencil, why it is not in the database, and how a stroke is stored. |
| [Finger Picker](picker.md) | Who goes first: the five-second draw, and why it is provably fair. |
| [Maintenance](maintenance.md) | Recipes for common changes, plus troubleshooting. |
| [Family-context API](family-api/README.md) | The read-only endpoint the private Birch Family Custom GPT calls, and everything that guards it. |

## The family documents

These are about the family rather than the software, and they are the reason the
software exists. They change on a different clock from the code — see
[the maintenance guide](ai/15—birch-ai-maintenance-guide.md) for what is timeless
and what needs reviewing.

| Doc | What's in it |
|---|---|
| [The Constitution](constitution/) | Seventeen chapters: who this family is trying to become. Start at [the preface](constitution/01—preface.md). |
| [The AI companion](ai/01—birch-ai-purpose.md) | Fifteen documents specifying a child-appropriate AI companion — purpose, safety, the system prompt, integration, and tests. |
| [Editorial standards](editorial/editorial-standards.md) | How the Constitution is written, and the paragraph rule that matters most. |
| [Quotation verification](editorial/quotation-verification.md) | Every quotation traced to a primary source, and the five errors that found. |

Machine-readable extracts live in [`config/`](../config/) (family profile,
values, birthdays, AI policy) and [`schemas/`](../schemas/) (the AI's dynamic
context payload).
| [Decisions](decisions.md) | The non-obvious calls and why they were made. |

## The app in one paragraph

A private family app behind a single shared login. Signing in lands you on a
dashboard with a card per page; a bottom tab bar moves between them, with Home
pinned to the left of a strip that scrolls. Today there are five real features — the **seating rotation**,
the **star charts**, the **family mantras**, the **calendar** and the **Healthy
Birches** lists — plus an account page; the weekly celebration report and
rewards are planned, and are listed on the dashboard so the app itself is the
roadmap. Mantras and Healthy have a dashboard card but no tab: the bar holds
five, and Stars took the tab because five children open it several times a day.
Below the page cards there is now a second, smaller shelf — **Handy** — holding
the two *tools*: [the Note](note.md), a pad you write on with an Apple Pencil
that stays until it is cleared, and [Finger Picker](picker.md), which settles
who goes first. Neither is a destination, which is why neither is a full card
and neither is remembered as the page you were last on.
The
seating is still almost entirely self-contained: seven people, two places to
sit, the five children rotating through five numbered positions on a fixed
five-week cycle while the two parents stay put unless you swap them. Which week
it is comes from the device's own calendar, and the family, the schedule, the
seat coordinates and all ten themes are compiled into the app rather than
stored anywhere. Between the seats and the pets, a cutaway of the house shows
who has which **Family Home Evening** job — all seven of them take one, and
everybody moves down one room every Sunday, which makes it the only thing on the
page that does not turn over on a Monday. Beneath that, Bella and Leia rotate through the same five
children **nightly** — and that one rotation *is* in the database, so it can be
re-anchored without a deploy. The star charts work the same way: the chores
rotate between the children on the first of each month from an anchor stored in
the database, and the stars they tick are the one thing in the app that
genuinely accumulates. The **shopping list** is the newest page and the odd one
out: it is the only one two people are expected to edit at the same time, so it
is also the only one that holds a connection open and updates itself on every
phone in the house without a reload.

## What changed when the login arrived

This began as `seating-rotation` / "Birch Family Seats" — a static export on
GitHub Pages with no server, no database and no accounts. Adding a login made
static hosting impossible, so it moved to Vercel and grew a MongoDB dependency.
The seating rotation code itself was untouched by that change; it simply lives
at `/turns` now instead of `/`. [Deployment](deployment.md) has the details.
