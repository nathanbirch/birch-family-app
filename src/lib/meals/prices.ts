import type { PriceDocument } from "./documents";

export type TypedPrice = {
  store: string;
  price: number;
  /** A pack of this store's own — see `PriceView`. Both or neither. */
  packLabel?: string;
  packUnits?: number;
};

/**
 * Merge freshly typed prices onto the ones already stored.
 *
 * Pure, and separate from the store so it can be tested without a database.
 *
 * Editing an ingredient's name must not reset "last checked" on its prices,
 * so a price that comes back unchanged keeps its date and its "estimate"
 * flag — unless `confirm` is set, which is the Prices tab's "I just checked
 * these" and dates every one of them today. A price that changed is by
 * definition just checked — and so is one whose pack size changed, since
 * "$14 for a 5 lb bag" is a different price from "$14 for a 2 lb bag". A store
 * left out of `next` is dropped.
 */
export function mergePrices(
  previous: readonly PriceDocument[],
  next: readonly TypedPrice[],
  now: Date,
  confirm: boolean,
): PriceDocument[] {
  return next.map(({ store, price, packLabel, packUnits }) => {
    const pack: { packLabel?: string; packUnits?: number } =
      packUnits && packUnits > 0 ? { packLabel: packLabel ?? "", packUnits } : {};
    const before = previous.find((p) => p.store === store);
    const samePack = (before?.packUnits ?? 0) === (pack.packUnits ?? 0);
    if (before && samePack && !confirm && Math.abs(before.price - price) < 0.005) {
      return { ...before, ...pack };
    }
    return { store, price, checkedAt: now, estimated: false, ...pack };
  });
}
