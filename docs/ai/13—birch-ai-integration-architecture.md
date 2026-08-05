# Integration architecture

How the AI gets — or does not get — the family's current data. Four options,
compared against what this repository actually is.

> **Decided: Option A.** The companion runs as a ChatGPT project on a parent's
> own account, on the shared tablet in the main living area, with the family
> present and everyone having access. **No child gets an individual account at
> any age** — the shared family account is the design, not a stage. Option D
> remains the right second stage *for the data problem* and is not being built
> yet. The reasoning is in
> [decisions.md](../decisions.md#the-ai-companion-runs-on-a-parents-account-in-the-living-room);
> the comparison below is kept so that a future revisit does not have to be
> re-derived from scratch.

## The constraint that decides it

Before any architectural argument: **the children use a parent's account, on a
shared tablet, with a parent present.** Nobody is handed a device with their own
signed-in assistant on it, at any age. That is a family decision rather than a
technical one, and it rules out every architecture whose supervision model
depends on the child having an account of their own. See
[12—birch-ai-chatgpt-setup.md](12—birch-ai-chatgpt-setup.md).

It happens to be reinforced by policy — ChatGPT's minimum age is 13 and every
Birch child is under it — but the decision does not rest on that and does not
change when it lapses.

For the API path there is a corresponding rule with teeth. OpenAI's under-18 API
guidance requires developers serving minors to comply with COPPA and applicable
child-protection law, and — the specific one — **not to process personal data of
children under 13 without first enabling zero data retention on the API.** That
is a concrete, checkable requirement, and it is achievable.

## What the repository is today

Next.js 16 on Vercel, MongoDB Atlas for accounts, sessions, the pet rotation and
the star charts. Everything else — family, seating schedule, chores, themes,
mantras — is compiled in as TypeScript config. One shared password behind
`src/lib/auth/`, so the app already knows how to keep something private and
already has a server side capable of holding a secret.

There is no public API surface today. Adding one is the main cost of options C
and D.

---

## Option A — no integration

The AI knows only the static uploaded documents and sends every question about
today to the app.

**For:** nothing to build, nothing to secure, no new data leaves the house, no
API key exists to leak, and the AI cannot be wrong about family data because it
never claims to know any. Works offline in the sense that there is nothing to be
offline from.

**Against:** the child does the joining-up. "What are my chores?" gets "check the
app," which is correct and slightly deflating.

**Prompt injection risk:** none. There is no dynamic data.

## Option B — export and upload

The app exports a Markdown or JSON snapshot; a parent periodically uploads it to
the project.

**For:** small amount of code, no new endpoint, no key, parent stays in the loop
by construction.

**Against:** it will be uploaded twice and then never again. Any system that
depends on a busy parent performing a manual chore weekly is a system that
degrades into Option A while claiming to be more. Worse, it degrades *silently* —
the AI keeps answering confidently from a snapshot that is three months old.
Staleness that looks like freshness is the worst property on this page.

**Verdict:** the failure mode is dishonest. Not recommended.

## Option C — shared backend read-only API

The app exposes an authenticated, read-only family-context endpoint that the AI
platform calls.

**For:** always current, single source of truth, and the app keeps control of
exactly what is exposed.

**Against:** it requires a public internet-facing endpoint serving children's
data, authenticated by a credential that has to live somewhere on the client
side of a consumer AI product. That is the hard part, and it is not a
configuration detail — it is a genuinely exposed surface protecting the most
sensitive data this family has, in exchange for convenience.

It also assumes the AI platform can call arbitrary endpoints, which constrains
the product choice considerably.

**Verdict:** all the security cost of Option D with less of the benefit.

## Option D — AI inside the Birch Family App

The app owns the conversation. It assembles the system prompt plus the validated
context payload, calls the model API **server-side**, and renders the exchange
itself.

**For:**

- **The API key never leaves the server.** It lives in a Vercel environment
  variable alongside the existing MongoDB credentials — a pattern this repo
  already uses correctly.
- **The context payload is assembled in-process** from data the app already
  holds. No new endpoint, no new authentication surface, no data crossing a
  boundary it does not already cross.
- **The existing login is the access control.** Already built, already working.
- **The system prompt cannot be bypassed by starting a new chat**, because there
  is no other chat. This is the difference between a prompt that shapes behaviour
  and a prompt that is merely available.
- **Zero data retention can actually be enabled**, satisfying the under-13
  requirement — impossible to guarantee through a consumer product.
- **Sanitisation and schema validation happen before the call**, so the injection
  defences in [10](10—birch-ai-dynamic-context-schema.md) are real rather than
  aspirational.
- **The age problem largely resolves.** The family is the developer and the
  operator, with a parent-run product built for these five specific children.
  That comes with real obligations, listed below, and they are ones this family
  can genuinely meet.
- Everything is logged where parents can see it.

**Against:** the most work by a distance — a chat UI, streaming, error states,
rate limiting, cost control, and an ongoing API bill. It also makes the family
responsible for safety behaviour that OpenAI otherwise handles in its own
product, which is a real transfer of duty and should be understood as one.

**Obligations if this path is taken:** enable zero data retention before any
child's data is processed; use a current flagship model, which carries the newest
safety training; retain the minimum conversation data necessary; and keep
parental visibility genuine rather than nominal.

---

## Recommendation, and the decision taken

**Option A now — adopted. Option D as the build, later.**

**Stage 1 — Option A. This is what the family has chosen.** Upload the
Constitution and the prompt to a project on a *parent's* account and use it with
a parent present, on the shared tablet in the main living area. It requires no
code, misrepresents nobody's age, and makes the AI genuinely useful for the
things it is best at — explaining, thinking through, discussing a book — while
the app stays the authority on today. It also generates the evidence needed to
decide whether Option D is worth building at all, which is not obvious in
advance.

**Stage 2 — Option D, when Stage 1 has proved the value.** Build the companion
into the app itself. Everything needed already exists: the auth, the server, the
family data, and the schema. Do not start here. Build it once there is a real
answer to *what did the children actually use it for*, because the version
designed from that evidence will be substantially better than the version
designed from this document.

**Option B is not recommended at any stage**, for the honesty reason above.
Option C is dominated by D.

### Why not build now

The strongest argument for waiting is that the shape of the useful product is
unknown. Five children, ages 4 to 11, and no data yet on which of them will use
it or for what. A month of Stage 1 costs nothing and answers that.

The second argument is that Option A already delivers the supervision model the
family actually wants — one shared account, in a shared room, with a parent
present. Option D would reproduce that in software the family has to maintain,
and the reproduction is only worth building if it buys something the current
arrangement cannot. Right now nobody can name that thing, which is the honest
reason to wait rather than a scheduling one.

Note that this is **not** waiting for the children to get old enough. No Birch
child is being given an individual account at any age; see
[decisions.md](../decisions.md#the-ai-companion-runs-on-a-parents-account-in-the-living-room).
Under Option D the family is the operator and its under-13 obligations — zero
data retention in particular — apply for as long as there are young children
using it, so those requirements do not lapse either.

## Design requirements for Stage 2

Non-negotiable when the time comes:

- **Model API key server-side only.** Never in the client bundle, never in a
  `NEXT_PUBLIC_` variable. Server actions or route handlers only, matching the
  existing pattern in `src/lib/auth/`.
- **Zero data retention enabled** before any child interaction.
- **Read-only context.** The AI can never write to the database — not a star, not
  a chore, not a calendar event.
- **Least privilege.** The payload carries only what
  [`schemas/family-context.schema.json`](../../schemas/family-context.schema.json)
  permits, validated before every call. Validation failure means no context
  sent, not context sent unvalidated.
- **Child-visible and parent-visible context strictly separated.** Parent-only
  notes are filtered server-side and never enter a child's payload.
- **All dynamic data sanitised and treated as data.** See
  [10](10—birch-ai-dynamic-context-schema.md).
- **Prompt version and schema version logged** with every request.
- **Rate limiting and a hard monthly spend cap**, with graceful degradation to
  Mode A rather than an error screen when either is hit.
- **Offline behaviour**: the app is a PWA and already works offline. The AI
  simply is not available, and says so plainly.
- **Minimum retention.** Keep only what parents need to review behaviour, with a
  stated retention period and a delete control that works.
- **Parents can see what is retained.** Visibility that requires a database
  client is not visibility.

## What must never be built

An endpoint that exposes family data more broadly than the AI needs. A client
that holds the API key. A context payload with addresses, phone numbers, medical
information, or account credentials. Any feature that lets a child hide a
conversation from a parent. Any suggestion to a child that a conversation is
private.
