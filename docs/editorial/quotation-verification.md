# Quotation verification report

Every quotation in the Birch Family Constitution — and every quotation in the
app's `src/config/mantras.ts`, which draws on the same set — was checked
word-for-word against a primary source on **5 August 2026**.

Sources used: `churchofjesuschrist.org` (general conference archive, scriptures,
and the Family Proclamation) and `speeches.byu.edu` (BYU devotional archive). No
quotation-aggregation site was consulted, and none should be.

**Five errors were found and corrected.** Three of them were misattributions —
words placed in the mouth of somebody who did not say them. Two of those three
were in the set the brief specifically flagged for checking, and the flag was
warranted.

---

## Summary

| # | Quotation | Was attributed to | Verified source | Wording changed | Status |
|---|---|---|---|---|---|
| 1 | "When you bless the one, you bless the whole." | Sister Kristin M. Yee | An unnamed bishop, quoted by Sister Yee in note 14 | **Yes** — was first person | **Corrected** |
| 2 | "Daily repentance is the pathway to purity, and purity brings power." | Sister Kristin M. Yee | President Russell M. Nelson, *We Can Do Better and Be Better*, April 2019 | **Yes** — "Daily" was missing | **Corrected** |
| 3 | "We are the Savior's hands." | Sister Kristin M. Yee | Sister Kristin M. Yee, April 2026 general conference | No | **Verified** |
| 4 | Genesis 3:19 | "By the sweat of thy face…" | KJV reads "In the sweat of thy face…" | **Yes** | **Corrected** |
| 5 | The Family: A Proclamation to the World | Two sentences quoted as one | They are not adjacent in the original | **Yes** — now quotes one sentence | **Corrected** |
| 6 | "The joy we feel has little to do with…" | Nelson as "President of the Church" | He was President of the Quorum of the Twelve in Oct 2016 | Calling only | **Corrected** |
| 7 | "Not all angels are from the other side of the veil…" | Trimmed mid-sentence, silently capitalised | Full passage now quoted | Restored | **Corrected** |
| 8–15 | Monson ×3, Nelson ×4, Holland ×3 | — | All confirmed verbatim | No | **Verified** |

---

## The three misattributions in detail

### 1. "When we bless the one, we bless the whole."

**Where it appeared:** `docs/constitution/05—family-mantras.md`,
`docs/constitution/13—service.md` (as the closing epigraph), and
`src/config/mantras.ts` (mantra id `bless-the-one`).

**Original attribution:** Sister Kristin M. Yee, *Ministering—"That Ye Love One
Another; as I Have Loved You"*, April 2026 general conference.

**What the source actually says.** The phrase appears in **note 14** of that
talk, and it is not Sister Yee's sentence. She is recounting somebody else's:

> "A wise bishop once said to me, when I was an overwhelmed Young Women president
> of 53 young women, 'When you bless the one, you bless the whole.'"

Two problems, therefore. The words belong to an unnamed bishop, not to Sister
Yee — she is the person who *recorded* them. And the wording is second person
("when **you** bless the one, **you** bless the whole"), not first.

**Resolution.** The quotation is now given in its correct second-person form and
attributed to the bishop, with Sister Yee's talk named as where it is found. The
Birch family mantra **Bless the one** is unaffected — it was always the family's
own phrase, and it remains so.

### 2. "Repentance is the pathway to purity, and purity brings power."

**Where it appeared:** `docs/constitution/05—family-mantras.md`,
`docs/constitution/12—repentance.md` (closing epigraph), and `src/config/mantras.ts`
(mantra id `start-again-today`).

**Original attribution:** Sister Kristin M. Yee, *The Joy of Our Redemption*,
October 2024 general conference.

**What the source actually says.** Sister Yee is quoting the prophet, and says so
explicitly:

> "Our prophet has said: 'Repentance is the pathway to purity, and purity brings
> power.'"

Following that back to its origin, the sentence is President Russell M. Nelson's,
from *We Can Do Better and Be Better*, April 2019 general conference — and in the
original it begins with a word the family's version had lost:

> "**Daily** repentance is the pathway to purity, and purity brings power."

That missing word is not decorative. "Daily repentance" is the entire point
President Nelson was making in that talk, and dropping it changes repentance from
a habit into an event.

**Resolution.** Now quoted in full, with "Daily", and attributed to President
Nelson's April 2019 talk.

### 3. "We are the Savior's hands." — verified, no change

This one is genuine. It is Sister Yee's own sentence, in the body of the April
2026 talk:

> "When we minister, we are helping to answer each other's prayers. We are the
> Savior's hands."

Chapter 13 now quotes both sentences, since the first supplies the meaning of the
second.

---

## The scripture and Proclamation errors

### 4. Genesis 3:19

Chapter 10 opened with "By the sweat of thy face shalt thou eat bread." The KJV
reads **"In the sweat of thy face shalt thou eat bread"**. Corrected.

### 5. The Family: A Proclamation to the World

Chapter 02 closed with the two sentences run together as though they were one
passage:

> "The family is ordained of God. Happiness in family life is most likely to be
> achieved when founded upon the teachings of the Lord Jesus Christ."

They are in the same paragraph but **two sentences apart**; the original reads
"The family is ordained of God. Marriage between man and woman is essential to
His eternal plan. Children are entitled to birth within the bonds of matrimony,
and to be reared by a father and a mother who honor marital vows with complete
fidelity. Happiness in family life is most likely to be achieved when founded
upon the teachings of the Lord Jesus Christ."

Stitching non-adjacent sentences without an ellipsis presents the source as
having said something in a form it never said. Chapter 02 now quotes only the
second sentence, which was the one carrying the chapter's point anyway.

### 6. President Nelson's calling in October 2016

*Joy and Spiritual Survival* was given in October 2016, when President Nelson was
**President of the Quorum of the Twelve Apostles**. He became President of the
Church in January 2018. The app's `mantras.ts` applied a single shared
`President of the Church` role to all his talks, which is right for the 2020 and
2023 ones and an anachronism for this one. Corrected in both the Constitution and
the app config.

### 7. "Not all angels…" — silent mid-sentence trim

The family's version began "Not all angels are from the other side of the veil."
In the original that clause is mid-sentence and lowercase:

> "But when we speak of those who are instruments in the hand of God, we are
> reminded that not all angels are from the other side of the veil. Some of them
> we walk with and talk with—here, now, every day."

Trimming to a clause boundary and silently promoting a lowercase word to a
capital is exactly the practice `mantras.ts` claims in its own header comment
never to allow. The full passage is now quoted in chapter 05.

---

## Verified without change

All confirmed verbatim, with punctuation as printed:

**President Thomas S. Monson**, *Finding Joy in the Journey*, October 2008
general conference:
- "Never let a problem to be solved become more important than a person to be loved."
- "We will never regret the kind words spoken or the affection shown."
- "Find joy in the journey—now." (Appears mid-sentence and lowercase in the
  original; capitalised here as the start of a standalone quotation, which is
  ordinary practice and does not alter the words.)

**President Russell M. Nelson:**
- "Contention is a choice. Peacemaking is a choice. You have your agency to
  choose contention or reconciliation." — *Peacemakers Needed*, April 2023
- "Charity is the antidote to contention." — *Peacemakers Needed*, April 2023
- "The joy we feel has little to do with the circumstances of our lives and
  everything to do with the focus of our lives." — *Joy and Spiritual Survival*,
  October 2016 (calling corrected, see above)
- "Mortality is a master class in learning to choose the things of greatest
  eternal import." — *Think Celestial!*, October 2023
- "When your greatest desire is to let God prevail, to be part of Israel, so many
  decisions become easier." — *Let God Prevail*, October 2020

**Elder Jeffrey R. Holland**, Quorum of the Twelve Apostles at the time of each:
- "Don't give up, boy. Don't you quit. You keep walking. You keep trying." —
  *"An High Priest of Good Things to Come"*, October 1999
- "Some blessings come soon, some come late, and some don't come until heaven;
  but for those who embrace the gospel of Jesus Christ, they come." — same talk
- "The past is to be learned from but not lived in." — *Remember Lot's Wife*, BYU
  devotional, 13 January 2009

**Scriptures**, all checked against the citation given: Joshua 24:15, Alma 37:6,
John 13:35, John 14:15, Moses 7:18, Moroni 7:46, 3 Nephi 27:27, Matthew 5:9,
Matthew 6:21, 2 Nephi 2:25, D&C 93:36, D&C 88:118, D&C 64:33, Isaiah 1:18,
Mosiah 2:17, Mosiah 4:27, Articles of Faith 1:13, Helaman 4:24, Helaman 5:12,
Psalm 127:3, Psalm 145:4.

---

## Unresolved

Nothing is unresolved. Every quotation now in the Constitution has been traced to
a primary source, and every one that could not be traced to its claimed speaker
has been re-attributed rather than removed or paraphrased.

## Standing rule

Before adding any quotation to the Constitution, the app, or the AI knowledge
base, read it in the original talk. Two of the errors above existed because a
sentence *sounded* like the person it was attached to — which is precisely the
condition under which this mistake happens. See
[editorial-standards.md](editorial-standards.md) for the three hazards to check
for, and `docs/ai/07—birch-ai-gospel-guidance.md` for how the AI is required to
handle a quotation it cannot verify.
