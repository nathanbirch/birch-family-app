# Meals

`/meals` answers "what's for dinner, and what will it cost us?" For every meal
the family makes it shows what it costs **per person** and **for all seven**,
from real per-store prices. It also holds the week's plan and the shopping list
that plan turns into.

It is modelled on a stand-alone meal-budgeting app, with the parts that app
needed accounts for re-thought for a house with one shared login (see
[what was left out](#what-was-left-out-and-why)).

## The three tabs

| Tab | What it is |
|---|---|
| **Meals** | Search (names *and* ingredients), a Breakfast/Lunch/Dinner/Sides/Desserts/Other strip, filters (favourites, price, calories, time, type, tag), eight sorts, three summary tiles, and a card per meal. The 🎲 in the header opens a random meal from whatever the filters currently allow. |
| **Plan** | This week's meals, each with a day and a servings stepper; the budget; and the shopping list — consolidated, in whole packs, split by the store each item is cheapest at, with a pantry tick and one button that puts it on the family's live [shopping list](shopping.md). |
| **Prices** | Every ingredient: what one unit costs, each store's pack price, calories per unit, how many recipes use it, and when the price was last checked. Parents get an **Update price** button beside each one. |

The tab is kept in the address (`?tab=plan`) and a meal can be linked to
directly (`?meal=<id>`). There is deliberately no Share button: this is the
family's own menu, not something sent out.

### A meal's sheet

Opens **for 7** rather than as written, because the family is who anyone in the
kitchen is cooking for. It has:

- per-person and family cost, and a warning naming any ingredient with no price;
- hand-given tags plus computed ones (outlined), and per-person nutrition;
- **✎ Edit** in the top corner, on every meal — see [changing a recipe](#changing-a-recipe);
- **Add to plan** (day and servings), **Favorite**, **Copy recipe**;
- **Who likes it?** — all seven faces; a tap cycles 😋 love it → 🙂 it's OK →
  😖 no thanks → no answer. Three faces rather than five stars because the
  youngest rater can tell "love it" from "no thanks" and cannot tell a 3 from a 4;
- **We made this today** and when it was last made — which is what the
  *Haven't had in a while* sort reads;
- the ingredient table, scalable (as written / for 7 / any number), where
  tapping a line shows every store's price for it;
- the method, and a link to the original if there is one;
- for a parent who has entered the PIN: **Make a copy** and **Add a version**.

Versions ("Pancakes (from mix)" and "Pancakes (from scratch)") are one card
with "2 versions" on it, because they are one decision at the table.

## How a meal is costed

Everything goes through `costRecipe` in `lib/meals/costing.ts`, so the card,
the sheet, the plan, the shopping list and the editor's live preview can never
disagree.

1. Each ingredient has one **unit** recipes measure it in (cup, lb, egg), a
   **pack** it is bought in ("2 lb bag"), and **how many units are in the
   pack** (8). That number is the most important one in the feature: every cost
   is a pack price divided by it.
2. An ingredient costs its **cheapest price per unit** — Walmart, Broulim's,
   Costco, or any other vendor with a price (a pizza place). Per unit, because
   a store can sell its **own pack size**: Costco's cheese is a 5 lb bag, not
   the 2 lb one, and a price may carry that pack with it. Which store wins can
   differ ingredient to ingredient.
3. A recipe costs what it **uses**, not the packs it opens: half a bag of
   cheese is half a bag's price.
4. **6% sales tax** is added (`SALES_TAX_RATE` in `config/meals.ts`).
5. **Per person** = total ÷ how many the recipe feeds. **Family** = per person
   × `FAMILY_SIZE`, which is `FAMILY.length` — read from the roster, so it is 7
   without anyone typing 7.

**A meal shows a cost only when every one of its ingredients has a real
price.** Until then it says "No price yet" and names what is missing — no
floor, no asterisk, never $0.00. The plan's budget follows the same rule: it
appears once every planned meal is fully priced. The shopping list does show
the prices it has, labelled as covering only the priced items.

### Computed tags

`under $1`, `under 20 min` / `under 30 min` / `under 1 hour` (only the
tightest), `quick`, `slow`, `low-calorie`, `high-calorie`, `high-protein`,
`low-carb`, `low-sugar`, `low-fat`. Worked out from the numbers every time and
never stored, so a price change moves a meal in or out of `under $1` the moment
it is saved. A figure that is not trustworthy — an unpriced line, an ingredient
with no nutrition — earns no tag from it rather than a wrong one. The
thresholds are `AUTO_TAG_RULES` in `config/meals.ts`.

### Two totals on the Plan tab

The **budget** is what the planned meals use. The **shopping total** is what the
till will say, in whole packs — and each line is bought wherever *the amount
the week needs* costs least (`bestBuy`), which is not always where a unit is
cheapest: one cup of cheese is a $8 bag at Walmart, not a $17 bag at Costco,
but a party's worth flips it — usually higher (the difference is next week's
pantry), and lower only when things are ticked as already at home. Both are
shown because both are true. Beside the shopping total is what it would come to
buying *everything* at one store, with anything that store has no price for
filled in at its cheapest elsewhere and counted.

## Where prices come from

**By hand.** Before building this, the question was whether any free, public
service could supply live prices for the three stores the family uses. None
can (researched September 2026):

| Store | What exists | Why it does not work here |
|---|---|---|
| **Walmart** | The [Walmart affiliate API](https://www.walmart.io/docs/affiliate/) returns item prices. | Approval-only (an Impact publisher account and a business case), and it prices **walmart.com**, not a particular store — it takes no store id. |
| **Costco** | Nothing official; Costco publishes no product or price API. | Only paid third-party scrapers exist, and costco.com prices differ from warehouse prices anyway. |
| **Broulim's** | Its online store runs on Instacart Storefront. | Instacart's catalog API is for retailers, not the public, and Instacart prices can carry a markup over the shelf price. |

Paid scraping services (Apify, ScrapingBee and similar) can pull prices from
all three websites, but they cost money per request, are against the stores'
terms, break when a site changes, and still report *website* prices rather
than what the local shelf says. So prices are entered by a parent — quickest
from the Prices tab's **Update price**, standing in the aisle — and every one
carries the date it was checked. Kroger has a genuinely free public price API,
should the family ever shop at Smith's.

## The price API

Since no store publishes prices, the next best thing is a scheduled assistant
(Claude or ChatGPT driving a browser) that visits the three sites each day and
records what it finds. It does that through three narrow endpoints — the only
part of the Meals page reachable without the family login:

| Method and path | Does |
|---|---|
| `GET /api/meals/v1/ingredients?q=cheddar` | Lists ingredients (all of them without `q`): id, name, the `unit` recipes use, the `usualPack`, every store's current price with its pack and per-unit cost, the current `best`, and how many recipes use it. |
| `GET /api/meals/v1/ingredients/{id}` | The same, for one. |
| `PUT /api/meals/v1/ingredients/{id}/prices` | Sets **one store's** price, checked now. |

The PUT body:

```json
{ "store": "Costco", "price": 17.49, "packLabel": "5 lb bag", "packUnits": 20 }
```

- `store` must be `Walmart`, `Broulim's` or `Costco`.
- `price` is dollars for one pack, before tax.
- `packLabel` and `packUnits` go together, and are only needed when the store's
  pack differs from `usualPack`. **`packUnits` is in the ingredient's `unit`** —
  cups of cheese, not pounds of it.
- A price that moves the per-unit cost **3× or more** from what is recorded is
  answered `409 check_pack` — almost always a pack in the wrong unit — and is
  recorded only if sent again with `"confirm": true`.

It cannot create or delete anything, or touch recipes, the plan, the shopping
list or any other page's data. Every price it writes is marked checked (not an
estimate) and dated now; the other stores' prices are left exactly as they were.

**The key.** `Authorization: Bearer <key>`. Make one with
`npm run meals:api-key -- --label "scheduled price check"`, which prints it once
and stores only its SHA-256 in the `mealApiKeys` collection — of whichever
database `.env` points at, which for production is the production cluster.
`--list` shows the keys and when each was last used; `--revoke-all` revokes
them, and deleting one document revokes one key. Ten wrong keys in a minute from
one address block it for ten minutes. `proxy.ts` lets `/api/meals/v1/` through
without a session, as it does `/api/family/`; the recipe photos under
`/api/meals/photo/` stay behind the login.

## Changing a recipe

Made to be done on a phone, by whoever cooks:

1. Open any meal and tap **✎ Edit** (top right of the meal).
2. If the parent PIN has not been entered in the last two hours, it asks for it
   once — then opens straight onto that recipe.
3. Change anything: name, how many it feeds, times, ingredients and amounts,
   the method, tags, the photo. The cost updates as you type.
4. **Save** goes back to the meal, showing the change. **Cancel** (or the
   meal's name at the top) goes back without saving, and asks first if
   anything was changed.

To add a recipe from scratch: **Manage** (top right of the Meals page) → **+ New
recipe**. An ingredient that is not in the list yet can be added from inside
the recipe with **New ingredient…**, without leaving the form.

## Quantities

Stored in the ingredient's own unit (butter in tablespoons, sugar in cups), and
converted **only for display and typing** within the two families that convert
cleanly — `tsp`/`tbsp`/`cup` and `oz`/`lb`. So the database says 0.1875 cup of
sugar and the page says "3 tbsp"; the editor accepts "1½", "1 1/2", "3/4" or
"0.5" and a unit picker for convertible ingredients. `lib/meals/quantity.ts`.

## Parents: the PIN

**Manage** (top right of the page) goes to `/meals/admin`, which asks for the
**same parent PIN** as `/shop/admin` and the ceremonies — the same
`PARENT_PIN` environment variable and the same two-hour unlock cookie, so a
parent who unlocked one has unlocked all three. **Lock** ends it early.

Behind it:

- **Recipes** — add, edit, copy ("New meal (copy)"), make another version,
  delete. The editor has a live cost preview, scaling by a factor, a
  **New ingredient…** shortcut for anything not in the list yet, an optional
  photo, and a guard against leaving with unsaved changes.
- **Ingredients** — unit, pack, units per pack, a price per store (Walmart,
  Broulim's and Costco always offered, others added), a **different size** for
  any store that sells its own pack, "I checked these today", and nutrition per
  unit. An ingredient any recipe still uses cannot be deleted; the refusal
  names the recipes.
- **Prices tab quick edit** — one box per store, and saving dates them all
  today: "I'm standing at the shelf and this is what it costs."

As with the shop, the page's gate is a convenience: **every action in
`lib/meals/admin-actions.ts` calls `requireParentPin()` first**, so a request
built by hand is refused exactly as the page would refuse it.

### Photos

Taken or chosen on the phone, shrunk **in the browser** to at most 1200px and
under 700 KB of JPEG (`lib/meals/photo-client.ts`), uploaded on save, and
checked again on the server — size, and the file's own signature bytes, not
just its label. Stored in `mealPhotos`, one document per recipe, and served by
`/api/meals/photo/[id]` behind the login with a versioned URL, so a replaced
photo is a new URL and the browser may keep each one for a year.

### Links

A recipe's "original recipe" link must be `http(s)`. A plain URL check accepts
`javascript:` too, and this one is a link on every phone in the house — so it
is refused on save and checked again where it is drawn.

## It works on first open

There is no setup step. The first time `/meals` is loaded against a database
that has never had it, `ensureMealsSeeded` writes the catalog — today 143
recipes (119 cards once versions are grouped) and 231 ingredients, from the
batches below. The starter batch is 89 recipes and 150 ingredients, each with
the pack it usually comes in and nutrition — **but no prices** (below) — and it
creates the indexes.
`npm run db:seed` does the same, for a fresh clone that wants it done up front.

Two things make that safe:

- **Seed ids are hashed from the seed keys** (`seedId` in `lib/meals/seed.ts`).
  Writing the seed twice — two instances on first load, or the page *and* the
  script — collides on `_id` and is skipped, so it can never double the
  catalog or overwrite anything a parent has edited.
- **A marker document** (`mealMeta`, `_id: "seed"`) records which **batches**
  have been written. After that, a meal from a batch that a parent deleted
  stays deleted. Delete the marker to have missing meals put back on the next
  load.

### Batches: adding recipes later

The catalog arrives in batches (`SEED_BATCHES` in `lib/meals/seed.ts`), each
applied once, the first time the app runs with it — so shipping new recipes is
a deploy, with no script to remember:

| Batch | What |
|---|---|
| `starter` | 89 starter recipes and 150 ingredients (`config/meals-seed.ts`). |
| `family-favorites-2026-09` | The family's own 54 recipes and 81 more ingredients (`config/meals-family.ts`): 46 read from the pages the family listed — an archived copy where a site blocked reading — with the method rewritten in our own short steps and a link to the original, plus 8 house recipes (the frozen breads, BLTs, walking tacos, tacos, the smoothie). |

Where a family recipe covers the same dish as a starter one (Waffles, Taco
Soup, Chicken Pot Pie…), the batch's `regroup` makes the starter one a
*version* of the family's, so the family's is the card and the starter is one
tap away. A starter recipe with exactly the same name is renamed
"… (starter)" so the version switcher can tell them apart; one a parent has
already renamed or regrouped is left alone.

Where a page's recipe is only a sauce (Alfredo, Spaghetti Sauce, Butter
Chicken, Orange Chicken, Feijoada), the pasta or rice to serve it with is added
as a line noted "to serve (not in the original)", so the meal costs what dinner
costs. Frying oil counts only the quarter or so that is absorbed.

**No price is ever seeded.** The first version shipped researched estimates,
and on 2026-09-29 the family decided every money figure in the app must be
real, so the estimates were removed from the seed files and deleted from the
production database. Prices now come only from somebody checking them — a
parent's **Update price** on the Prices tab, or the scheduled price check
through the price API. (The `estimated` flag on a price still exists, so an
estimate can never be mistaken for a checked price, but nothing writes one.)

If the database cannot be reached, the page shows the **same starter catalog,
read-only**, with a banner saying so — the same ids, so a plan saved earlier
still points at the right meals.

## What the family's state is, and where it lives

One login means there is no "my favourites" — so favourites, the plan and the
pantry ticks are **the family's**, shared by every phone, and the ratings are
**per person** instead of per account.

| Collection | One document per | Notes |
|---|---|---|
| `mealIngredients` | ingredient | Prices embedded, each with `checkedAt` and `estimated`. |
| `mealRecipes` | recipe | Lines point at ingredients by `_id`; `variantOf` links versions; `photoVersion` versions the photo URL. |
| `mealPhotos` | recipe with a photo | Kept apart so reading the catalog never drags the JPEGs along. |
| `mealFavorites` | favourite recipe | `_id` is the recipe's. |
| `mealRatings` | person per recipe | `_id` is `recipeId:personId`, so one rating each by construction. |
| `mealCooked` | recipe per day made | `_id` is `recipeId:YYYY-MM-DD`; the day is the *phone's* local date. |
| `mealPlan` | — | A single document, `_id: "family"`: the entries and the pantry ticks. |
| `mealMeta` | — | The seed marker, above. |
| `mealApiKeys` | price-API key | `_id` is the key's SHA-256; the key itself is never stored. |

Deleting a recipe removes its photo, favourite, ratings, "made it" log and plan
entries, and promotes its other versions to stand on their own.

### Why these actions revalidate, when the shopping list's don't

The shopping list has a live stream, and a revalidation there would redo a
render both phones already have. This page has no stream and needs none, so
each action ends in `revalidatePath("/meals", "layout")`, and the board draws
the change immediately with `useOptimistic`. That hook drops its overlay when
the transition settles — which was fatal for the shopping list, but is exactly
right here: the re-rendered page arrives in the same response, so the overlay
and the truth change places on one frame, and a failure falls back onto the
unchanged props, which is the undo it should be. See `MealsBoard.tsx`.

## Where things are

```
config/meals.ts            family size, tax, stores, the vocabulary, thresholds
config/meals-seed.ts       the starter catalog
lib/meals/
  types.ts                 JSON-safe shapes shared by server and browser
  quantity.ts              parsing and saying amounts; unit conversion
  costing.ts               costRecipe — the one price calculation
  browse.ts                versions, search, filters, sorts, summary
  plan.ts                  budget, shopping list, store comparison, text export
  optimistic.ts            what each tap does before the server answers
  format.ts                ages and "last made"
  prices.ts                merging typed prices onto stored ones
  seed.ts                  seed ids, the compiled fallback, seed checks
  seed-documents.ts        the seed as MongoDB documents (store + script)
  documents.ts             the collections' document types
  store.ts                 server-only: every read and write, and the first-load seed
  actions.ts               anybody: favourite, rate, made it, plan, pantry, → shopping list
  admin-actions.ts         parents (PIN): ingredients, prices, recipes, photos
  photo-client.ts          browser-only: shrink a photo before upload
  price-api.ts             server-only: the bearer-key price API's three handlers
  price-api-shape.ts       its request and response shapes, and the price-jump check
app/(app)/meals/           the page, and admin/ with its two editors
app/api/meals/photo/[id]/  a recipe's photo, behind the login
app/api/meals/v1/…         the price API — bearer key, not the login
components/meals/          MealsBoard and its tabs, the sheet, the editors
components/dashboard/MealsCardBadge.tsx   "Tonight: Tacos" on the dashboard
```

## What was left out, and why

The feature this was modelled on has a few parts that do not fit this app:

- **Accounts, invites, family-member management, API tokens.** One shared login
  and a roster in `config/family.ts` already cover who the family is; the
  family API has its own keys.
- **Receipt scanning.** It needs an OCR service on the server; nothing in this
  app calls one, and adding a paid vision API for it is a decision, not a
  default. The Prices tab's quick edit is the manual version.
- **USDA nutrition lookup.** It needs an API key and a gram weight for every
  unit ("how many grams is a cup of shredded cheddar") to be right, which the
  catalog does not hold. Nutrition is entered per unit from the label instead,
  and labelled as an estimate.
- **Push reminders.** No web-push setup exists in the app yet.

Each would slot in without reshaping anything above: receipt lines would land
through `updateIngredientPrices`, and USDA figures through `saveIngredient`.
