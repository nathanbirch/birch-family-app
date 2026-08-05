# Family Mantras

The things this family says to each other, and the words that gave them to us.
Lives at [`/mantras`](../src/app/(app)/mantras/page.tsx); the data is all in
[`src/config/mantras.ts`](../src/config/mantras.ts).

## The one rule

Every entry is **two voices, and they must never blur into one**:

| Field | Whose | Rule |
|---|---|---|
| `text`, `meaning` | **Ours** | The Birch family's own words. Change them freely. |
| `quote`, `source` | **Theirs** | A real person's words, verbatim, with the talk and a link. |

The card is laid out to keep that obvious: the mantra is large and
unattributed, the quote sits behind a rule in a real `<blockquote>` with a
`<cite>` and the speaker's name and calling underneath. A screen reader
announces the boundary too — that is why it is marked up as a quotation rather
than styled as italic text.

> **Before you add a quote, go and read it in the original.** Every quote
> currently in the file was checked word-for-word against the talk on
> 2026-08-04. Putting words in a real person's mouth because they sounded about
> right is the one mistake this feature can make that actually matters.

Where a quote is shortened it is cut at a sentence boundary and never
re-stitched from separate parts, so what is displayed is always something the
speaker really said, in that order.

## Who we listen to

| Voice | Talks quoted |
|---|---|
| President Thomas S. Monson | Finding Joy in the Journey (Oct 2008) |
| President Russell M. Nelson | Joy and Spiritual Survival (Oct 2016) · Let God Prevail (Oct 2020) · Peacemakers Needed (Apr 2023) · Think Celestial! (Oct 2023) |
| Sister Kristin M. Yee | The Joy of Our Redemption (Oct 2024) · Ministering—"That Ye Love One Another; as I Have Loved You" (Apr 2026) |
| Elder Jeffrey R. Holland | "An High Priest of Good Things to Come" (Oct 1999) · The Ministry of Angels (Oct 2008) · Remember Lot's Wife (BYU devotional, 13 Jan 2009) |

Sources are limited to `churchofjesuschrist.org` and `speeches.byu.edu`, and a
test enforces it. Quote-aggregator sites are how misattributions get in — half
the "inspirational quotes" on the internet are attached to the wrong person.

## The mantra of the day

The top card changes every morning. It is derived from the **local calendar
date alone**:

```ts
epochDay      = floor(local midnight / 86_400_000)
mantraIndex   = epochDay mod MANTRAS.length
```

Same idea as the seating rotation, one day at a time instead of one week, and
with the same properties: nothing stored, nothing fetched, and every device in
the family lands on the same mantra on the same day without syncing. The list
is walked in order rather than hashed, so all fifteen come round evenly instead
of the same three showing up all month.

`MantraOfDay` is the page's only client component, for the same reason
`SeatingBoard` is one: it depends on the device's clock and has to turn over at
local midnight without a reload. It reuses
[`useCurrentDate`](../src/hooks/useCurrentDate.ts) to do it.

## Adding a mantra

1. Find the talk on churchofjesuschrist.org and **read the sentence in place**.
2. Copy it exactly — punctuation, dashes and all.
3. Add an entry to `MANTRAS` with the family's phrase in `text`, what we mean
   in `meaning`, the quote in `quote`, and the full `source`.
4. `npm test`. [`tests/mantras.test.ts`](../tests/mantras.test.ts) checks the
   mechanical half: a named speaker with a calling, a titled source with a
   year, an official URL, and that the mantra is not silently identical to the
   quote next to it.

Removing one is just deleting the entry — the day-of rotation adjusts to the
new length on its own, and nothing else references mantras by id.
