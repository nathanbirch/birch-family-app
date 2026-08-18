# The Bored Page

`/bored` — what to do when there is nothing to do. Three pictures, then a grid
of pictures.

```
/bored              Inside · Outside · Money
/bored/inside       12 things to do indoors
/bored/outside      12 things to do outdoors
/bored/money        15 jobs, priced in Dad Bucks
```

Each of the three grids has an **Add** button, so the family can put their own
ideas on it — a word and a picture, no deploy. See
[Adding one in the app](#adding-one-in-the-app).

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

  There is exactly one exception, named in the test so it cannot quietly become
  two: "Take out a trash can" is five, and the fifth word is `a`. This list
  says "per one of these" with a singular label and nothing else, so shortening
  it to "the trash" would turn three cans into one job. A second five-word
  label means the rule has failed, and the answer then is a shorter job rather
  than a six-word ceiling.
- Every category title is **one word**.
- Every idea has a drawing, checked by the same suite.

The test to apply when adding an idea is: **cover the caption, look at it on a
phone, and see whether you can still tell what it is.** If you cannot, the
drawing needs redrawing — not the label lengthening.

Those three rules are about the **built-in** ideas, and they stay enforced by the
suite. A family-added idea is held to the one part of them a program can check: a
twenty-character ceiling, enforced by the box as well as by the Server Action. The
rest is left to whoever is typing, on purpose — a validator that refused "Play with
the dog" for being four words would be the app arguing with a nine-year-old about
their own idea, and it would lose.

Four drawings failed that test the first time they were rendered and were
redrawn: the Inside sofa read as a car, the playing cards were invisible white
on a pale wash, the fort read as a swing, and "go for a walk" was a dashed path
that rendered as a scatter of unrelated dots. The notes on each are in
`BoredArt.tsx`, so the same mistakes are not made twice.

---

## Where things live

| File | What it holds |
|---|---|
| [`src/config/bored.ts`](../src/config/bored.ts) | The three categories, the 39 built-in ideas, every price, and the emoji the picker offers. **This is the file to edit for a built-in.** |
| [`src/components/bored/BoredArt.tsx`](../src/components/bored/BoredArt.tsx) | All the drawings and the three category colours. |
| [`src/components/bored/BoredCategoryCard.tsx`](../src/components/bored/BoredCategoryCard.tsx) | The three cards on the front. |
| [`src/components/bored/BoredGrid.tsx`](../src/components/bored/BoredGrid.tsx) | The grid, the Add button, and the optimistic tile. A client island. |
| [`src/components/bored/AddIdeaForm.tsx`](../src/components/bored/AddIdeaForm.tsx) | Pick a picture, type a word, and on Money pick a price. |
| [`src/components/bored/IdeaCard.tsx`](../src/components/bored/IdeaCard.tsx) | One tile: a drawing or an emoji, a price, and a cross if it is ours. |
| [`src/lib/bored/ideas.ts`](../src/lib/bored/ideas.ts) | An idea as a value: ids, labels, prices, ordering. Pure. |
| [`src/lib/bored/store.ts`](../src/lib/bored/store.ts) | The `boredIdeas` collection, and the fallback to the compiled list. |
| [`src/lib/bored/actions.ts`](../src/lib/bored/actions.ts) | Add and remove. |
| [`src/app/(app)/bored/page.tsx`](<../src/app/(app)/bored/page.tsx>) | The three-card index. Still no database, no clock, nothing dynamic. |
| [`src/app/(app)/bored/[category]/page.tsx`](<../src/app/(app)/bored/[category]/page.tsx>) | Reads the ideas, hands them to the grid. |
| [`tests/bored.test.tsx`](../tests/bored.test.tsx) | Every idea has a picture, and the word rules. |
| [`tests/bored-ideas.test.ts`](../tests/bored-ideas.test.ts) | Ids, labels, prices and where a new idea lands. |
| [`tests/bored-add.test.tsx`](../tests/bored-add.test.tsx) | Adding and removing one, with the actions mocked. |

**The ideas are in the database now**, and this page's documentation used to say
at length that they were not. That claim was true for as long as they were
compiled in: they were ideas rather than state, nothing was ticked or remembered,
so there was nothing to store. Letting the family add one ended it — a thing
somebody types on a phone has to outlive the phone, appear on every other one, and
survive a deploy, which is the same argument [the pet
rotation](pets.md) won.

What that does **not** mean is that `config/bored.ts` stopped mattering. It is
still where a built-in idea and its drawing are declared, it is what the
`boredIdeas` collection is seeded from, and it is what the page falls back to when
the cluster cannot be reached — which matters more here than anywhere else in the
app, because this is the page a child opens when they are *already* fed up. An
error message is the worst possible answer.

So the page still works before the seed has ever run, still works with the
database down, and — because the fallback is decided on the *built-in* rows alone
— still shows the family's own ideas in either case.

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
| Take out a trash can | Đ1 | Put away a basket | Đ5 |
| Pick 10 weeds | Đ2 | Rake the leaves | Đ6 |
| Sweep the kitchen | Đ2 | Wash the car | Đ8 |
| Wash a window | Đ2 | Shovel the snow | Đ8 |
| Do a load | Đ3 | Clean out the car | Đ9 |
| Empty the dishwasher | Đ3 | Vacuum downstairs | Đ10 |
| Wipe a bathroom | Đ4 | Mow the lawn | Đ10 |
| Clean a room | Đ5 | | |

Cleaning the car out is dearer than washing the outside of it, which is the
right way round: seven people live in that car.

### Rates, without a word for "each"

**"Wash a window" pays Đ2 *per window*.** The singular label is what says so,
and it needs no extra field and no "each" on the pill — because a singular
label already means a unit rate everywhere else on this list. "Clean a room",
"Do a load", "Wipe a bathroom", "Put away a basket" and "Take out a trash can"
are every one of them one-of-those-for-that-price.

That last one used to read "Take out the bins" and was changed on purpose:
wheeling all three cans out is three jobs, not one, and the label is now what
says so.

A job that pays a flat rate for an unbounded amount of work says so the other
way, with a plural or a number: "Pick 10 weeds", "Rake the leaves", "Vacuum
downstairs", "Shovel the snow".

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

### To change a price — read this bit

Editing the number in `config/bored.ts` and redeploying is **no longer enough**,
and this is the one trap the move to the database introduced.

The seed writes built-in ideas with `$setOnInsert`, so re-running it never
overwrites a row that already exists. That is deliberate and right — a seed that
rewrote labels and prices would undo anything ever edited in Atlas, including the
family's own ideas — but it means a changed price in the config is a change to the
*default* for a database that has already been seeded, which is to say a change to
nothing at all.

Two honest ways to actually re-price a job:

```js
// 1. Change the one row. Atlas → birch_family_app → boredIdeas.
db.boredIdeas.updateOne(
  { categoryId: "money", ideaId: "lawn" },
  { $set: { price: 12, updatedAt: new Date() } },
)
```

```js
// 2. Or delete the built-in rows and let the seed rewrite them from the config.
//    `custom: false` is what keeps the family's own ideas out of it.
db.boredIdeas.deleteMany({ categoryId: "money", custom: false })
// then: npm run db:seed
```

Change the config as well either way, or the next fresh cluster gets the old
price.

---

## Adding one in the app

Every category page has an **Add** button. It opens a panel with a grid of
pictures, a twenty-character box, and — on Money only — a row of prices.

```
Money                                  [ + Add ]

😀 🥰 🤓 🐶 🐰 🌳 🍎 🍕 …  ─┐  286 pictures, four rows deep,
😃 😍 😎 🐱 🦊 🌲 🍐 🥪 …   │  scrolling sideways →
😄 🤩 🥳 🐭 🐻 🌵 🍊 🌮 …   │
😁 😘 😏 🐹 🐼 🌴 🍌 🥗 …  ─┘

[ 💰 ]  What is it?

Đ1  Đ2  Đ3  Đ4  Đ5  Đ6  Đ7  Đ8  Đ9  Đ10

[        Add        ]  Cancel
```

**The category is not a field.** An idea added on `/bored/outside` is an outside
idea because that is the page somebody was standing on. There is nothing to
choose, nothing to get wrong, and nothing to explain — which on this page is worth
more than it would be anywhere else.

**A picture is chosen from a fixed list rather than typed.** The obvious build is
one more text box and let people type an emoji into it, and it is wrong twice over
here: on a phone it means opening the emoji keyboard, which the four-year-old this
page is for cannot navigate; and a free-text field would accept anything at all —
a letter, a paragraph, a joined sequence that renders as a box on one device and a
family of four on another. A fixed list means every option is one tap, every
option is known to render, and the Server Action can check the choice against the
list instead of trying to decide whether an arbitrary string is "an emoji", which
is a genuinely hard question and not one worth answering here.

**The picker is a rail, and it scrolls sideways.** Four rows deep, filling
downwards and then starting a new column, so 286 pictures are about seventy
columns rather than a tall panel. It was a vertical grid while there were seventy
pictures and that stopped working at four times as many: a scroller deep enough to
hold them pushed the text box off a phone screen, and a vertical scroll inside a
vertically scrolling page means a thumb aimed at the pictures moves whichever one
the browser guesses. Sideways has neither problem — the panel's height is fixed by
the row count, and a horizontal scroll cannot be mistaken for the page's. It is
the same trade the bottom tab bar's strip makes.

**The order is the only navigation it has**, and that is a decision rather than an
omission: a search box needs a word, and the whole point of a picture is that the
child using it has not got one. So the list is grouped in the order somebody scans
it — faces first, because that is what a child looks for first and what half of
what they add will use; then animals, the world outside, food, and the things you
do and do them with. The panel opens scrolled to whichever picture is currently
chosen, so the ring is never off screen. Keep an addition inside its group rather
than appending it to the end, or the order stops being navigation.

**Money asks what it pays**, with ten buttons rather than a number field. A job
with no price would be a tile with no pill in a grid that is ordered *by* price and
read by price — so it has to have one. Ten taps rather than a spinner because a
spinner needs a keyboard, a concept of digits, and a decision about what to do with
`Đ0` or `Đ7.50`.

**A new tile appears before the write finishes.** The child who has just typed
"Trampoline park" is watching the space where it should be, and a round trip is a
long time to watch an empty square. If the write fails the tile goes away again and
the page says why, in one short sentence — the only sentence on the page that is
not a caption.

**Something already on the page is answered before anything is drawn**, and the
tile it clashes with is highlighted. That case is worth its own paragraph because
getting it wrong looked like a broken app: the first version sent every add
straight out optimistically, so typing "Puzzle" onto a grid that has had a Puzzle
on it since the day it shipped drew the tile, then took it away, then showed a red
message. Every step of that was working as written, and adding a duplicate is the
*most likely* way an add fails — so it was also the most likely thing anybody would
see. The whole list is already on the device, so the browser now answers it without
asking anybody, the panel stays open with the typing intact, and the tile that is
already there lights up for a moment so nobody has to scan the grid for it. The
Server Action still checks, because two phones cannot see each other's screens.

The match ignores case and spacing, so `puzzle` finds `Puzzle` — but it is a whole-
label match, so "Jigsaw puzzle" and "Puzzles" are both allowed. And the **Add**
button goes dead while a write is in flight, which is the only thing between an
impatient double-tap and two ideas with the same name: both taps would pass the
duplicate check, since neither has committed when the other is checked.

**A cheap new job sorts into its place**, not onto the end. Price ascending is the
only thing standing in for headings and a filter on the Money grid, so it is
enforced now rather than maintained by hand. Inside and Outside keep their curated
order with the family's own ideas grouped at the end.

### Taking one off

A family-added tile carries a small cross in its corner; a built-in tile carries
nothing. That is deliberate in both directions: an idea a four-year-old typed has
to be removable by somebody who is not holding a MongoDB client, and the built-in
list is the page's content — five children can reach these tiles, so removing one
of those is still an edit to `config/bored.ts` and a reseed.

The rule is enforced twice, in two places that cannot disagree: the Server Action
refuses any id that is not one the app issued for a custom idea (`own-` plus ten
characters, a namespace no built-in is in), and the delete itself filters on
`custom: true`, so there is no instant at which it could take a built-in off.

### The ceilings

| | | Why |
|---|---|---|
| Label | 20 characters | The length of the longest built-in label, so anything that fits the box is known to fit a tile. Longer is **trimmed, not refused**. |
| Pictures offered | 286 | Grouped, faces first. A test caps the rail at a hundred columns — past that a picker needs a search box, and a search box needs a word. |
| Ideas per category | 40 | Not storage — a child with a thumb on the Add button, and a grid that has to stay glanceable. |
| Price | Đ1–Đ10 | Nothing is free, and nothing a child invents is worth more than mowing the lawn. |

---

## Adding a built-in idea

Still the way to add one with a *drawing* rather than an emoji.

1. Add an entry to the right array in `src/config/bored.ts`. One or two words.
2. Add a drawing under the matching id in `BoredArt.tsx`.
3. `npm test` — the suite fails if either half is missing, in both directions:
   an idea without a drawing, and a drawing whose idea has been retired.
4. **`npm run db:seed`** — new, and easy to forget. The config is what the
   collection is seeded from, so an idea added to the array is not on the page
   until the seed has written it. It is idempotent and leaves everything else
   alone.

Retiring one is the same in reverse, plus a note: nothing deletes a retired idea's
*row*. Take it out by hand if it is still on a grid — `db.boredIdeas.deleteOne({
categoryId: "inside", ideaId: "…" })`. Unlike a retired chore pool it is harmless
until then, so the seed does not sweep it.

The drawings are flat shapes on a 96×96 grid with no gradients, and they
deliberately **ignore the theme tokens**. Same reason as `HealthArt`, and it
matters more here because there are dozens of them: these are landmarks.
The red-and-black ladybird *is* "find bugs", and a child who has learned that
should find it in the same colours tomorrow whichever of the ten themes is on.
The card around each drawing themes normally, so they never look pasted on.

---

## It was not in the tab bar for a long time

For most of this app's life the bar had five fixed slots, and Bored was the
third page left out of it — after Mantras and Healthy. The long note in
`src/config/navigation.ts` argued each time about whether that was the moment to
build a "More" sheet, and each time the answer was no.

The reasoning held up, and it is worth keeping because it is about this page
specifically: **the dashboard was the better home, not a consolation prize.** A
tab is for a page you open with an intention already formed — where do I sit,
what is on today. A bored child has no intention; that is the whole condition.
The home screen is where they land, so the card is already in front of them
without a tap, and a "More" sheet would have put it one tap *further* away.

The bar scrolls now, so the question has gone away rather than been answered.
Bored has a place in the strip *and* keeps its card, which is the right outcome
for the one page in the app you arrive at without meaning to.
