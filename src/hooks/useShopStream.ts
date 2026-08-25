"use client";

import { useCallback, useEffect, useState } from "react";

import { SHOP_STREAM_RETRY_MS } from "@/config/shop";
import type { ShopState } from "@/lib/shop/state";
import {
  BYE_EVENT,
  parseStateEvent,
  SHOP_STREAM_PATH,
  STATE_EVENT,
} from "@/lib/shop/stream";

/**
 * The shop's live numbers: balances, the family goal, and the pending count.
 *
 * A slimmer cousin of `useShoppingList`. That hook also has to reconcile
 * optimistic local patches against the server's list, because a shopping
 * item is drawn on the tapping phone before the write returns. Here, every
 * mutation — redeeming, contributing, resolving a request — already answers
 * with the fresh number it produced, so the *action's own result* is the
 * optimistic update (see `useShopBalance` usage on `/shop`), and this hook's
 * only job is to bring in what happened on every *other* device.
 */

export type ShopStreamController = {
  state: ShopState;
  live: boolean;
  /** Push a state the page already knows to be current — e.g. right after a
   * successful action — without waiting for the next push. */
  setState: (state: ShopState) => void;
};

export function useShopStream(initial: ShopState): ShopStreamController {
  const [state, setStateValue] = useState<ShopState>(initial);
  const [live, setLive] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [awake, setAwake] = useState(true);

  useEffect(() => {
    function onVisibility() {
      const visible = document.visibilityState === "visible";
      setAwake(visible);
      if (visible) setGeneration((value) => value + 1);
      else setLive(false);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!awake) return;

    const source = new EventSource(SHOP_STREAM_PATH);
    let current = true;
    let retry: ReturnType<typeof setTimeout> | undefined;

    source.addEventListener("open", () => {
      if (current) setLive(true);
    });

    source.addEventListener(STATE_EVENT, (event) => {
      if (!current) return;
      const incoming = parseStateEvent((event as MessageEvent<string>).data);
      if (incoming) setStateValue(incoming);
    });

    source.addEventListener(BYE_EVENT, () => {
      source.close();
      if (current) setGeneration((value) => value + 1);
    });

    source.addEventListener("error", () => {
      if (!current) return;
      setLive(false);
      if (source.readyState === EventSource.CLOSED) {
        retry = setTimeout(
          () => setGeneration((value) => value + 1),
          SHOP_STREAM_RETRY_MS,
        );
      }
    });

    return () => {
      current = false;
      if (retry) clearTimeout(retry);
      source.close();
    };
  }, [awake, generation]);

  const setState = useCallback((next: ShopState) => setStateValue(next), []);

  return { state, live, setState };
}
