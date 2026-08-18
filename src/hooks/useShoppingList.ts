"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STREAM_RETRY_MS } from "@/config/shopping";
import type { ShoppingActionResult } from "@/lib/shopping/action-result";
import {
  addShoppingItem,
  removeShoppingItem,
  setShoppingItemComplete,
} from "@/lib/shopping/actions";
import {
  applyPatches,
  findDuplicate,
  newItemId,
  normaliseItemName,
  pending,
  reconcile,
  type PendingPatch,
  type ShoppingItem,
  type ShoppingList,
  type ShoppingPatch,
} from "@/lib/shopping/list";
import {
  BYE_EVENT,
  LIST_EVENT,
  parseListEvent,
  streamUrl,
} from "@/lib/shopping/stream";

/**
 * The shopping list as the page sees it: live, and instant.
 *
 * ---------------------------------------------------------------------------
 * TWO SOURCES OF TRUTH, AND THE RULE THAT KEEPS THEM APART
 * ---------------------------------------------------------------------------
 * There are exactly two things this hook knows:
 *
 *   **`server`** — the last list the stream pushed. Authoritative, and shared by
 *   every device in the house.
 *   **`patches`** — changes *this* device has made that the server has not
 *   confirmed yet. Each one expires; see `PENDING_GRACE_MS`.
 *
 * What the page renders is the second applied to the first, so a tick is drawn
 * on the frame it is tapped and a push from another phone never rubs it out
 * mid-flight. A patch is dropped the moment the server's own answer would look
 * the same — which is what makes the handover invisible rather than a flicker.
 * `reconcile()` is that rule, and it is pure and tested.
 *
 * `useOptimistic` would have been the obvious tool and does not fit: it reverts
 * as soon as the transition that made it settles, and these actions deliberately
 * do not revalidate the page (see `lib/shopping/actions.ts`) — so it would revert
 * to a server list that is still up to a poll behind, and every tap would blink.
 *
 * ---------------------------------------------------------------------------
 * THE CONNECTION SLEEPS WHEN THE PAGE DOES
 * ---------------------------------------------------------------------------
 * An open stream is a server function held open, so it is closed the moment the
 * page is hidden and reopened when it comes back — which for a phone in a pocket
 * is almost all of the time. Coming back hands over the revision already in hand,
 * so waking up costs one small query and shows anything missed at once.
 */

export type ShoppingController = {
  list: ShoppingList;
  /** Is the stream currently connected? Drawn as the "Live" dot. */
  live: boolean;
  /** The last thing that went wrong, for a person to read. */
  error: string | null;
  /**
   * The row to draw attention to — the one somebody has just tried to add for a
   * second time.
   */
  flashId: string | null;
  addItem: (name: string) => Promise<void>;
  setDone: (item: ShoppingItem, done: boolean) => Promise<void>;
  removeItem: (item: ShoppingItem) => Promise<void>;
  dismissError: () => void;
};

/** How long a message and a flash stay on screen. */
const MESSAGE_MS = 4_000;
const FLASH_MS = 1_400;

export function useShoppingList(
  initial: ShoppingList,
  me: string,
): ShoppingController {
  const [server, setServer] = useState(initial);
  const [patches, setPatches] = useState<readonly PendingPatch[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const list = useMemo(() => applyPatches(server, patches), [server, patches]);

  /*
   * The revision to reconnect with, held in a ref rather than read from state.
   * The connection effect must not re-run every time the list changes — that
   * would tear down and rebuild the stream on every tap anybody in the house
   * made.
   */
  const revision = useRef(initial.revision);

  /** Bumped to ask for a fresh connection: after a goodbye, or after waking. */
  const [generation, setGeneration] = useState(0);
  const [awake, setAwake] = useState(true);

  const adopt = useCallback((incoming: ShoppingList) => {
    revision.current = incoming.revision;
    setServer(incoming);
    setPatches((current) => reconcile(incoming, current, Date.now()));
  }, []);

  /* --- Messages clear themselves ---------------------------------------- */

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!flashId) return;
    const timer = setTimeout(() => setFlashId(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashId]);

  /* --- Unconfirmed changes do not linger forever ------------------------ */

  /*
   * The backstop for a write that neither succeeded nor reported failing — the
   * phone that went into a lift mid-tap. Without this, a patch the server will
   * never confirm would sit on top of the truth until the page was reloaded.
   */
  useEffect(() => {
    if (patches.length === 0) return;
    const soonest = Math.min(...patches.map((entry) => entry.expiresAt));
    const timer = setTimeout(
      () => setPatches((current) => reconcile(server, current, Date.now())),
      Math.max(0, soonest - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [patches, server]);

  /* --- Sleeping and waking ---------------------------------------------- */

  useEffect(() => {
    function onVisibility() {
      const visible = document.visibilityState === "visible";
      setAwake(visible);

      if (visible) {
        // Waking is also a reason to want a *new* connection rather than
        // whatever the browser may be halfway through retrying.
        setGeneration((value) => value + 1);
      } else {
        // Said here rather than in the effect that closes the stream. Setting
        // state inside an effect body is a cascading render; this is an event
        // handler, which is where a state change belongs.
        setLive(false);
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /* --- The stream ------------------------------------------------------- */

  useEffect(() => {
    // Hidden: no connection at all. `live` was set false by the handler that
    // hid us, so there is nothing to do here but stay closed.
    if (!awake) return;

    const source = new EventSource(streamUrl(revision.current));
    let current = true;
    let retry: ReturnType<typeof setTimeout> | undefined;

    source.addEventListener("open", () => {
      if (current) setLive(true);
    });

    source.addEventListener(LIST_EVENT, (event) => {
      if (!current) return;
      const incoming = parseListEvent((event as MessageEvent<string>).data);
      // A payload this build does not understand costs one message, not the
      // page. See `parseListEvent`.
      if (incoming) adopt(incoming);
    });

    // An orderly handover: this connection has reached its lifetime. Reconnect
    // at once rather than waiting out the browser's retry.
    source.addEventListener(BYE_EVENT, () => {
      source.close();
      if (current) setGeneration((value) => value + 1);
    });

    source.addEventListener("error", () => {
      if (!current) return;
      setLive(false);

      /*
       * `CONNECTING` means the browser is retrying on its own and will succeed
       * when the network comes back — leave it alone. `CLOSED` means it has given
       * up (a non-200 response, most likely a session that has expired), and only
       * a new `EventSource` will ever try again.
       */
      if (source.readyState === EventSource.CLOSED) {
        retry = setTimeout(
          () => setGeneration((value) => value + 1),
          STREAM_RETRY_MS,
        );
      }
    });

    return () => {
      current = false;
      if (retry) clearTimeout(retry);
      source.close();
    };
  }, [awake, generation, adopt]);

  /* --- Changing the list ------------------------------------------------ */

  /**
   * Draw the change now, save it behind, and put it back if the save failed.
   *
   * The patch object's identity is the handle: `reconcile` may have dropped it
   * already by the time the action answers, in which case the filter below is a
   * no-op and the server's version — which agrees — is what stays on screen.
   */
  const attempt = useCallback(
    async (
      patch: ShoppingPatch,
      save: () => Promise<ShoppingActionResult>,
    ) => {
      setError(null);
      setPatches((current) => [...current, pending(patch, Date.now())]);

      const result = await save();
      if (result.ok) return;

      setPatches((current) => current.filter((entry) => entry.patch !== patch));
      setError(result.message);
      if (result.duplicateId) setFlashId(result.duplicateId);
    },
    [],
  );

  const addItem = useCallback(
    async (raw: string) => {
      const name = normaliseItemName(raw);
      if (name.length === 0) return;

      /*
       * Checked here as well as in the action. The action is the one that
       * matters — two phones adding milk cannot see each other's screens — but
       * answering the common case without a round trip is what makes "it's
       * already on there" feel like the page knowing rather than the page
       * failing.
       */
      const existing = findDuplicate(list.active, name);
      if (existing) {
        setError(`${existing.name} is already on the list.`);
        setFlashId(existing.id);
        return;
      }

      const item: ShoppingItem = {
        id: newItemId(),
        name,
        addedBy: me,
        createdAt: Date.now(),
        completedAt: null,
        completedBy: null,
      };

      await attempt({ kind: "add", item }, () =>
        addShoppingItem({ id: item.id, name }),
      );
    },
    [attempt, list.active, me],
  );

  const setDone = useCallback(
    async (item: ShoppingItem, done: boolean) => {
      await attempt(
        { kind: "complete", id: item.id, done, at: Date.now(), by: me },
        () => setShoppingItemComplete({ id: item.id, done }),
      );
    },
    [attempt, me],
  );

  const removeItem = useCallback(
    async (item: ShoppingItem) => {
      await attempt({ kind: "remove", id: item.id }, () =>
        removeShoppingItem({ id: item.id }),
      );
    },
    [attempt],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    list,
    live,
    error,
    flashId,
    addItem,
    setDone,
    removeItem,
    dismissError,
  };
}
