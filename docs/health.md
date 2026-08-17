# Healthy Birches

The five lists that hang on the wall at home, in the app. Lives at
[`/health`](../src/app/(app)/health/page.tsx) with one page per list at
[`/health/[section]`](<../src/app/(app)/health/[section]/page.tsx>); the content
is all in [`src/config/health.ts`](../src/config/health.ts).

| List | Id | Lines |
|---|---|---|
| Healthy Body | `body` | 11 |
| Healthy Mind | `mind` | 7 |
| Healthy Emotions | `emotions` | 9 |
| Healthy Spirit | `spirit` | 12 |
| How to Keep the Spirit in Our Home | `home` | 20 |

## The one rule

**`items` is a transcription, not copy.** Every line was typed off a photograph
of the printed sheet, word for word and in the printed order. The app's job is
to show what is on the wall, not to improve it — if the wall and the phone
disagree, the app is wrong.

So the sheets keep their own voice, including the bits an editor would itch to
fix: `10 min of math facts worksheets M-F`, `Shower and bathe 3x week`, and
`Remember we all make mistakes, and its ok`.
[`tests/health.test.tsx`](../tests/health.test.tsx) pins each of those, plus the
first and last line of every sheet and the length of all five lists, so a
well-meaning tidy-up cannot land quietly.

One change is allowed and only one: straight quotes become typographic
apostrophes (`’`), so the text sets properly next to everything else. A test
enforces that no `'` survives. No words change.

`blurb` and `intro` are the app's *own* writing — a short line on the card and a
friendly sentence at the top of the list. They are ours, they can change freely,
and the layout keeps them visibly separate from the numbered items for the same
reason the mantras page keeps the family's words apart from the quotations.

## Changing a list

1. Change the paper first.
2. Edit the entry in `HEALTH_SECTIONS`, matching the new sheet exactly.
3. Update the count in `PRINTED_COUNTS` in `tests/health.test.tsx` if the sheet
   grew or shrank, and `HEALTH_ITEM_COUNT`'s expected total with it.
4. `npm test`.

Adding a whole new sheet also needs an id in `HealthSectionId`, a drawing and a
palette entry in [`HealthArt`](../src/components/health/HealthArt.tsx) — the
`Record` types make the compiler ask for both.

## The pictures

Five flat SVG drawings — an apple, a book under a lightbulb, a smiling heart,
the sun, and a house with a heart in it — drawn inline in `HealthArt.tsx` on a
96×96 grid.

They are the one thing in the app that **deliberately ignores the theme
tokens**. Every drawing keeps the same bright palette under all ten themes,
because for the youngest reader in the house the red apple *is* the body list,
and a landmark that changes colour stops being a landmark. The card around them
themes normally, and each card's background is the drawing's tint `color-mix`ed
into `--color-surface`, so a bright card still sits properly on a dark theme
instead of looking pasted on.

Inline SVG rather than image files: no request, no manifest, no optimisation
script, and they work offline the moment the page does.

## Why a page per list

Twenty items under "How to Keep the Spirit in Our Home" would bury the four
sheets below it on a single scrolling page. Cards to a route each means a child
looking for *what do I do when I'm mad* is one tap from the answer, the back
button does what they expect, and each list starts at its own top. An unknown id
`notFound()`s rather than falling back to the first sheet.

## Where it sits in the navigation

Healthy was the first page with **no place in the bar** in
[`navigation.ts`](../src/config/navigation.ts): it has a dashboard card but no
tab in the bottom bar. The bar holds five, it already had five, and the four it
would have pushed against are all things you open and close in seconds — where
do I sit, what's on today, sign out — whereas this is a page you sit and read.
A sixth tab would take every target below the size a thumb reliably hits.

If a seventh page ever needs a home, that is the moment to build the "More"
sheet rather than to add a second dashboard-only page.
