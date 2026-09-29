/**
 * What the Meals price API reads and writes, as plain data.
 *
 * Pure — no database, no `server-only` — so the request and response shapes
 * can be tested on their own. The handlers are in `price-api.ts`.
 */

import { createHash } from "node:crypto";
import { z } from "zod";

import { MAIN_STORES } from "@/config/meals";

import { cheapestPrice, packOf, perUnitAt } from "./costing";
import type { IngredientView } from "./types";

/** A key is 32 random bytes, base64url — 43 characters. */
export const API_KEY_LENGTH = 43;

/** SHA-256 of a key, hex. What the database stores; the key itself never is. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * How far one update may move an ingredient's per-unit price before it is
 * refused without `confirm: true`.
 *
 * The likeliest mistake an automated shopper makes is not the price — it is
 * the pack: "5 lb bag" recorded as 5 (pounds) rather than 20 (cups). Shredded
 * cheese is four cups a pound, so that is a per-unit price *exactly* four
 * times wrong — which is why the line is three, and inclusive: a first version
 * set it at "more than four" and let precisely that mistake through. A real
 * price almost never triples in a day; when it does, `confirm: true` records
 * it anyway.
 */
export const MAX_PRICE_JUMP = 3;

export const PriceUpdateSchema = z
  .object({
    store: z.enum(MAIN_STORES as unknown as [string, ...string[]]),
    /** Dollars for one pack, before tax. */
    price: z.number().finite().min(0.01).max(1000),
    /** What the store sells: "5 lb bag". Required with `packUnits`. */
    packLabel: z.string().trim().min(1).max(60).optional(),
    /** How many of the ingredient's own unit are in that pack. */
    packUnits: z.number().finite().positive().max(100_000).optional(),
    /** Record it even though the per-unit price moved more than `MAX_PRICE_JUMP`×. */
    confirm: z.boolean().optional(),
  })
  .refine((body) => (body.packLabel === undefined) === (body.packUnits === undefined), {
    message: "Send packLabel and packUnits together, or neither.",
  });

export type PriceUpdate = z.infer<typeof PriceUpdateSchema>;

/** The shape an ingredient is described in, to the price-checking tool. */
export type ApiIngredient = {
  id: string;
  name: string;
  /** What recipes measure it in. `packUnits` is always in this unit. */
  unit: string;
  /** The pack most stores sell, and how many `unit`s it holds. */
  usualPack: { label: string; units: number };
  prices: {
    store: string;
    price: number;
    pack: { label: string; units: number };
    perUnit: number | null;
    checkedAt: string;
    estimated: boolean;
  }[];
  /** The cheapest per unit right now, of the prices recorded. */
  best: { store: string; perUnit: number } | null;
  /** How many recipes use it — a hint at which ones matter most. */
  usedInRecipes: number;
};

export function toApiIngredient(ingredient: IngredientView, usedInRecipes: number): ApiIngredient {
  const best = cheapestPrice(ingredient);
  const bestPerUnit = best ? perUnitAt(ingredient, best) : null;
  return {
    id: ingredient.id,
    name: ingredient.name,
    unit: ingredient.unit,
    usualPack: { label: ingredient.packLabel, units: ingredient.packUnits },
    prices: ingredient.prices.map((price) => ({
      store: price.store,
      price: price.price,
      pack: packOf(ingredient, price),
      perUnit: roundCents(perUnitAt(ingredient, price)),
      checkedAt: new Date(price.checkedAt).toISOString(),
      estimated: price.estimated,
    })),
    best: best && bestPerUnit !== null ? { store: best.store, perUnit: roundCents(bestPerUnit) as number } : null,
    usedInRecipes,
  };
}

/** To a hundredth of a cent — enough for a teaspoon, without float noise. */
function roundCents(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10_000) / 10_000;
}

/**
 * Whether an update moves the per-unit price too far to take on trust.
 *
 * Measured against the same store's current price if it has one, otherwise
 * against the ingredient's cheapest — so a first Costco price is still checked
 * against what the other stores say.
 */
export function suspiciousJump(ingredient: IngredientView, update: PriceUpdate): boolean {
  const units = update.packUnits ?? ingredient.packUnits;
  if (!(units > 0)) return false;
  const next = update.price / units;
  const sameStore = ingredient.prices.find((p) => p.store === update.store);
  const reference = sameStore ?? cheapestPrice(ingredient);
  const before = reference ? perUnitAt(ingredient, reference) : null;
  if (before === null || !(before > 0)) return false;
  const ratio = next / before;
  return ratio >= MAX_PRICE_JUMP || ratio <= 1 / MAX_PRICE_JUMP;
}
