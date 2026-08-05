# Maintenance

What goes stale, how to change it safely, and how often to look.

## What is timeless and what is not

**Timeless — edit rarely and deliberately.** The Constitution's 17 chapters, the
two mottoes, the eight values, the fifteen mantras, and the core safety principle
in [02](02—birch-ai-core-instructions.md). These are the family's settled
positions. Changing one is a family decision, not a maintenance task.

**Slow-moving — review yearly.** The per-child guidance in
[03](03—birch-ai-child-profiles.md), the response style, the reasoning approach,
and `config/ai-policy.json`. Children change; a description of Clara written when
she was eight will be wrong when she is eleven.

**Fast-moving — verify at every review.** OpenAI's age policy, parental controls,
and product behaviour ([12](12—birch-ai-chatgpt-setup.md)); the integration
recommendation ([13](13—birch-ai-integration-architecture.md)); model
availability and pricing.

**Dynamic — never hardcoded anywhere.** Ages, chores, rotations, stars, calendar,
pets, announcements. These come from the app or from nowhere. If a number that
changes ever appears in a document here, it is a bug.

## Ages and birthdays

Ages are computed, never stored. `config/family-profile.json` holds birth dates;
the app calculates from the current date. Nothing needs doing on a birthday, and
if something does, that is the bug to fix.

Birthdays live in `config/family-birthdays.json`, including the reminder windows,
so a parent can retune how early the AI starts mentioning them without touching
the prompt.

## Adding a person, pet, chore, or tradition

**A new child.** Add to `config/family-profile.json` and
`config/family-birthdays.json`, add a `PersonId` and roster entry in
`src/config/family.ts`, add a section to
[03—birch-ai-child-profiles.md](03—birch-ai-child-profiles.md), add the birth
date to §5 of the prompt, and bump the prompt version. The seating rotation
assumes five children and will need attention — see `docs/rotation.md`.

**A new pet.** `config/family-profile.json`, plus the pet rotation in the
database (`docs/pets.md`). The AI needs no per-pet knowledge; it reads the name
from context.

**A new chore.** App only. The AI never has a chore list of its own.

**A new tradition.** Add to `traditions.protect` in `config/ai-policy.json` if it
needs protecting, and to
[16—traditions.md](../constitution/16—traditions.md) if it belongs in the
Constitution. The `neverInvent` rule applies automatically.

## Changing a value or motto

A family decision, made away from a keyboard. Once made, it lands in three
places and all three must move together: the Constitution chapter, the config
JSON, and §4 of the prompt. Check `src/config/motto.ts` too — the app displays
mottoes on the home screen, and the note there about re-anchoring the rotation
applies.

## Adding an approved quotation

1. Find it in the original talk on `churchofjesuschrist.org` or
   `speeches.byu.edu`. Not a search result summary, not a quotation site — the
   talk.
2. Check it word for word, including punctuation.
3. Check the speaker is the author and not somebody quoting somebody else. This
   is where two of the three historical errors came from.
4. Check their calling **at the time they said it**.
5. Add to `src/config/mantras.ts` and/or the relevant Constitution chapter.
6. Record it in
   [quotation-verification.md](../editorial/quotation-verification.md).
7. Run `npx vitest run tests/mantras.test.ts`.

The full account of what went wrong before is in the verification report, and it
is worth reading once before adding anything.

## Versioning the prompt

The prompt in [11](11—birch-ai-system-prompt.md) carries a semantic version in
its heading and in the prompt text itself.

- **Patch** — wording, an added example, a clarification that changes no
  behaviour.
- **Minor** — a new rule, or a materially changed one.
- **Major** — a restructure, or a change to the priority ordering.

Every deployed request logs the prompt version and the context schema version.
Without that, a behaviour regression cannot be traced to a change.

## Testing a change

1. Edit [11](11—birch-ai-system-prompt.md) and bump the version.
2. Run the full suite in [14](14—birch-ai-test-cases.md).
3. Pay particular attention to the cases near what you changed **and** to the
   safety cases (27–30) regardless — safety behaviour is what degrades when a
   prompt gets longer.
4. Re-upload to the project, or deploy, only after the suite passes.
5. Record the version, the date, and what changed.

**Never edit the live project instructions directly.** The repository is the
source of truth; the project is a copy. An undocumented edit made on a tablet at
nine in the evening is the change nobody will be able to explain in six months.

## Rolling back

Because the prompt is a file in git, rollback is `git revert` plus a re-upload.
This is the main practical argument for keeping it here rather than only in the
product.

If a regression appears and the cause is unclear, revert first and investigate
afterward. It runs in front of children.

## Auditing behaviour

**Read the conversations.** The most valuable audit is a parent reading what the
AI actually said, and it needs no tooling in Mode A — the history is on the
tablet.

Look for: dependency language, flattery, agreeing too readily, answering instead
of teaching, missing a shared-device notice, taking a side, spoiling anything,
and — the most likely failure — helpfulness quietly overriding a rule.

**Do it fairly.** Reading conversations is legitimate on a shared family device
and the children are told it may happen. Using what is read to embarrass a child
would break the trust the whole system depends on and would teach them to stop
using it honestly. The purpose is auditing the AI, not surveilling the children.

**Log responsibly.** In Mode D, keep the minimum needed to review behaviour, set
a retention period, make deletion work, and let parents see what is kept. Do not
retain more than is needed on the theory that it might be useful.

## Keeping the Constitution and the prompt aligned

The prompt derives from the Constitution and can drift from it. At each review,
check that §4 of the prompt still matches
[03](../constitution/03—family-mottoes.md) and
[04](../constitution/04—family-values.md) word for word, that no rule in
`docs/ai/` contradicts a chapter, and that the spoiler and technology behaviour
still match chapters 14 and 15.

Where they disagree, **the Constitution wins.** The AI is downstream.

## Preventing stale family data

Mode A cannot go stale, because it holds no family data. Mode D goes stale
through `dataFreshness`, which is why `staleAfterMinutes` exists and why a stale
payload must be announced rather than used quietly. Option B was rejected in
[13](13—birch-ai-integration-architecture.md) specifically because it goes stale
invisibly.

## How often

**Yearly** — full review. Child profiles, OpenAI's product behaviour, the
integration recommendation, and Constitution alignment. December is a reasonable
anchor, holding three family birthdays.

What that review is **not** for is reconsidering whether a child is now old
enough for their own account. That question is settled and does not reopen with
age; see
[decisions.md](../decisions.md#the-ai-companion-runs-on-a-parents-account-in-the-living-room).
The child-profile guidance in [03](03—birch-ai-child-profiles.md) is what
actually needs a yearly look, because the children genuinely do change.

**Quarterly** — read a sample of conversations.

**On any change** — run the test suite.

**Immediately** — if a child reports something the AI said that seems wrong.
That report is the most valuable signal this system produces, and it should be
easy and rewarded rather than treated as tattling.
