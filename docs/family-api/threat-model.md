# Threat model

Fifteen threats against the ChatGPT read-only API. Each is rated for
likelihood and impact **before** mitigation, then lists what is actually done
and what is left over.

The residual-risk column is the reason this document exists. A threat model
that ends every row with "mitigated" is a marketing document.

**Ratings.** Likelihood and impact: Low / Medium / High. Impact is measured
against this family, not against a business — "High" here means a child's
information reaching a stranger, or the family losing the app.

**What is in scope.** The endpoint, the credential, the data it returns, and
the money it can cost. **Out of scope:** the security of ChatGPT itself, of
Vercel, of MongoDB Atlas, and of the family's Google account. Those are trusted
by construction, and if any is compromised this document does not help.

---

## Summary

| # | Threat | Likelihood | Impact | Residual |
|---|---|---|---|---|
| 1 | Stolen or leaked API key | Medium | High | **Medium** |
| 2 | Credential brute force | High | High | Low |
| 3 | Application-layer DoS | Medium | Medium | **Medium** |
| 4 | Volumetric DDoS | Low | Medium | **Medium** |
| 5 | Database resource exhaustion | Low | Medium | Low |
| 6 | Prompt injection through family data | **High** | Medium | **Medium** |
| 7 | Identifier enumeration | Low | Low | Low |
| 8 | Sensitive-data leakage through the projection | Medium | High | Low |
| 9 | Leakage through logs | Medium | Medium | Low |
| 10 | Cache poisoning / cross-child confusion | Low | High | Low |
| 11 | Misconfigured CORS | Low | Medium | Low |
| 12 | Runaway infrastructure cost | Medium | Medium | **Medium** |
| 13 | Stale data presented as current | Medium | Medium | Low |
| 14 | The GPT shared beyond the family | Medium | High | **Medium** |
| 15 | Compromised parent account | Low | High | **High** |

Six rows are still Medium or High after mitigation. Those six are the honest
subject of this page.

---

## 1. Stolen or leaked API key

**Likelihood Medium · Impact High · Residual Medium**

The credential necessarily lives inside a ChatGPT Action configuration on a
parent's account. That is not a secret manager. It can also leak through a
screenshot, a copy-paste into the wrong window, or a Vercel environment
variable exposed by some future misconfiguration.

*Mitigations.* A dedicated credential that grants this endpoint and nothing
else — it signs nobody in, reads no other collection, and writes nothing. 256
bits of entropy. Never logged, never returned, never in the OpenAPI document,
never in client-side code (`tests/family-api-route.test.ts` and
`tests/family-api-openapi.test.ts` both assert this). Read-only by construction,
so a thief can read but not change. Rate-limited to 300 requests a day even
when valid. Rotation with overlap, and immediate revocation.

*Residual.* **A stolen key reads this family's child-visible context until
somebody notices and revokes it.** That is chores, stars, seven days of
calendar titles, birthdays and first names — not addresses, contact details or
credentials, but genuinely a picture of five children's week. Detection is the
weak point: 300 requests a day is well within an attacker's budget and would
not obviously look wrong in a log nobody reads daily.

*What would reduce it further:* an alert on daily-count anomalies, and shorter
scheduled rotations. Neither is built.

---

## 2. Credential brute force

**Likelihood High · Impact High · Residual Low**

A public HTTPS endpoint on a known domain will be probed. This is the most
*likely* threat on the page.

*Mitigations.* 256-bit key — not guessable in any realistic time. Constant-time
comparison over fixed-length digests, so no timing oracle. Identical 401 for
every failure mode, so no oracle about what was wrong. Five failures per minute
per source, then a 15-minute block. **Failed authentication never touches the
database**, so the attack cannot be turned into a cost. The limiter's key map
is bounded and refuses new keys when full rather than evicting existing blocks.

*Residual.* Low. The per-instance limiter can be diluted across Vercel
instances, but the entropy is doing the work here, not the limiter. Guessing a
256-bit key is not a threat that rate limiting needs to solve.

---

## 3. Application-layer DoS

**Likelihood Medium · Impact Medium · Residual Medium**

Enough well-formed requests to exhaust Vercel invocations or Atlas
connections.

*Mitigations.* Rejection happens at the cheapest possible stage. Bounded
response size, bounded record counts, no caller-controlled ranges, an 8-second
whole-request deadline, per-source timeouts with fallbacks, a `maxTimeMS` on
the counter query, a 45-second response cache, and durable daily ceilings
including a global circuit breaker.

*Residual.* **Medium, until the Vercel firewall rule in
[security.md](security.md#at-the-edge) is applied.** Every request still costs
one function invocation before the application can refuse it, and the
in-process limiters are per-instance. The edge rule is the fix and it is
configuration, not code, so it cannot be committed here — which means this row
stays Medium until somebody logs in and clicks.

---

## 4. Volumetric DDoS

**Likelihood Low · Impact Medium · Residual Medium**

*Mitigations.* Vercel's platform-level protection, which exists on every plan.

*Residual.* **Medium, and honestly assessed: a free or Hobby tier does not
come with unlimited DDoS protection**, and this family is not going to be the
customer a provider spends money defending. The realistic outcome of a serious
volumetric attack is that `family.nathanbirch.one` is unavailable for a while
and — if spend limits are not set — that it costs money first. Setting the
spend limit with a *pause* action converts the second half of that into the
first half, which is the better failure.

Nothing in this repository can change this row.

---

## 5. Database resource exhaustion

**Likelihood Low · Impact Medium · Residual Low**

*Mitigations.* No new query shapes — every read is one the dashboard already
performs, against indexes that already exist. No caller-controlled query, no
regex, no sort, no arbitrary date range, no aggregation. Two of the three
collections read have two and five documents in them. The one indexed lookup is
by `weekStart`. Unauthenticated traffic never reaches the database at all. The
counter write is a single `_id`-addressed upsert with a 2-second cap.

*Residual.* Low. Bounded above by the global daily ceiling, which is 1,000
requests — a rounding error against this cluster.

---

## 6. Prompt injection through family data

**Likelihood High · Impact Medium · Residual Medium**

Realistically this is not malicious. It is a calendar event with odd text in
it, or — much more likely — Hannah, who is eleven, working out that typing
instructions into a chore name changes what the assistant says. Discovering
that this works would be a genuinely bad lesson.

*Mitigations.* Structured JSON, never concatenated prose. Sanitisation: NFKC
normalisation; control, zero-width and bidi characters removed; HTML and
scripts stripped; URLs replaced; markdown targets dropped; ChatML and fenced
delimiters removed; role markers removed. Length caps of 120 and 200
characters. A closed schema. `securityNotice` on every response, and an Action
description that tells the model the payload is data.

*Residual.* **Medium, and this is the row least amenable to engineering.** The
sanitiser removes *shapes*, not *words* — "ignore your instructions" survives
as plain text, because a filter aggressive enough to remove it would also
mangle ordinary family writing, and a chore label that silently changes is a
worse bug than the one being prevented. A well-crafted 120-character payload in
ordinary prose can still reach the model, and no server-side control can stop a
model from being persuaded by text it is shown.

What actually bounds the damage is that this API is read-only and returns only
child-visible data. A successful injection can make the assistant say something
odd. It cannot make it change a star, read a parent's notes, or reveal the key,
because none of those is reachable from here.

*Mitigation that is not technical:* a parent in the room, which is what
[`docs/ai/12`](../ai/12—birch-ai-chatgpt-setup.md) says the supervision model
actually is.

---

## 7. Identifier enumeration

**Likelihood Low · Impact Low · Residual Low**

*Mitigations.* The `child` parameter is an allowlist of five first names, not a
database lookup. It never reaches MongoDB and never becomes part of a query.
There is no ObjectId anywhere in the API surface. Chore ids are hand-written
slugs from `config/stars.ts` — `tidy-room`, `feed-bella` — which enumerate to
nothing. An unknown value returns a generic 404 that names nobody.

*Residual.* Low, and stated plainly: the five names are in the OpenAPI document
because the GPT needs them. That is not a leak — they are the children's first
names, already in the app, and there is nothing to enumerate *to*.

---

## 8. Sensitive-data leakage through the projection

**Likelihood Medium · Impact High · Residual Low**

The likelihood is Medium because this is a *future* risk: today's projection is
correct, and the danger is somebody adding a field in six months.

*Mitigations.* One pure function, `buildChildVisibleFamilyContext`, with every
field named and copied individually — no entity is ever spread or serialised,
so adding a column to a document cannot leak it. Calendar `location` and
`description` are dropped explicitly, because those are where the street
address and the appointment details live. Parents' birth years never appear.
A child's chores are only read when that child is named.
`tests/family-api-context.test.ts` serialises the whole response and greps it for
seventeen forbidden strings, so a future field that leaks any of them fails
even if nobody wrote a test for that field.

*Residual.* Low. The remaining risk is a reviewer approving a genuinely new
field. [privacy-data-map.md](privacy-data-map.md) exists to make that a
deliberate act.

---

## 9. Leakage through logs

**Likelihood Medium · Impact Medium · Residual Low**

*Mitigations.* One structured line per request. Never the `Authorization`
header, never a key, never which child was asked about, never chore or calendar
text, never the query string, never the body, never a raw IP. Addresses are
HMACed with a per-boot random salt that is never persisted. Response size is
bucketed rather than exact. A test spies on the console and asserts the key and
the child's name are absent.

*Residual.* Low. Vercel's platform logs record request paths independently of
this application, and a path is `/api/family/v1/family-context` — the query
string is where the child's name would be, and Vercel does log query strings.
**Mitigation applied: the child is sent as `?child=clara`, which does put a
first name in a platform log.** That was accepted rather than solved: the
alternative is a POST body, and this API is deliberately GET-only. A first name
in a log the parent account controls is a small exposure and is named here
rather than left unstated.

---

## 10. Cache poisoning and cross-child confusion

**Likelihood Low · Impact High · Residual Low**

Serving Clara's chores under Emily's key would be a real privacy failure inside
the family, which is where these things actually matter.

*Mitigations.* The cache key is built from the **resolved** child id, after the
allowlist, so it is only ever one of six literal values — never the raw query
string, which could be `Clara`, `clara%20` or `clara&child=emily`. Unknown or
repeated parameters are a 400 before any key is built. The cache is in-process
and per-instance, so there is no shared cache to poison. Responses are
`Cache-Control: private`, so no intermediary may store them. Errors are never
cached.

*Residual.* Low. `tests/family-api-route.test.ts` asserts each child gets their own
data and that two spellings of one name share one entry rather than creating
two.

---

## 11. Misconfigured CORS

**Likelihood Low · Impact Medium · Residual Low**

*Mitigations.* There are no CORS headers. Not narrow ones — none. A test
iterates the response headers and asserts nothing beginning `access-control`
appears. CORS is not used as an authentication mechanism anywhere in this API.

*Residual.* Low.

---

## 12. Runaway infrastructure cost

**Likelihood Medium · Impact Medium · Residual Medium**

*Mitigations.* Rejection before I/O. A global circuit breaker at 1,000
requests a day that answers 503 rather than continuing to work. Bounded
response size. A response cache. No new managed service. Every ceiling
adjustable from the dashboard without a deploy.

*Residual.* **Medium.** Two gaps, both outside this repository: without the
Vercel firewall rule, refused requests still cost invocations; and without a
spend limit set to *pause*, "bounded requests" is not "bounded bill". Both are
in [security.md](security.md#at-the-edge) and both need a person.

---

## 13. Stale data presented as current

**Likelihood Medium · Impact Medium · Residual Low**

This is the failure mode [`docs/ai/13`](../ai/13—birch-ai-integration-architecture.md)
called *dishonest* — an assistant answering confidently from data that is three
weeks old.

*Mitigations.* A 45-second cache, deliberately short. `generatedAt` and
`lastUpdatedAt` on every response. `dataFreshness.status` of `fresh`, `stale`
or `unavailable`, which goes `stale` on age *or* on any degraded source, and
`degradedSources` naming which. `calendar.availability` distinguishing "not
connected" from "could not read". Action descriptions and GPT instructions that
both say: if it is stale or the call failed, say so and point at the app.

*Residual.* Low on the API's side, because the signal is present and accurate.
Whether the model *acts* on it is prompt-level and defeasible, which is the
same caveat as row 6.

---

## 14. The GPT shared beyond the family

**Likelihood Medium · Impact High · Residual Medium**

A Custom GPT can be shared by link with two clicks, and "anyone with the link"
is a setting somebody could choose by accident.

*Mitigations.* [setup-custom-gpt-action.md](setup-custom-gpt-action.md) says to
keep it private and says why. The data returned is child-visible only. The
credential is not visible to somebody merely *using* a shared GPT — only to
somebody who can open its editor.

*Residual.* **Medium.** A shared link would let strangers ask the Birch
children's assistant what Clara's chores are and what is on the family calendar
this week. Nothing on the API side can detect or prevent this, because the
requests would be indistinguishable from legitimate ones. The only controls are
the sharing setting itself and the family's own discipline. Worth re-checking
whenever the GPT is edited.

---

## 15. Compromised parent account

**Likelihood Low · Impact High · Residual High**

Somebody with the parent's ChatGPT account, Vercel account or GitHub account.

*Mitigations.* None that are meaningful, and it would be dishonest to list
any. The Vercel account holds the environment variables; the ChatGPT account
holds the Action configuration; the GitHub account can deploy anything.

*Residual.* **High, and unavoidable at this scale.** This risk is not created
by this feature — it already exists for the app, the database and the family
calendar — but this feature does add one more thing behind that door. Two-factor
authentication on all three accounts is the whole of the defence, and it is a
personal-security matter rather than an engineering one.

---

## Reviewing this document

Re-read it whenever: a field is added to the response, a limit is changed, the
hosting plan changes, OpenAI changes how Actions authenticate, or the GPT's
sharing setting is touched. If a row's residual risk has changed, change the
row — a threat model that is not maintained is worse than none, because it
gives a false sense of having thought about it.
