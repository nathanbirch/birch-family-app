import { listIngredients } from "@/lib/meals/price-api";

/**
 * Every ingredient, with its id, unit, usual pack and current prices — for the
 * scheduled price check. Bearer-key only; see `lib/meals/price-api.ts`.
 */
export const GET = listIngredients;

export const dynamic = "force-dynamic";
