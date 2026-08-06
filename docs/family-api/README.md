# The read-only family-context API

A small, authenticated, read-only HTTP API that lets the private **Birch Family
GPT** — a Custom GPT inside the ordinary ChatGPT app, on the family's existing
paid subscription — answer questions about *today*: chores, stars, the
calendar, whose turn it is for the dogs, where everyone sits, whose birthday is
coming, and whether it is past wind-down.

```
ChatGPT app (tablet)
    ↓
Birch Family Custom GPT   — private, one shared parent account
    ↓  GPT Action, HTTPS, bearer token
GET /api/family/v1/family-context
    ↓
MongoDB Atlas + the family Google Calendar feed
```

**No OpenAI developer API is involved.** Nothing here calls the Responses API,
the Assistants API, or any billed model endpoint, and no OpenAI SDK is
installed. The model is the one the family already pays for inside ChatGPT;
this repository only answers its questions.

---

## This reverses a documented decision

[`docs/ai/13`](../ai/13—birch-ai-integration-architecture.md) evaluated exactly
this shape as **Option C** and rejected it. That reasoning has not become
wrong, and it is worth reading before touching anything here:

> it requires a public internet-facing endpoint serving children's data,
> authenticated by a credential that has to live somewhere on the client side
> of a consumer AI product.

That is still true. The credential really does sit in a ChatGPT Action
configuration; the endpoint really is on the public internet. What has changed
is the decision about whether the convenience is worth it, and that is a
judgement the family gets to make. What has not changed, and must not, is that
the risk is written down honestly rather than argued away — see
[threat-model.md](threat-model.md), which states the residual risk of each
mitigation rather than claiming the risk was removed.

---

## The files here

| File | What it is |
|---|---|
| [`birch-family-action.openapi.yaml`](birch-family-action.openapi.yaml) | The GPT Action schema. **Generated** — run `npm run api:openapi`. |
| [`setup-custom-gpt-action.md`](setup-custom-gpt-action.md) | Step by step, from generating a key to testing on the tablet. |
| [`custom-gpt-action-instructions.md`](custom-gpt-action-instructions.md) | The snippet that goes in the Custom GPT's instructions. |
| [`security.md`](security.md) | Every control, what it does, and what it does not. |
| [`threat-model.md`](threat-model.md) | Thirteen threats, rated, mitigated, and their residual risk. |
| [`privacy-data-map.md`](privacy-data-map.md) | Every field in and out, and why each one is or is not there. |
| [`operations-runbook.md`](operations-runbook.md) | Revoke, rotate, shut down, purge, roll back. |
| [`testing.md`](testing.md) | What the tests cover and how to probe a running deployment. |
| [`privacy-policy-draft.md`](privacy-policy-draft.md) | A draft, only needed if the GPT is ever shared by link. |

---

## The endpoint

```
GET /api/family/v1/family-context
GET /api/family/v1/family-context?child=clara
GET /api/family/v1/health
```

`GET` and `HEAD` only. There is no write endpoint and there is no code path
that writes — the route modules export exactly two functions, and
`tests/family-api-openapi.test.ts` asserts that on every run.

With no `child`, the response carries family-wide information and **no child's
chores or stars at all** — not an empty list, but an explicit
`responsibilities.availability: "requires-child"`, so the model cannot report
"no chores" when it means "did not ask".

---

## The code

| File | Job |
|---|---|
| `src/app/api/family/v1/*/route.ts` | Two thin route handlers. `GET` and `HEAD`. |
| `src/lib/family-api/handler.ts` | The request pipeline. The order of its stages *is* the design. |
| `src/lib/family-api/context.ts` | `buildChildVisibleFamilyContext` — the privacy boundary. Pure. |
| `src/lib/family-api/sources.ts` | Reads the app's own data. Makes no privacy decisions. |
| `src/lib/family-api/auth.ts` | Bearer verification, constant time, two keys during a rotation. |
| `src/lib/family-api/rate-limit.ts` | The free, per-instance layer. Honest about being per-instance. |
| `src/lib/family-api/usage.ts` | The durable daily ceilings that bound the bill. |
| `src/lib/family-api/sanitise.ts` | Prompt-injection defence on every free-text field. |
| `src/lib/family-api/time.ts` | America/Boise, because the server is in UTC and Rexburg is not. |
| `src/lib/family-api/openapi.ts` | The Action schema, generated from the same constants. |

The two halves worth understanding separately are **`context.ts`**, which
decides what may leave, and **`handler.ts`**, which decides what work a request
is allowed to cause. Neither can do the other's job.

---

## Turning it on

It is **off**. `BIRCH_FAMILY_API_ENABLED` must be the exact string `true`;
anything else — unset, empty, `TRUE`, `1` — answers 503 to everything.

```bash
npm run api:key                    # generate a 256-bit key
# put it in BIRCH_FAMILY_API_KEY, locally and in Vercel
# set BIRCH_FAMILY_API_ENABLED=true
npm run db:seed                        # adds the usage-counter TTL index
```

Then [setup-custom-gpt-action.md](setup-custom-gpt-action.md).

---

## Cost

Near zero in ordinary use, and bounded under attack — which is a different and
more important claim. Both are set out with numbers in
[security.md](security.md#cost). The short version: this adds no new hosting,
no new managed service, and a few dozen tiny MongoDB writes a day; the global
circuit breaker caps the whole thing at 1,000 requests a day whatever happens.

It is **not** free. It runs on the Vercel plan and the Atlas cluster the app
already pays for, and a sufficiently determined attacker can still consume
Vercel invocations before the application-layer limits see them. That is what
the edge configuration in [security.md](security.md#at-the-edge) is for, and it
is configuration a person has to apply — it cannot be committed here.
