# Birch Family Seats — documentation

Everything about how this app is put together and how to change it.

Start here if you are picking it up cold:

| Doc | What's in it |
|---|---|
| [Getting started](getting-started.md) | Install, run, test, build. Every npm script explained. |
| [Architecture](architecture.md) | How the app is laid out, what runs where, and how data flows. |
| [Family and seats](family-and-seats.md) | People, avatars, photos, seat coordinates, swapping the parents. |
| [Rotation](rotation.md) | The start date, the five-week schedule, why it isn't a simple rotation, and the fairness numbers. |
| [Themes](themes.md) | All ten themes, the token system, persistence, and the no-flash script. |
| [Animation](animation.md) | The three-second arrival choreography and the parent-swap glide. |
| [PWA and offline](pwa-and-offline.md) | Installing on each platform, the service worker, icons. |
| [Accessibility](accessibility.md) | What's been done and what it guarantees. |
| [Testing](testing.md) | What each test file covers, how to run them, current coverage. |
| [Maintenance](maintenance.md) | Recipes for common changes, plus troubleshooting. |
| [Decisions](decisions.md) | The non-obvious calls and why they were made. |

## The app in one paragraph

Seven people, two places to sit. The five children rotate through five numbered
positions on a fixed five-week cycle; the two parents stay put unless you swap
them. Which week it is comes from the device's own calendar, so there is nothing
to update and nothing to sync. Everything else — the family, the schedule, the
seat coordinates, all ten themes — is compiled into the app. There is no
database, no server, no account, and no tracking. The only things stored on the
device are the chosen theme and whether the parents are swapped.
