import { getIngredient } from "@/lib/meals/price-api";

/** One ingredient, by id. Bearer-key only; see `lib/meals/price-api.ts`. */
export const GET = getIngredient;

export const dynamic = "force-dynamic";
