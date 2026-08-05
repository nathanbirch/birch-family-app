# Calendar

The family's Google Calendar, read-only, shown by day, week or month.

---

## Connecting it

The app reads the calendar as an iCalendar feed over HTTPS. One environment
variable, no Google Cloud project.

1. Open [Google Calendar](https://calendar.google.com) **on a computer**, signed
   in as **nathantbirch@gmail.com** (the account the family calendar lives on).
2. Hover the family calendar in the left-hand list → **Options** (⋮) →
   **Settings and sharing**.
3. Scroll to **Integrate calendar** and copy **Secret address in iCal format**.
   It ends in `/basic.ics`.
4. Put it in `.env` locally:

   ```
   CALENDAR_ICS_URL=https://calendar.google.com/calendar/ical/…/basic.ics
   ```

5. Add the same variable to the Vercel project's environment settings, then
   redeploy. See [Deployment](deployment.md).

Without it, the Calendar page renders instructions rather than an error, and
the dashboard card simply has no badge. Nothing else in the app changes.

### The URL is a credential

Anyone holding that address can read the whole calendar — children's
schedules, addresses, times — with no sign-in at all. So:

- It is only ever read on the server. `src/lib/calendar/feed.ts` imports
  `server-only`, which makes "this got pulled into a client component" a build
  error rather than a silent leak.
- `src/config/calendar.ts` deliberately contains **no** code that reads it,
  because the client bundle imports that file for the view list.
- Nothing the app renders quotes it, error messages included — error text ends
  up in screenshots.
- If it leaks: **Reset secret address** on the same settings page kills it
  instantly. Then update `.env` and Vercel.

### Why not the Google Calendar API

Three options existed, and this is the trade that was taken:

| | Setup | Correctness | Verdict |
|---|---|---|---|
| **Secret iCal URL** | One env var | App must expand repeating events itself | **Chosen** |
| API + service account | Google Cloud project, service account, private key | Google expands recurrences | Rejected: heavy standing infrastructure for a read-only widget |
| API + API key | One env var | Same | Rejected: **requires making the calendar public** |

The third is disqualified on principle. The second is the more capable option
and would delete most of `src/lib/calendar/`; if the recurrence handling ever
becomes a maintenance burden, that is the migration to make. Note that it also
needs the calendar shared to the service account's address, which is a change
on the Google side, not just in this repo.

---

## How it works

```
CALENDAR_ICS_URL ──► fetch (cached 15 min)
                         │
                     parseIcs           ics.ts        raw VEVENTs
                         │
                     expandRrule        recurrence.ts every occurrence
                         │
                     buildEvents        events.ts     absolute instants
                         │
                     CalendarBoard      (client)      day / week / month
```

### The files

| File | Does |
|---|---|
| `config/calendar.ts` | Refresh interval, window size, the three views. No secrets. |
| `lib/calendar/civil.ts` | Wall-clock time, and turning it into an instant via `Intl` |
| `lib/calendar/ics.ts` | The RFC 5545 reader — unfolding, parameters, escapes |
| `lib/calendar/recurrence.ts` | `RRULE` expansion |
| `lib/calendar/events.ts` | Occurrences, exclusions, overrides, per-day lookup |
| `lib/calendar/format.ts` | The words on screen |
| `lib/calendar/feed.ts` | Fetch and cache. **Server only.** |

### Civil time versus instants

The distinction the whole thing rests on. iCalendar has two kinds of time:

- A **civil** reading — "3pm on 4 August" — which is a number on a wall and
  means nothing without a timezone.
- An **instant** — a point on the universal timeline.

**Repeating events repeat in civil time.** "Piano every Tuesday at 3pm" stays at
3pm across the daylight-saving change, even though consecutive occurrences are
then 167 or 169 hours apart. So expansion happens entirely in civil time and
each occurrence is converted to an instant only at the very end. A test asserts
exactly this across the November 2026 transition.

There is no `tzdata` dependency: `Intl.DateTimeFormat` already carries the IANA
database. `zoneOffsetMs` interrogates it by formatting a known instant *as* the
target zone and reading the fields back.

### All-day events are calendar squares, not midnights

The other thing that is easy to get wrong. An all-day event carries
`startDate`/`endDate` as plain `YYYY-MM-DD` strings and is matched against the
grid by string comparison — never by timestamp, never through a timezone. The
server renders in UTC on Vercel and the phones are in Mountain Time; convert an
all-day date to an instant and it lands on the wrong day for one of them.

Note also that Google writes `DTEND` **exclusively**: a trip on the 6th to the
8th arrives as `DTSTART:20260806` / `DTEND:20260809`. `events.ts` subtracts the
day so `endDate` is the day a person would actually point at.

### What `RRULE` support covers

`FREQ` (`DAILY`/`WEEKLY`/`MONTHLY`/`YEARLY`), `INTERVAL`, `COUNT`, `UNTIL`,
`BYDAY` including ordinals (`-1FR`), `BYMONTHDAY` including negatives,
`BYMONTH`, `BYSETPOS`, `WKST`, plus `EXDATE`, `RDATE` and `RECURRENCE-ID`
overrides.

Not supported, because Google's own UI cannot create them: `SECONDLY`,
`MINUTELY`, `HOURLY`, `BYYEARDAY`, `BYWEEKNO`, `BYHOUR`, `BYMINUTE`,
`BYSECOND`. An unsupported `FREQ` yields the first occurrence only — a visible
gap rather than a wrong answer.

Two behaviours that look like bugs and are not:

- **`DTSTART` is always an occurrence**, even when it does not match the rule.
  RFC 5545 §3.8.5.3 requires it, and Google relies on it.
- **Monthly rules skip months that are too short.** The 31st of every month
  produces nothing in February; it does not clamp to the 28th.

### The window

Repeating events have no last occurrence, so expansion needs bounds: one month
back to six months ahead, month-aligned (`config/calendar.ts`). The whole
window is expanded on the server and sent to the browser once, so switching
between day, week and month — and paging through them — costs no round trips.

The arrows **disable** at the window edges rather than paging into an empty
month. Widening the window costs payload; a busy family calendar is roughly 300
occurrences over seven months.

`CALENDAR_MAX_OCCURRENCES` (3000) is the backstop against a malformed rule
generating occurrences forever. If it trips, the page says so rather than
quietly showing a partial calendar.

### Caching

`fetch(url, { next: { revalidate: 900 } })` — Next's data cache, 15 minutes.
The project does not use `cacheComponents`, so this is the correct API here
rather than `use cache`/`cacheLife`.

The *page* is dynamic regardless, because `requireUser()` reads the session
cookie. Caching the fetch and not the page is the right split: the expansion is
cheap and has to run per request anyway, since the window moves with the
calendar day. Google regenerates the `.ics` on its own schedule, so polling
harder buys little.

Both the calendar page and the dashboard badge stream in behind `<Suspense>`,
so a slow or unreachable Google never holds up either page.

---

## The views

Day, week and month, switched client-side. All three read the same expanded
list, and every date decision is made on the *device* — `useCurrentDate`, the
same hook the seating board uses — so the calendar rolls over at local midnight
with no reload.

**Week is the default.** Day is too narrow to answer "what's coming up"; month
on a phone reduces each day to a chip. Week shows seven days with readable
titles.

The week view is seven **stacked rows**, not seven columns: at phone width a
column is about forty pixels, which fits a dot and nothing else.

The month grid is always six rows of seven. A month spans five or six weeks
depending on which weekday it starts on, and a grid that changes height as you
page makes the page jump under your thumb.

Tapping a day in either grid opens it in the day view.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| "No calendar connected yet" | `CALENDAR_ICS_URL` is unset — locally, or in Vercel |
| Google returned 404 | The secret address was reset. Copy the new one. |
| Google refused that address | The URL is a private *sharing* link, not the iCal one |
| "did not return a calendar" | The URL does not point at an `.ics` file |
| An event is on the wrong day | Almost certainly all-day handling — see above |
| A repeating event is missing | Check its rule against the supported list above |

Changes take up to 15 minutes to appear, by design. Google itself can lag
further behind on the `.ics` feed than it does in its own UI.
