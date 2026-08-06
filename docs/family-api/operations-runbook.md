# Operations runbook

What to do, in order, when something is wrong. Written to be followed at
eleven at night without reading anything else first.

---

## Emergency: shut it off now

**One variable, checked before authentication, before the feature flag, before
anything reads a database.**

1. Vercel → the project → Settings → Environment Variables.
2. Set `BIRCH_FAMILY_API_DENY_ALL` = `true` (Production).
3. Redeploy — Deployments → the current one → ⋯ → **Redeploy**. Environment
   changes need a deployment to take effect.

Every request to `/api/family/v1/*` now answers 503, including one presenting
a valid key. The rest of the app is unaffected: no page changes, nobody is
signed out, no data moves.

**Verify:**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $BIRCH_FAMILY_API_KEY" \
  https://family.nathanbirch.one/api/family/v1/family-context
# expect 503
```

**Turning it back on is a separate, deliberate act:** set the variable to
`false` (or delete it) and redeploy. It is a different variable from
`BIRCH_FAMILY_API_ENABLED` precisely so that recovering from an incident
cannot be done by muscle memory.

---

## Revoke the key

Use this when the key may have leaked but the endpoint itself is fine.

1. Vercel → Environment Variables → **delete** `BIRCH_FAMILY_API_KEY` and
   `BIRCH_FAMILY_API_KEY_NEXT`.
2. Redeploy.

Every request now answers 401 — the same 401 a wrong key gets, so the holder of
the leaked key learns nothing about whether it was ever valid. There is no
token cache and no session to expire; revocation is complete the moment the
deployment is live.

Then either rotate (below) or leave it off.

---

## Rotate the key

No downtime. Four steps, and step 3 is the one that makes it safe.

```bash
npm run api:key      # 43 base64url characters, 256 bits
```

1. **Publish the new key as the incoming one.** Vercel → set
   `BIRCH_FAMILY_API_KEY_NEXT` to the new value → redeploy. Both keys now work.
2. **Update ChatGPT.** GPT editor → Actions → Authentication → replace the API
   key with the new value → Save.
3. **Confirm the switch happened.** Ask the GPT a question, then read the logs
   (Vercel → Logs, filter `family-api`). Look for:

   ```json
   {"tag":"family-api","keyVersion":"v-next", ...}
   ```

   Do not proceed until you have seen `v-next`. If it still says `v-current`,
   ChatGPT is still holding the old key and step 4 would break it.
4. **Retire the old key.** Move the new value into `BIRCH_FAMILY_API_KEY`, delete
   `BIRCH_FAMILY_API_KEY_NEXT`, redeploy.

**Cadence.** No fixed schedule is enforced. Rotate whenever the key has been
displayed on a screen somebody else could see, whenever the parent account's
password changes, and at least when reviewing
[threat-model.md](threat-model.md).

---

## Lower every rate limit, fast

All limits are environment variables and none needs a code change. Set them in
Vercel and redeploy:

| Variable | Default | Emergency value |
|---|---|---|
| `BIRCH_FAMILY_API_BURST_PER_MINUTE` | 10 | 2 |
| `BIRCH_FAMILY_API_SUSTAINED_PER_HOUR` | 60 | 10 |
| `BIRCH_FAMILY_API_DAILY_PER_CREDENTIAL` | 300 | 25 |
| `BIRCH_FAMILY_API_DAILY_GLOBAL` | 1000 | 50 |
| `BIRCH_FAMILY_API_AUTH_FAIL_PER_MINUTE` | 5 | 2 |
| `BIRCH_FAMILY_API_AUTH_FAIL_BLOCK_SECONDS` | 900 | 3600 |

Setting `BIRCH_FAMILY_API_DAILY_GLOBAL=0` closes the endpoint through the circuit
breaker while leaving authentication working — useful if you want the 503 to
come from the ceiling rather than from the kill switch, so the logs show which.

An unparseable value falls back to the compiled default rather than removing
the ceiling, so a typo cannot open anything up.

---

## Purge the response cache

The cache is in-process and lives 45 seconds. **Any redeploy purges it**,
because the process is replaced. There is nothing to clear by hand and no
shared cache anywhere.

If a wrong answer persists for longer than a minute, the cache is not the
cause — check `dataFreshness.lastUpdatedAt` in the response and the underlying
collection.

---

## Identify a compromised credential

Vercel → Logs → filter for `family-api`. Each line is JSON:

```json
{"tag":"family-api","correlationId":"a1b2c3d4e5f60718",
 "endpoint":"/api/family/v1/family-context","method":"GET","status":200,
 "durationMs":84,"keyVersion":"v-current","cache":"miss",
 "sizeBucket":"1k-8k","childRequested":true}
```

What to look at, in order:

- **`status: 401` in volume.** Somebody is guessing. Expected background noise
  on any public endpoint; a sustained run with `"limit":"auth-fail"` following
  it means the limiter is doing its job.
- **`status: 200` at times nobody is using the tablet.** This is the signal
  that matters. The family's traffic is bursty and diurnal; steady overnight
  200s mean the key is being used by somebody else.
- **`"limit":"daily"` or `"limit":"global"`.** A ceiling was hit. If nobody in
  the house was using it, treat the key as compromised.
- **`keyVersion` you did not expect.** `v-next` when no rotation is in
  progress means somebody has the incoming key.

The logs deliberately contain no IP address, so you cannot attribute traffic to
a source from here. That was the trade — see
[security.md](security.md#errors-and-logging). If attribution matters during a
live incident, Vercel's own platform logs have it.

**If you conclude the key is compromised:** deny-all first, then revoke, then
rotate. In that order — deny-all is one variable and takes effect for
everything.

---

## Alert thresholds

None of these is wired up; they are what to configure and what number to use.

| Where | Alert on | Threshold |
|---|---|---|
| Vercel → Usage | Function invocations | 2× the trailing weekly average |
| Vercel → Billing | Spend | 50% and 75% of the limit, with **pause** at 100% |
| Vercel → Firewall | Rule triggers on `/api/family/` | any sustained run |
| Atlas → Alerts | Connections | above the cluster's normal high-water mark |
| Atlas → Alerts | Read throughput | 2× normal |

The single most valuable one is the **spend limit set to pause**. Without it,
"bounded requests" is not the same as "bounded bill".

---

## Roll back

The API is additive: two new route files, one new library directory, one new
collection, one line changed in `src/proxy.ts`, and one new index. Nothing
existing changed behaviour.

**Fastest rollback — no code:** set `BIRCH_FAMILY_API_ENABLED=false` and
redeploy. The routes still exist and answer 503; the rest of the app is exactly
as it was.

**Full rollback — code:** Vercel → Deployments → the last deployment before the
feature → ⋯ → **Promote to Production**. Instant, and does not need a git
revert.

**Removing it permanently:** delete `src/app/api/family/`,
`src/lib/family-api/`, `docs/family-api/`, the `chatgpt*` tests and scripts, the
`familyApiUsage` entry in `src/config/db.ts`, and restore the proxy matcher.
Then drop the `familyApiUsage` collection, which holds nothing but integers.

---

## Disable the action in ChatGPT

Separate from anything on the server, and worth doing as well as, not instead
of.

1. chatgpt.com → GPTs → Birch Family GPT → **Edit**.
2. **Actions** → the action → **Delete**. Or open its authentication and clear
   the API key.
3. Save.

The GPT keeps working as an ordinary assistant. Per its instructions it will
say that live family information is unavailable and point the children at the
app, rather than inventing an answer — which is exactly the behaviour tested in
[testing.md](testing.md).

**Also check the sharing setting while you are in there.** It should say
**Only me**.

---

## Routine checks

| When | What |
|---|---|
| Weekly, while this is new | Skim the logs for overnight 200s. |
| After any response-shape change | `npm run api:openapi`, then `npm run check`. |
| After any deploy touching this | `npm run api:probe -- https://family.nathanbirch.one`. |
| Quarterly | Re-read [threat-model.md](threat-model.md) and update any row whose residual risk has changed. |
| Quarterly | Confirm the GPT is still **Only me**. |
| Whenever OpenAI changes Actions | Re-verify [setup-custom-gpt-action.md](setup-custom-gpt-action.md) against the real screens. |
