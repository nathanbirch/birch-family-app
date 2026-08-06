# Setting up the GPT Action

From nothing to a working Birch Family GPT on the tablet.

> **ChatGPT's interface changes often.** Menu names and the exact position of
> the Actions panel move every few months. Where this document and the screen
> disagree, believe the screen — the *shape* of the steps (create an action,
> paste a schema, choose API key, choose Bearer) has been stable, the labels
> have not. Verified against ChatGPT's web GPT editor.

> **None of the steps below is done programmatically.** ChatGPT has no
> supported API for configuring a Custom GPT, and this repository does not try.
> Everything in the ChatGPT half is done by a person in a browser.

---

## Before you start

You need:

- The app deployed to an HTTPS domain — `https://family.nathanbirch.one`.
- Access to the Vercel project's environment variables.
- A ChatGPT account with Custom GPT creation (Plus, Pro, Team or Enterprise).
  **The family's existing subscription.** No OpenAI developer account, no API
  key from `platform.openai.com`, and no billing beyond the subscription
  already being paid for.

---

## 1. Generate the bearer secret

```bash
npm run api:key
```

32 random bytes as base64url — 43 characters, 256 bits. Generate it on your own
machine; do not use an online generator, and do not reuse any other credential
in this app.

Copy it somewhere temporary. You will paste it into exactly two places and then
forget it.

---

## 2. Store it on the server

**Vercel → the project → Settings → Environment Variables.** Add:

| Name | Value | Environments |
|---|---|---|
| `BIRCH_FAMILY_API_KEY` | the key from step 1 | Production only |
| `BIRCH_FAMILY_API_ENABLED` | `true` | Production only |

**Production only, deliberately.** A preview deployment with the same key is a
second copy of this endpoint on a URL nobody is watching. Leave previews with
the API disabled.

Locally, put the same two lines in `.env` — which is gitignored and must stay
that way.

> Never commit it. Never put it in the OpenAPI document. Never put it in
> anything with `NEXT_PUBLIC_` in the name. Never paste it into a screenshot.

---

## 3. Create the counter index and deploy

```bash
npm run db:seed     # adds the TTL index the rate-limit counters need
git push            # Vercel builds and promotes main
```

The seed script is safe to re-run; it creates indexes and leaves existing
documents alone.

---

## 4. Check the server before touching ChatGPT

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://family.nathanbirch.one/api/family/v1/family-context
# expect 401

curl -sS -H "Authorization: Bearer $BIRCH_FAMILY_API_KEY" \
  https://family.nathanbirch.one/api/family/v1/health
# expect {"status":"ok"}

BIRCH_FAMILY_API_KEY=... npm run api:probe -- https://family.nathanbirch.one
# expect every check to pass
```

If the first command returns anything other than 401 — in particular a 200 with
HTML in it — stop. A 200 with HTML means the proxy is redirecting to `/login`;
see [security.md](security.md#the-proxy).

---

## 5. Create the Custom GPT

1. Go to **chatgpt.com** on the web. The GPT editor is web-only; you cannot
   create or configure a GPT from the mobile app.
2. Open the sidebar → **GPTs** → **Create**.
3. Switch to the **Configure** tab. (The **Create** tab's chat-based builder
   works, but Configure is where the Actions panel lives.)
4. **Name:** `Birch Family GPT`.
5. **Description:** something plain — "Answers the Birch children's questions
   about today, using the Birch Family App."
6. **Instructions:** paste the whole of
   [custom-gpt-action-instructions.md](custom-gpt-action-instructions.md),
   combined with the family's own system prompt from
   [`docs/ai/11`](../ai/11—birch-ai-system-prompt.md).
7. **Capabilities:** turn off anything not needed. Web browsing, image
   generation and code interpreter are not required for this and each is
   another surface.

---

## 6. Add the action

1. Scroll to **Actions** → **Create new action**.
2. **Schema:** open
   [`birch-family-action.openapi.yaml`](birch-family-action.openapi.yaml),
   copy the whole file, paste it into the schema box. (Or use **Import from
   URL** if the file is reachable — it is not, in a private repo, so paste.)
3. Confirm ChatGPT lists **two** operations, both `GET`:
   `getBirchFamilyContext` and `getBirchFamilyApiHealth`. If it lists anything
   else, the wrong file was pasted.
4. Check the server URL shows `https://family.nathanbirch.one`. The schema
   declares it as a variable with that default.

---

## 7. Configure authentication

1. Next to **Authentication**, click the gear.
2. Choose **API Key**.
3. **Auth Type:** **Bearer**.
4. **API Key:** paste the secret from step 1.
5. Save.

That is the second and last place the secret lives. Delete your temporary copy
now.

ChatGPT will send `Authorization: Bearer <key>` on every call. It does not
display the key again after saving; to change it you replace it.

---

## 8. Set the privacy policy field, if asked

ChatGPT requires a privacy-policy URL only when a GPT is **shared by link or
published**. For a private GPT the field can stay empty.

If you do need one, [privacy-policy-draft.md](privacy-policy-draft.md) is a
starting point — but read step 10 first, because needing this field is a sign
you are about to do something worth reconsidering.

---

## 9. Test in the preview pane

The preview panel is on the right of the editor. Try, in order:

| Ask | Expect |
|---|---|
| "This is Clara. What are my chores today?" | It calls the action with `child=clara` and lists her real rows with their real status. |
| "What's on the calendar today?" | Today's real events, or a plain statement that no calendar is connected. |
| "Whose turn is it for the dogs tonight?" | Tonight's real pet assignment. |
| "Whose birthday is coming up?" | Only birthdays inside the reminder window, and **no ages**. |
| "What are Emily's chores?" *(asked as Clara)* | It should not silently answer for Emily — chores are per child and it must be told who is asking. |
| "How old is Daddy?" | It does not know, and should say so. That field does not exist. |

The first time it calls the action ChatGPT will ask you to allow it. Choose
**Always allow** for this GPT so the children are not prompted.

**Then check the raw response once.** Expand the action call in the preview and
read the JSON. Confirm with your own eyes that there is no address, no phone
number, no email, no parent-only note, and no other child's data. Do this once
now, and again any time the response shape changes.

---

## 10. Keep it private

**Sharing → Only me.** Not "anyone with the link", not "published".

This matters more than it looks. A link-shared GPT would let a stranger ask the
Birch children's assistant what Clara's chores are and what is on the family
calendar this week, and the API cannot tell those requests apart from real ones
— see [threat-model.md](threat-model.md#14-the-gpt-shared-beyond-the-family).
Re-check this setting every time you edit the GPT; it is one dropdown away.

---

## 11. Test on the tablet

1. Open ChatGPT on the tablet, signed in to the **same parent account**. A GPT
   set to "Only me" is not visible to any other account.
2. Sidebar → **GPTs** → the Birch Family GPT. Pin it so it is one tap away.
3. Ask the same questions from step 9.
4. Confirm the answers match what the app shows on the same device.

The arrangement is unchanged from
[`docs/ai/12`](../ai/12—birch-ai-chatgpt-setup.md): one shared parent account,
on the shared tablet, in the main living area, with a parent present. No child
has an account.

---

## 12. Memory and Custom Instructions

**Turn memory off** for the account. It persists one child's disclosures into
another child's conversation on a shared device, and it makes the assistant's
behaviour drift from what these documents specify.

**A Custom GPT does not use saved memory or the account's ordinary Custom
Instructions.** Its behaviour comes from its own Instructions field, and its
knowledge of *today* comes from this API. That division is the point:

- Stable behaviour — tone, the spoiler rule, the safety rules — belongs in the
  **GPT instructions**.
- Live family state — chores, stars, the calendar — comes from the **action**,
  fresh on every call.

Do not put family facts in the instructions. They go stale silently, which is
the failure mode [`docs/ai/13`](../ai/13—birch-ai-integration-architecture.md)
calls dishonest.

---

## 13. Revoking and rotating

Full procedures are in
[operations-runbook.md](operations-runbook.md). The one-line versions:

**Revoke immediately.** Vercel → delete `BIRCH_FAMILY_API_KEY` and
`BIRCH_FAMILY_API_KEY_NEXT` → redeploy. The endpoint refuses everyone. Or, faster to
reason about: set `BIRCH_FAMILY_API_DENY_ALL=true`, which is checked before
authentication.

**Rotate with no downtime.**

1. `npm run api:key` → put it in `BIRCH_FAMILY_API_KEY_NEXT`, redeploy.
2. Paste the new key into the Custom GPT's action authentication.
3. Watch the logs report `"keyVersion":"v-next"`.
4. Move the new key to `BIRCH_FAMILY_API_KEY`, clear `BIRCH_FAMILY_API_KEY_NEXT`,
   redeploy.

**Disable the action in ChatGPT.** Editor → Actions → delete the action, or
clear its authentication. The GPT keeps working; it simply loses live data and
— per its instructions — says so.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| ChatGPT reports a 401 | The key in the Action does not match the environment, or the deploy that set it has not finished. |
| 503 on everything | `BIRCH_FAMILY_API_ENABLED` is not the exact string `true`, or deny-all is on. |
| A 200 containing HTML | The proxy is redirecting to `/login`. `api/family/` must be excluded from its matcher. |
| 429 during testing | The burst limit. Wait a minute; it is 10 per minute by design. |
| `dataFreshness.status` is `stale` | A source degraded. `degradedSources` names which. |
| `calendar.availability` is `not-configured` | `CALENDAR_ICS_URL` is not set in this environment. |
| ChatGPT will not accept the schema | The wrong file was pasted, or it was edited by hand. Regenerate with `npm run api:openapi`. |
