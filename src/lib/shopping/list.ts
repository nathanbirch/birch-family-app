/**
 * The shopping list, as a value.
 *
 * Pure functions and the shapes they work on. Nothing here imports React,
 * MongoDB or anything from `next` — which is what lets the same sorting,
 * trimming and reconciliation run on the server when the page is rendered, in
 * the browser when somebody taps a tick, and in a unit test with neither.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CLIENT INVENTS THE ID
 * ---------------------------------------------------------------------------
 * `newItemId()` produces the 24 hex characters MongoDB wants for an `_id`, and
 * the *browser* calls it before the write goes out. That is unusual enough to
 * justify, because two good things fall out of it:
 *
 *   - The row drawn optimistically has the same identity as the row that comes
 *     back from the database, so reconciling the two is an id comparison rather
 *     than a guess about which "Milk" is which.
 *   - The write becomes idempotent. A retry after a flaky connection collides
 *     with its own first attempt on the `_id` index instead of adding the milk
 *     twice.
 *
 * The id is not a secret and confers nothing: every item belongs to the whole
 * family, and the Server Action still checks the session before it writes.
 */

import {
  COMPLETED_HISTORY_LIMIT,
  ITEM_NAME_MAX_LENGTH,
  PENDING_GRACE_MS,
} from "@/config/shopping";
import {
  differenceInCalendarDays,
  formatMediumDate,
  isSameLocalDay,
} from "@/lib/dates";

/** One line on the list. Times are epoch milliseconds, so this is JSON-safe. */
export type ShoppingItem = {
  /** 24 lowercase hex characters — a MongoDB `ObjectId`, as a string. */
  id: string;
  name: string;
  /** The display name of whoever added it. */
  addedBy: string;
  createdAt: number;
  /** `null` while the item is still wanted. */
  completedAt: number | null;
  completedBy: string | null;
};

/**
 * The whole list, in the two halves the page shows.
 *
 * `active` is newest first, because adding something and watching it appear at
 * the top is the one moment the page has to feel instant. `completed` is
 * most-recently-ticked first and capped, because it is a receipt rather than an
 * archive.
 */
export type ShoppingList = {
  active: readonly ShoppingItem[];
  completed: readonly ShoppingItem[];
  /**
   * An opaque token that changes whenever the list does.
   *
   * Compared for *equality* only, never ordered — see `revisionToken()`.
   */
  revision: string;
};

export const EMPTY_LIST: ShoppingList = {
  active: [],
  completed: [],
  revision: revisionToken(0, 0),
};

/* -------------------------------------------------------------------------- */
/* Names                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Tidy up whatever was typed into the box.
 *
 * Collapsing runs of whitespace matters more than it looks: a phone keyboard
 * with autocorrect on produces trailing spaces constantly, and without this
 * "milk " and "milk" would be two different items to the duplicate check below.
 */
export function normaliseItemName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, ITEM_NAME_MAX_LENGTH);
}

/** Is there anything left after tidying it up? */
export function isUsableItemName(raw: string): boolean {
  return normaliseItemName(raw).length > 0;
}

/**
 * The item already on the list that this name would duplicate, if any.
 *
 * Case- and accent-insensitive, so "Milk" does not join "milk" three lines
 * below it. Two people both remembering the milk on the way home is the normal
 * case in a family, not an edge case, and the useful answer is "it's already on
 * there" rather than a second row.
 *
 * Only the *active* half is searched. Something bought last week and ticked off
 * is genuinely wanted again.
 */
export function findDuplicate(
  active: readonly ShoppingItem[],
  name: string,
): ShoppingItem | null {
  const wanted = comparableName(name);
  if (!wanted) return null;
  return active.find((item) => comparableName(item.name) === wanted) ?? null;
}

function comparableName(name: string): string {
  return normaliseItemName(name)
    .toLocaleLowerCase()
    /*
     * Strip the accents rather than compare them. `normalize("NFD")` splits an
     * accented letter into the letter and its mark, and the range below deletes
     * the marks — so "jalapeño" and "jalapeno" are one item, which is what
     * anybody typing either of them meant.
     */
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* -------------------------------------------------------------------------- */
/* Ids                                                                         */
/* -------------------------------------------------------------------------- */

const ID_PATTERN = /^[0-9a-f]{24}$/;

/** Is this the shape of an id this app issues? */
export function isItemId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/**
 * A fresh id, in the shape MongoDB's `ObjectId` accepts.
 *
 * Twelve random bytes rather than the real ObjectId layout (timestamp, machine,
 * counter). Nothing in the app reads a meaning out of an id, and the driver is
 * happy with any 24 hex characters, so randomness is both simpler and the
 * stronger guarantee against two devices colliding.
 */
export function newItemId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------------------------------------------------- */
/* Building a list                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Sort a flat set of items into the two halves the page shows.
 *
 * One function, used by the database read and by every local edit, so the
 * order can never differ between "what the server sent" and "what the browser
 * worked out a moment ago".
 */
export function toList(
  items: readonly ShoppingItem[],
  revision: string,
): ShoppingList {
  const active: ShoppingItem[] = [];
  const completed: ShoppingItem[] = [];

  for (const item of items) {
    (item.completedAt === null ? active : completed).push(item);
  }

  active.sort((a, b) => b.createdAt - a.createdAt);
  completed.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  return {
    active,
    completed: completed.slice(0, COMPLETED_HISTORY_LIMIT),
    revision,
  };
}

/**
 * The token the live stream watches.
 *
 * A count and the newest timestamp, which between them notice everything that
 * can happen to this list: adding or ticking moves the timestamp, and deleting
 * moves the count — including the case where the deleted row was the newest one
 * and the timestamp therefore goes *backwards*.
 *
 * Compared for equality only. It is deliberately not an ordering: making it one
 * would need a counter document and a second write per change, and nothing here
 * needs to know which of two revisions came first.
 */
export function revisionToken(count: number, newestUpdateMs: number): string {
  return `${count}:${newestUpdateMs}`;
}

/* -------------------------------------------------------------------------- */
/* Local edits                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A change one device has made and the database may not know about yet.
 *
 * These exist for exactly as long as it takes the write to land and the stream
 * to say so. See `reconcile()`.
 */
export type ShoppingPatch =
  | { kind: "add"; item: ShoppingItem }
  | {
      kind: "complete";
      id: string;
      /** `true` ticks it off, `false` puts it back on the list. */
      done: boolean;
      at: number;
      by: string;
    }
  | { kind: "remove"; id: string };

/** The id the patch is about, whichever kind it is. */
export function patchTarget(patch: ShoppingPatch): string {
  return patch.kind === "add" ? patch.item.id : patch.id;
}

/** The list as it will look once `patch` has landed. */
export function applyPatch(
  list: ShoppingList,
  patch: ShoppingPatch,
): ShoppingList {
  const items = [...list.active, ...list.completed];

  switch (patch.kind) {
    case "add": {
      // Never twice. An add replayed after a reconnect is the same item.
      if (items.some((item) => item.id === patch.item.id)) return list;
      return toList([patch.item, ...items], list.revision);
    }

    case "complete": {
      return toList(
        items.map((item) =>
          item.id === patch.id
            ? {
                ...item,
                completedAt: patch.done ? patch.at : null,
                completedBy: patch.done ? patch.by : null,
              }
            : item,
        ),
        list.revision,
      );
    }

    case "remove": {
      return toList(
        items.filter((item) => item.id !== patch.id),
        list.revision,
      );
    }
  }
}

/** Every patch, in order, applied to `list`. */
export function applyPatches(
  list: ShoppingList,
  patches: readonly PendingPatch[],
): ShoppingList {
  return patches.reduce((current, pending) => applyPatch(current, pending.patch), list);
}

/**
 * Has the server caught up with this patch?
 *
 * Deliberately about the *outcome* rather than about the write: a tick made on
 * this phone and the identical tick made on another one are the same fact, and
 * either satisfies the patch. That is what makes the handover seamless — the
 * local change is dropped the moment believing the server would show the same
 * thing, so there is never a frame where the row changes and changes back.
 */
export function isSatisfied(
  list: ShoppingList,
  patch: ShoppingPatch,
): boolean {
  const found = findItem(list, patchTarget(patch));

  switch (patch.kind) {
    case "add":
      return found !== null;
    case "remove":
      return found === null;
    case "complete":
      // A row that has since been deleted is not coming back, so the patch has
      // nothing left to protect either way.
      return found === null || (found.completedAt !== null) === patch.done;
  }
}

export function findItem(list: ShoppingList, id: string): ShoppingItem | null {
  return (
    list.active.find((item) => item.id === id) ??
    list.completed.find((item) => item.id === id) ??
    null
  );
}

/** A patch, and the moment after which the server is believed regardless. */
export type PendingPatch = {
  patch: ShoppingPatch;
  /** Epoch milliseconds. See `PENDING_GRACE_MS`. */
  expiresAt: number;
};

export function pending(patch: ShoppingPatch, nowMs: number): PendingPatch {
  return { patch, expiresAt: nowMs + PENDING_GRACE_MS };
}

/**
 * What is still worth holding on to, given what the server now says.
 *
 * A patch is dropped when the server already agrees with it, or when it has sat
 * unconfirmed for longer than the grace period — and kept otherwise, which is
 * what stops a tick from flickering off and on again while its write is in
 * flight. Nothing here decides *whether* a write succeeded; the action reports
 * that itself.
 */
export function reconcile(
  server: ShoppingList,
  patches: readonly PendingPatch[],
  nowMs: number,
): PendingPatch[] {
  return patches.filter(
    (entry) => nowMs < entry.expiresAt && !isSatisfied(server, entry.patch),
  );
}

/* -------------------------------------------------------------------------- */
/* Reading a list                                                              */
/* -------------------------------------------------------------------------- */

/** "3 things" / "1 thing" — the count under the heading. */
export function describeCount(count: number): string {
  return `${count} ${count === 1 ? "thing" : "things"}`;
}

/**
 * When something was ticked off, at the precision that is actually useful.
 *
 * The question a finished row answers is "has somebody already got this?", and
 * how much of the timestamp helps depends entirely on how long ago it was. Today
 * the time of day is the whole answer; a fortnight ago it is noise and the date
 * is the answer. So the label gets shorter as the memory gets vaguer, rather than
 * printing the same eleven characters for everything.
 */
export function describeCompletion(completedAt: number, nowMs: number): string {
  const then = new Date(completedAt);
  const now = new Date(nowMs);

  if (isSameLocalDay(then, now)) return TIME_FORMAT.format(then);

  const daysAgo = differenceInCalendarDays(then, now);
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) return WEEKDAY_FORMAT.format(then);

  return formatMediumDate(then);
}

/*
 * Both formatters are built once at module load rather than per row.
 * `Intl.DateTimeFormat` is expensive to construct and free to reuse, and the
 * finished list draws up to a hundred of these at a time.
 */
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "long" });
