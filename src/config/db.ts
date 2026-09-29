/**
 * Database and collection names.
 *
 * ---------------------------------------------------------------------------
 * WHY A DEDICATED DATABASE
 * ---------------------------------------------------------------------------
 * The Atlas connection string points at a shared cluster that also hosts other
 * applications. Rather than prefixing collection names inside somebody else's
 * database, this app claims a database of its own and never reads or writes
 * outside it. Nothing this app does can collide with, overwrite, or even see
 * another app's data.
 *
 * The connection string in `.env` deliberately has no database path (it ends
 * in `.mongodb.net/`), so the name below is the only thing that decides where
 * data lands. `getDb()` in `src/lib/db.ts` is the single place that resolves
 * it, and every query in the app goes through there.
 *
 * When you add chore charts, rewards, stars, mantras or the calendar, add the
 * collection name here — do not hardcode strings at the call site.
 */

/** Every collection this app touches lives in this database. Nothing else. */
export const DB_NAME = "birch_family_app";

export const COLLECTIONS = {
  /** Login accounts. One document per person who can sign in. */
  users: "users",
  /**
   * Server-side session records. The cookie holds a signed pointer to one of
   * these, so a session can be revoked server-side by deleting the document.
   */
  sessions: "sessions",
  /**
   * The nightly pet rotation. One document per animal, holding the order the
   * children take their turn in and the anchor that fixes where in it we are.
   *
   * This is the first collection that holds something the family can *see*
   * rather than something the login needs, and it is in the database rather
   * than in `src/config/pets.ts` precisely so it can be re-anchored without a
   * deploy. See docs/pets.md.
   */
  petRotations: "petRotations",
  /**
   * The monthly chore rotation. One document per pool, holding the children,
   * the chores they deal round, and the month the deal is known to be right
   * for. Same reasoning as `petRotations`: this is the half of the star charts
   * that must be re-anchorable without a deploy. See docs/stars.md.
   */
  choreRotations: "choreRotations",
  /**
   * Ticked stars. One document per child per week — see `lib/stars/marks.ts`
   * for why the week is the unit rather than the day or the task.
   */
  starWeeks: "starWeeks",
  /**
   * The Bored Page's ideas — all of them, built-in and family-added alike.
   *
   * This collection is *seeded* from `src/config/bored.ts` rather than replacing
   * it: the arrays there are still where a built-in idea and its drawing are
   * declared, and they are what the page falls back to when the cluster cannot
   * be reached. What moved into the database is the ability to add one without a
   * deploy, which is the same argument `petRotations` won. See docs/bored.md.
   */
  boredIdeas: "boredIdeas",
  /**
   * The family shopping list. One document per line on it.
   *
   * The first collection in the app that several people write to at the same
   * time, and the first whose *changes* have to reach other devices rather than
   * merely being there next time somebody looks. It is also the only one where
   * the unit anybody edits is the document — the stars deliberately bucket a
   * whole week into one — because that is what a shopping list is. See
   * docs/shopping.md.
   */
  shoppingItems: "shoppingItems",
  /**
   * Daily request counters for the read-only family-context API — one
   * document per counter per day, holding an integer and a TTL.
   *
   * This is the only collection in the app that exists for a *limit* rather
   * than for something the family can see. It is here rather than in memory
   * because the ceilings it enforces are the ones that bound the bill, and a
   * per-instance counter bounds nothing on a platform that runs several
   * instances. See `lib/family-api/usage.ts`, which explains why this is the
   * cheapest durable store available without adding Redis.
   *
   * Documents expire on their own via a TTL index, so nothing accumulates and
   * there is nothing to prune by hand.
   */
  familyApiUsage: "familyApiUsage",
  /**
   * The reward catalogue — one document per thing coins can buy. `tier`
   * ("quick" | "special" | "epic" | "ultimate") and `position` are what
   * `/shop` sorts and groups by. Soft-deleted (`active: false`) rather than
   * removed, because a redemption from six months ago still has to be able to
   * say what it was for even after a parent retires the reward — see
   * `rewardRedemptions` below, which snapshots the name and cost at the
   * moment of purchase for exactly that reason.
   *
   * Lives in the database rather than in `config/rewards.ts` on purpose: this
   * is the one catalogue in the app a parent edits from a phone rather than
   * from a pull request, which is the whole point of `/shop/admin`.
   */
  rewardItems: "rewardItems",
  /**
   * The coin ledger — append-only, one document per credit or debit. A
   * child's balance is never stored; it is the sum of their rows here,
   * computed the same forgiving way `starWeeks` totals are, and never
   * trusted from the client. See `lib/coins/store.ts`.
   *
   * `type: "ceremony_conversion"` rows carry `weekStart`, unique per child, so
   * rewatching a ceremony can never mint the same week's coins twice — the
   * same duplicate-key guard `starWeeks` uses for the same reason.
   */
  coinTransactions: "coinTransactions",
  /**
   * One document per attempt to spend coins on something in `rewardItems`.
   *
   * This is the collection that answers "when did this happen, who did it,
   * for what, and how many times has it happened" — the redemption history a
   * ledger of debits alone cannot reconstruct once a catalogue item's price
   * or name changes. That is why it snapshots `rewardNameSnapshot`,
   * `rewardCostSnapshot` and `rewardTierSnapshot` rather than joining back to
   * `rewardItems` for them. See `lib/rewards/store.ts#getRedemptionCounts`
   * for the one place redemption counts are computed, reused by both the
   * redemption-limit check and the admin screen's usage stats.
   */
  rewardRedemptions: "rewardRedemptions",
  /**
   * The Ultimate tier's pooled family goal — contributions from every child
   * toward one big reward. One `active` document at a time; redeeming it
   * flips it to `"redeemed"` and a fresh `active` one is created immediately
   * so contributing can carry straight on. See `lib/rewards/store.ts`.
   */
  rewardPools: "rewardPools",
  /**
   * One document per Star Award Ceremony ever opened — weekly or spanning —
   * keyed by the same `slug` the page addresses it by (a week's Monday, or a
   * span's id from `config/ceremonies.ts`).
   *
   * Its only job is answering "has anybody opened this one before?". The
   * first open of a ceremony needs the parent PIN and is the one chance to
   * choose cash or coins (see `lib/coins/actions.ts` and
   * `lib/ceremonies/views-store.ts`); every open after that shows the same
   * ceremony straight away. Nothing is ever deleted from this collection —
   * once opened, always opened.
   */
  ceremonyViews: "ceremonyViews",
  /*
   * ---------------------------------------------------------------------------
   * THE MEALS PAGE
   * ---------------------------------------------------------------------------
   * Eight collections, in two kinds. The catalog — ingredients, recipes, and
   * the recipes' photos — is what a parent edits behind the PIN. Everything
   * else is what the family has *done* with it: the plan, favourites, who
   * liked what, and when it was last made. See docs/meals.md and
   * `lib/meals/store.ts`.
   */
  /**
   * One document per thing bought: its unit, its pack, a price per shop and
   * its nutrition. Seeded from `config/meals-seed.ts` on first use, with ids
   * hashed from the seed keys — see `lib/meals/seed.ts`.
   */
  mealIngredients: "mealIngredients",
  /** One document per recipe, its lines pointing at `mealIngredients` by `_id`. */
  mealRecipes: "mealRecipes",
  /**
   * One document per recipe that has a photo, keyed by the recipe's `_id`.
   * Kept out of `mealRecipes` so reading the catalog never drags a hundred
   * JPEGs along with it; `/api/meals/photo/[id]` serves them one at a time.
   */
  mealPhotos: "mealPhotos",
  /** One document per favourite recipe, keyed by the recipe's `_id`. */
  mealFavorites: "mealFavorites",
  /** One document per person per recipe, keyed `recipeId:personId`. */
  mealRatings: "mealRatings",
  /**
   * One document per recipe per day it was made, keyed `recipeId:YYYY-MM-DD`.
   * What "Haven't had in a while" sorts by.
   */
  mealCooked: "mealCooked",
  /** The family's week: a single document, `_id: "family"`. */
  mealPlan: "mealPlan",
  /**
   * Bookkeeping: a single document, `_id: "seed"`, recording that the starter
   * catalog has been written. Delete it to have the seed re-added on the next
   * page load — which restores deleted starter meals but never duplicates or
   * overwrites anything.
   */
  mealMeta: "mealMeta",
  /**
   * Keys for the Meals price API (`/api/meals/v1/…`) — the one door a
   * scheduled price-checking assistant uses to read ingredients and record
   * what a store charges today. One document per key, `_id` the key's SHA-256
   * in hex: the key itself is shown once when it is made
   * (`npm run meals:api-key`) and stored nowhere. Delete a document to revoke
   * that key. See docs/meals.md#the-price-api.
   */
  mealApiKeys: "mealApiKeys",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
