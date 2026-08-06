# The Bored Page

`/bored` — what to do when there is nothing to do. Three pictures, then a grid
of pictures.

```
/bored              Inside · Outside · Money
/bored/inside       12 things to do indoors
/bored/outside      12 things to do outdoors
/bored/money        16 jobs, priced in Dad Bucks
```

---

## The one rule: as few words as possible

**The child most likely to be bored is the one least able to read their way
out of it.** James is four. Every other page in this app can lean on a
sentence; this one cannot.

So the whole page is drawings, and every word on it is a caption rather than
an instruction. There is no blurb under the heading, no encouragement copy, no
"here are some ideas!", no empty state and no counts. A child who has opened a
page called **Bored?** does not need to be told what it is for.

Three things enforce it rather than leaving it to good intentions:

- Every label is **four words or fewer**, and `tests/bored.test.tsx` fails if
  one grows. "Do a load of laundry" was cut to "Do a load" by that test, not by
  a reviewer.
- Every category title is **one word**.
- Every idea has a drawing, checked by the same suite.

The test to apply when adding an idea is: **cover the caption, look at it on a
phone, and see whether you can still tell what it is.** If you cannot, the
drawing needs redrawing — not the label lengthening.

Four drawings failed that test the first time they were rendered and were
redrawn: the Inside sofa read as a car, the playing cards were invisible white
on a pale wash, the fort read as a swing, and "go for a walk" was a dashed path
that rendered as a scatter of unrelated dots. The notes on each are in
`BoredArt.tsx`, so the same mistakes are not made twice.

---

## Where things live

| File | What it holds |
|---|---|
| [`src/config/bored.ts`](../src/config/bored.ts) | The three categories, every idea, every price. **This is the file to edit.** |
| [`src/components/bored/BoredArt.tsx`](../src/components/bored/BoredArt.tsx) | All 43 drawings and the three category colours. |
| [`src/components/bored/BoredCategoryCard.tsx`](../src/components/bored/BoredCategoryCard.tsx) | The three cards on the front. |
| [`src/components/bored/IdeaCard.tsx`](../src/components/bored/IdeaCard.tsx) | One tile in the grid. |
| [`src/app/(app)/bored/page.tsx`](<../src/app/(app)/bored/page.tsx>) | The three-card index. |
| [`src/app/(app)/bored/[category]/page.tsx`](<../src/app/(app)/bored/[category]/page.tsx>) | The grid. |
| [`tests/bored.test.tsx`](../tests/bored.test.tsx) | 61 tests, mostly "does every idea have a picture". |

Nothing is in the database. These are ideas, not state — nothing is ticked,
earned, spent or remembered — so the page works offline the moment it has been
opened once, exactly like the mantras and the health lists.

---

## Dad Bucks

The currency mark is **`Đ`** — U+0110, "D with stroke". Prices are written
before the number, as English does with £5: **`Đ5`**.

It is a real Unicode character rather than an image, so it inherits the font,
the weight and the colour of whatever it sits in, and needs no second asset for
the dark themes. The barred letter is what every real currency mark does — ₿,
₽, ₹, ¥, £ all take a letter and strike it through — so it reads as *money*
while still obviously being D for Dad. It is on nobody's keyboard, which is a
feature: it cannot be typed into a chore label somewhere else by accident and
mistaken for a price.

### The prices

Sorted **cheapest first**, deliberately. A child with ten minutes and a child
with a whole Saturday want opposite ends of this list, and price ascending puts
the quick ones where a thumb already is. The order is the explanation, so the
page needs no headings and no filter.

| | | | |
|---|---|---|---|
| Take out the bins | Đ1 | Clean a room | Đ5 |
| Pick 10 weeds | Đ2 | Put away a basket | Đ5 |
| Match the socks | Đ2 | Clean out the car | Đ5 |
| Sweep the kitchen | Đ2 | Rake the leaves | Đ6 |
| Wash a window | Đ2 | Wash the car | Đ8 |
| Do a load | Đ3 | Shovel the snow | Đ8 |
| Empty the dishwasher | Đ3 | Vacuum downstairs | Đ10 |
| Wipe a bathroom | Đ4 | Mow the lawn | Đ10 |

### Rates, without a word for "each"

**"Wash a window" pays Đ2 *per window*.** The singular label is what says so,
and it needs no extra field and no "each" on the pill — because a singular
label already means a unit rate everywhere else on this list. "Clean a room",
"Do a load", "Wipe a bathroom" and "Put away a basket" are every one of them
one-of-those-for-that-price.

A job that pays a flat rate for an unbounded amount of work says so the other
way, with a plural or a number: "Take out the bins", "Pick 10 weeds", "Rake the
leaves", "Vacuum downstairs".

That distinction is now load-bearing, so keep to it when adding a job. If a
future one genuinely cannot be expressed that way, *that* is the point to add a
`perUnit` field to `BoredIdea` — not before.

**Seven of these are the family's own**, at the rates set for them: clean a
room Đ5, a load of laundry Đ3, putting a basket away Đ5, ten weeds Đ2, the lawn
Đ10, vacuuming downstairs Đ10, and a window Đ2. The rest were added to fill the
gaps between them, so there is something worth doing at every amount rather
than a cliff — a test asserts no gap wider than Đ2. Shovelling is on the list
because this is Rexburg and it will be needed for five months of the year.

Note that vacuuming downstairs sits level with mowing the lawn at Đ10, which is
the top of the list. That is a deliberate rate, not a typo: it is a whole floor
of a house, and the price says so.

**To change a price**, edit the number in `config/bored.ts` and redeploy. When
Rewards is built and the app starts *tracking* a balance, the prices should
move to the database for the same reason the pet rotation did — so they can be
re-anchored without a deploy. Until then a config file is honest about what
this is: a price list on the fridge, not a ledger.

---

## Adding an idea

1. Add an entry to the right array in `src/config/bored.ts`. One or two words.
2. Add a drawing under the matching id in `BoredArt.tsx`.
3. `npm test` — the suite fails if either half is missing, in both directions:
   an idea without a drawing, and a drawing whose idea has been retired.

The drawings are flat shapes on a 96×96 grid with no gradients, and they
deliberately **ignore the theme tokens**. Same reason as `HealthArt`, and it
matters more here because there are forty-three of them: these are landmarks.
The red-and-black ladybird *is* "find bugs", and a child who has learned that
should find it in the same colours tomorrow whichever of the ten themes is on.
The card around each drawing themes normally, so they never look pasted on.

---

## Why it is not in the tab bar

It is on the dashboard, reached from there, with `slot: null` — the third page
in the app to be dashboard-only, after Mantras and Healthy.

The long note in `src/config/navigation.ts` says a third dashboard-only page is
the point at which a "More" sheet should be built, and that is still true. It
shipped without one anyway, deliberately: **the dashboard is the better home
for this page, not a consolation prize.** The bar is for pages you open with an
intention already formed — where do I sit, what is on today. A bored child has
no intention; that is the whole condition. The home screen is where they land,
so the card is already in front of them without a tap, and a "More" sheet would
put it one tap *further* away.

The count still stands. The next page to need a home is the one that should
build the sheet, and by then there will be four candidates to put in it rather
than three.
