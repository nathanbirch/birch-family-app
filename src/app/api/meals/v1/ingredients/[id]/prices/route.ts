import { putStorePrice } from "@/lib/meals/price-api";

/**
 * Set one store's price on one ingredient, checked now. The only write the
 * price API allows. Bearer-key only; see `lib/meals/price-api.ts`.
 */
export const PUT = putStorePrice;

export const dynamic = "force-dynamic";
