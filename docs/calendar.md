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
| `lib/calendar/layout.ts` | Placing events on the hour grid, and resolving overlaps |
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

**Expansion starts at `DTSTART`'s own period, not the next one.** This is
worth stating because getting it wrong is invisible. A rule naming several days
per period — `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH` — has genuine occurrences in the
same week it begins. Skipping that period drops them with nothing logged and no
error: the events are simply not there. Four tests cover it (week, month, year,
and that `DTSTART` is still not emitted twice).

The period walk also begins at `DTSTART` and steps forward to reach the window,
so the safety cap has to be generous enough for a long-running series to arrive.
At 20,000 a daily event started in the 1970s still gets here; too low a cap
fails the same silent way.

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

**Day is the default**, in the list layout. The page is nearly always opened to
answer "what's on today", and day answers it with no scanning: one column, every
title in full. Week and month are one tap away for the planning questions.

The week view is seven **stacked rows**, not seven columns: at phone width a
column is about forty pixels, which fits a dot and nothing else.

The month grid is always six rows of seven. A month spans five or six weeks
depending on which weekday it starts on, and a grid that changes height as you
page makes the page jump under your thumb.

Tapping a day in either grid opens it in the day view.

### List or timeline

Day and Week each draw two ways, switched by the toggle beside the view tabs:

- **List** (default) — the stacked rows. Every title in full, no horizontal
  compromise, reads well on a 390px screen.
- **Timeline** — the hour grid, as Google draws it.

Neither is better, which is why it is a toggle rather than a replacement. The
list answers *what is on*; the timeline answers *what shape is the day* — where
the gaps are, what is double-booked, whether an afternoon is actually free.
List stays the default because it is the one that survives a phone screen
without truncating anything.

The choice persists while you move between Day and Week — it is a property of
the calendar, not of the view you happen to be on. It is **not** saved between
visits; add a key to `config/app.ts` and follow the `theme-storage.ts` pattern
if that becomes annoying. Month has no time axis, so the toggle is hidden
there rather than shown doing nothing.

### The timeline

`TimeGrid` draws both Day (one column) and Week (seven) — they differ only in
column count.

**All-day events sit above the axis.** An all-day event has no start time and
nowhere to go on a time grid; stretched midnight-to-midnight it would bury the
column behind it. They are pinned in a header row that does not scroll, so
"Hannah's Night" stays visible however far down the day you have scrolled.

**The grid opens on the first event**, not on midnight — `firstInterestingHour`
picks an hour of context above the earliest block, falling back to 7am on an
empty day. Without it every visit starts with six empty hours and a scroll.

**A red line marks now**, on today's column only. It is a fixed red rather than
a theme token: it is the one mark on the grid that must not be mistaken for an
event, and every theme colours events from its own palette. It renders only
after mount — the server has no idea what time it is on the device, and drawing
it from the server's clock would be both wrong and a hydration mismatch.

**Seven columns do not honestly fit a phone**, so the week timeline scrolls
sideways inside its own card below `CALENDAR_WEEK_MIN_WIDTH_REM`. The *page*
still never scrolls sideways.

### Resolving overlaps

The hard part of a time grid, and why `layout.ts` is a separate, pure module.
A Monday morning with an airport run at 5:30, a flight at 7:15 and babysitting
from 8 has three events competing for one strip of column. Drawing them on top
of each other hides two; giving every event on the day its own column wastes
the whole afternoon's width.

Two stages:

1. **Cluster.** Walk the day in start order, gathering events into runs that
   transitively overlap. A cluster ends when an event starts after everything
   before it has finished — so a busy morning cannot narrow a lone evening
   event.
2. **Pack.** Within a cluster, each event takes the leftmost column whose
   previous occupant has already finished, and the cluster's width is split
   between however many columns that needed.

Stage 2 reuses columns, which matters: that Monday morning is three events but
only **two** columns, because the airport run finishes at 6:30 and babysitting
does not start until 8. A test asserts exactly that, and another brute-forces
the real invariant — *no two overlapping events ever share a column*.

Two details worth knowing:

- **A 20-minute minimum slot.** It stops a short reminder rendering as an
  unreadable hairline, and it stops a zero-length event (Google emits these for
  some imported reminders) being treated as overlapping nothing and drawn on
  top of its neighbour.
- **Positions are fractions of a day, not pixels.** The component owns how tall
  an hour is; `layout.ts` stays pure and directly testable.

Events crossing midnight are clipped to each day's column and flagged
`continuesFrom` / `continuesInto`, which is what drops the rounded corner on
that edge so the block reads as continuing rather than ending there.

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
