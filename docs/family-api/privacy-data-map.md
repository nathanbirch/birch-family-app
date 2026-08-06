# Privacy data map

Every field this API receives, every field it returns, and — the longer and
more important list — everything it deliberately does not.

The rule everywhere below is **default to exclusion**. A field appears in a
response because somebody wrote a line of code to put it there, one field at a
time. No database document is ever spread, serialised or passed through, so
adding a column to a MongoDB document cannot leak it.

---

## What the API receives

| From | What | Why |
|---|---|---|
| ChatGPT | `Authorization: Bearer <key>` | Authentication. Never logged, never stored. |
| ChatGPT | `?child=<slug>` — one of five first names, or absent | To answer "what are *my* chores". |
| ChatGPT | `If-None-Match` (optional) | Conditional GET. |
| The platform | Source IP, in `X-Forwarded-For` | Rate limiting only. HMACed with a per-boot random salt, truncated to 12 characters, never stored or printed. |

**That is the whole list.** The Action takes one optional parameter. A child's
message, the conversation, the model's reasoning and anything the child typed
never reach this server — they cannot, because there is no field for them.

This is deliberate. Keeping the Action's parameters structured and tiny is what
makes the privacy claim in [privacy-policy-draft.md](privacy-policy-draft.md)
true rather than aspirational.

---

## What the API returns

Source column: **config** = compiled or JSON configuration in this repo,
**db** = MongoDB, **calendar** = the family Google Calendar feed,
**computed** = derived at request time.

### Envelope

| Field | Source | Notes |
|---|---|---|
| `schemaVersion` | config | |
| `securityNotice` | config | Fixed sentence. Labels the payload as data. |
| `generatedAt` | computed | ISO 8601 with Boise's offset. |
| `timezone`, `currentDate`, `currentLocalTime` | computed | America/Boise, never the server's UTC. |
| `dataFreshness.status` | computed | `fresh` / `stale` / `unavailable`. |
| `dataFreshness.lastUpdatedAt` | computed | So staleness is visible rather than inferred. |
| `dataFreshness.degradedSources` | computed | Names of sources, never error text. |

### The identified child

Present **only** when `?child=` named somebody, and only for that child.

| Field | Source | Notes |
|---|---|---|
| `identifiedChild.id` | config | One of five slugs. |
| `identifiedChild.name` | config | First name only. |
| `identifiedChild.birthDate` | config | From `config/family-profile.json`. |
| `identifiedChild.calculatedAge` | computed | Computed at request time from the date, never stored. |

`birthDate` is returned so the model has the raw fact behind the age it is
given, and for one child at a time. It is the most identifying field in the
response and it is here on purpose, with that noted.

### Family

| Field | Source | Notes |
|---|---|---|
| `family.mottoes` | config | Two lines from `config/motto.ts`. Text only — not the `meaning` paragraphs. |
| `family.upcomingBirthdays[].person` | config | "Daddy", "Hannah" — the name the family uses, never a legal name. |
| `family.upcomingBirthdays[].date`, `.daysAway` | computed | |

**No ages and no birth years for parents.** `config/family-birthdays.json`
stores parents as `--MM-DD` with no year at all, precisely so this field cannot
exist. There is no question the assistant can usefully answer that needs to
know how old Daddy is turning.

Only birthdays inside the reminder window from
`config/family-birthdays.json` appear.

### Responsibilities

| Field | Source | Notes |
|---|---|---|
| `responsibilities.availability` | computed | `requires-child` when nobody was named — so an empty list is never read as "no chores". |
| `responsibilities.chores[].id` | config | A kebab-case slug like `tidy-room`. Not a database key. |
| `responsibilities.chores[].title` | config | The label off the chart, sanitised. |
| `responsibilities.chores[].chart` | config | `chores` / `learning` / `hygiene`. |
| `responsibilities.chores[].status` | db | `complete` / `incomplete` / `not-tracked-today`. |
| `responsibilities.stars.*` | db | Counts only. |
| `responsibilities.homeworkKnown` | config | Always `false`. Present so the model can say it does not know. |

**The identified child's rows only.** With no child named, nothing is read from
`starWeeks` at all — so a family-wide request is not a way to harvest five
charts one call at a time.

### Rotations

| Field | Source | Notes |
|---|---|---|
| `rotations.seating.value` | config + computed | The same plain sentence the app renders for screen readers, so the two cannot drift. Narrowed to the identified child when there is one. |
| `rotations.seating.weekNumber`, `.cycleLength` | computed | |
| `rotations.petSleeping.assignments[].pet` | config | "Bella", "Leia". |
| `rotations.petSleeping.assignments[].assignedTo` | db + config | A child's first name. |

### Calendar

| Field | Source | Notes |
|---|---|---|
| `calendar.availability` | computed | `ok` / `not-configured` / `unavailable` — kept apart so "no calendar connected" is not reported as "nothing on". |
| `calendar.today[]`, `calendar.nextSevenDays[]` | calendar | Four fields each: `title`, `date`, `startTime`, `allDay`. |

Titles are sanitised and capped at 120 characters. Seven days maximum, and the
caller cannot ask for a different window.

### The rest

| Field | Source | Notes |
|---|---|---|
| `windDown.usualTime` | config | From `config/family-profile.json`. |
| `windDown.isPastWindDown` | computed | |
| `familyAnnouncements` | — | `availability: "not-tracked"`. The app has no announcements. |
| `notTracked[]` | config | What the app genuinely does not hold. |
| `truncated[]`, `truncationNotice` | computed | Which lists were shortened. |

---

## What is excluded, and why

Everything here was available to the projection and left out.

### From the calendar

| Excluded | Why |
|---|---|
| `location` | This is where the street address is. Every single time. |
| `description` | Where the appointment details are — the doctor, the reason, the note. |
| Organiser, attendees | Other people's names and email addresses. |
| Conferencing links, any URL | An executable link in a child's assistant. Also the injection vector. |
| Event `uid`, `RRULE`, `SEQUENCE`, `STATUS` | Internal metadata with no use to a child. |
| Anything outside today + 7 days | Travel plans and future schedules. Also a bound. |
| The `CALENDAR_ICS_URL` itself | A bearer credential for the whole calendar. |

### From the database

| Excluded | Why |
|---|---|
| `_id` and every ObjectId | Internal identifiers. Nothing outside needs one. |
| `passwordHash`, the `users` collection, the `sessions` collection | Not read at all. This API never opens them. |
| `updatedAt`, document versions | Internal metadata. |
| Deleted or historical records | Only the current week is read. |
| Another child's marks | Read for the identified child alone. |

### From the family's own information

| Excluded | Why |
|---|---|
| Street or school address | Never returned by any field. |
| Phone numbers, email addresses | The app does not hold them; nothing here could return one. |
| Device or live location | Not held, not returned. |
| Medical information | Not held. `docs/health.md` is the wall lists, not records. |
| Financial information, reward costs | Not held, and would be parent-only if it were. |
| Parent-only notes | No such field. `notTracked` says so explicitly. |
| Parents' ages or birth years | Stored as `--MM-DD` so the field cannot exist. |
| Full legal names | First names and family titles only. |

### From the system

| Excluded | Why |
|---|---|
| API keys, `SESSION_SECRET`, `MONGODB_URI` | Never read by this code path, never logged, never returned. |
| Environment variable names | Absent from every error message. |
| Stack traces, SQL, collection names, framework versions | Absent from every error message. |
| Hostname, region, deployment id | Absent, including from `/health`. |
| Conversation history, ChatGPT prompts | Never received in the first place. |
| Audit trails | Not held. |

`tests/family-api-context.test.ts` serialises the whole response and asserts that
none of `_id`, `objectid`, `password`, `mongodb`, `bearer`, `authorization`,
`@`, `phone`, `street`, `latitude`, `stack` or `process.env` appears anywhere in
it — so a *future* field that leaks one of these fails even though nobody wrote
a test for that field.

---

## What is logged

Covered in full in [security.md](security.md#errors-and-logging). In summary:
timestamp, endpoint, status, duration, rate-limit outcome, cache hit/miss,
size bucket, key version, correlation id, and **whether** a child was named —
never which one, never any content, never a raw address, never a key.

The one honest exception, recorded in
[threat-model.md](threat-model.md#9-leakage-through-logs): the child's slug is
a query parameter, and Vercel's own platform logs record query strings. That is
a first name in a log the parent account controls. It was accepted rather than
solved, because the alternative is a POST body and this API is deliberately
GET-only.

---

## Adding a field

If you are here because you want to return something new:

1. Add it to `ContextInput` and to `FamilyContext` in
   `src/lib/family-api/context.ts`, by name.
2. Copy it across explicitly. Do not spread anything.
3. Sanitise it if it is free text, and give it a length cap in `config.ts`.
4. Add a row to the table above, and a row to the exclusions if you decided
   against a neighbouring field.
5. Add it to `src/lib/family-api/openapi.ts` and run `npm run api:openapi`.
6. Add a test asserting what it contains — and, if it is near anything
   sensitive, one asserting what it does not.

Ask the question `docs/ai/10` asks: *what can the assistant do with this that
it could not do without it?* If the answer is "nothing specific", leave it out.
Several obvious candidates were left out for exactly that reason.
