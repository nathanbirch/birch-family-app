import { describe, expect, it } from "vitest";

import {
  ACTIVE_ITEM_LIMIT,
  COMPLETED_HISTORY_LIMIT,
  ITEM_NAME_MAX_LENGTH,
  PENDING_GRACE_MS,
} from "@/config/shopping";
import {
  applyPatch,
  applyPatches,
  describeCompletion,
  describeCount,
  findDuplicate,
  findItem,
  isItemId,
  isSatisfied,
  isUsableItemName,
  newItemId,
  normaliseItemName,
  pending,
  patchTarget,
  reconcile,
  revisionToken,
  toList,
  type ShoppingItem,
  type ShoppingList,
} from "@/lib/shopping/list";

/*
 * The shopping list's whole promise lives in this module: that two phones agree
 * about what is on the list, that a tick drawn before its write lands is not
 * rubbed out by somebody else's change arriving, and that a tick which never
 * lands does not stay on screen forever.
 */

const T = Date.UTC(2026, 7, 18, 12, 0, 0);

function item(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: newItemId(),
    name: "Milk",
    addedBy: "Birch Family",
    createdAt: T,
    completedAt: null,
    completedBy: null,
    ...overrides,
  };
}

function list(items: ShoppingItem[]): ShoppingList {
  return toList(items, revisionToken(items.length, T));
}

describe("tidying up what was typed", () => {
  it("trims and collapses whitespace", () => {
    // Phone keyboards produce trailing spaces constantly, and without this
    // "milk " and "milk" would be two different items to the duplicate check.
    expect(normaliseItemName("  brown   bread \n")).toBe("brown bread");
  });

  it("cuts a name off rather than refusing it", () => {
    const long = "a".repeat(ITEM_NAME_MAX_LENGTH + 40);
    expect(normaliseItemName(long)).toHaveLength(ITEM_NAME_MAX_LENGTH);
  });

  it("has nothing usable in whitespace", () => {
    expect(isUsableItemName("   ")).toBe(false);
    expect(isUsableItemName("\t\n")).toBe(false);
    expect(isUsableItemName(" x ")).toBe(true);
  });
});

describe("already on the list", () => {
  it("ignores case and stray spaces", () => {
    const active = [item({ name: "Milk" })];
    expect(findDuplicate(active, "  milk ")?.name).toBe("Milk");
  });

  it("ignores accents", () => {
    // Whoever types "jalapeno" means the thing already written "jalapeño".
    const active = [item({ name: "Jalapeño" })];
    expect(findDuplicate(active, "jalapeno")?.name).toBe("Jalapeño");
  });

  it("does not match something merely similar", () => {
    const active = [item({ name: "Milk" })];
    expect(findDuplicate(active, "milk chocolate")).toBeNull();
  });

  it("only looks at what is still wanted", () => {
    /*
     * The reason it takes `active` rather than the whole list. Bread bought last
     * week is genuinely wanted again, and refusing it would make the page argue
     * with somebody who is right.
     */
    const bought = item({ name: "Bread", completedAt: T });
    const whole = list([bought]);
    expect(findDuplicate(whole.active, "bread")).toBeNull();
    expect(whole.completed).toHaveLength(1);
  });

  it("finds nothing in an empty name", () => {
    expect(findDuplicate([item({ name: "Milk" })], "   ")).toBeNull();
  });
});

describe("ids", () => {
  it("makes ones MongoDB will accept", () => {
    const id = newItemId();
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(isItemId(id)).toBe(true);
  });

  it("does not repeat itself", () => {
    const ids = new Set(Array.from({ length: 500 }, newItemId));
    expect(ids.size).toBe(500);
  });

  it("rejects anything that is not one", () => {
    // This value reaches MongoDB as an `_id`, so the gate matters.
    expect(isItemId("")).toBe(false);
    expect(isItemId("milk")).toBe(false);
    expect(isItemId("ABCDEF012345678901234567")).toBe(false);
    expect(isItemId(`${newItemId()}0`)).toBe(false);
  });
});

describe("sorting the list", () => {
  it("puts the newest wanted thing first", () => {
    const built = list([
      item({ name: "old", createdAt: T - 1000 }),
      item({ name: "new", createdAt: T }),
    ]);
    expect(built.active.map((entry) => entry.name)).toEqual(["new", "old"]);
  });

  it("puts the most recently bought thing first", () => {
    const built = list([
      item({ name: "first", completedAt: T - 1000 }),
      item({ name: "last", completedAt: T }),
    ]);
    expect(built.completed.map((entry) => entry.name)).toEqual(["last", "first"]);
  });

  it("shows only the newest hundred bought things", () => {
    const many = Array.from({ length: COMPLETED_HISTORY_LIMIT + 25 }, (_, index) =>
      item({ name: `thing ${index}`, completedAt: T + index }),
    );
    const built = list(many);
    expect(built.completed).toHaveLength(COMPLETED_HISTORY_LIMIT);
    // The cap takes the oldest off the end, not the newest off the front.
    expect(built.completed[0].name).toBe(`thing ${many.length - 1}`);
  });

  it("keeps the two halves apart", () => {
    const built = list([item({ name: "want" }), item({ name: "got", completedAt: T })]);
    expect(built.active.map((entry) => entry.name)).toEqual(["want"]);
    expect(built.completed.map((entry) => entry.name)).toEqual(["got"]);
  });
});

describe("the revision token", () => {
  it("changes when something is added", () => {
    expect(revisionToken(3, T)).not.toBe(revisionToken(4, T + 1));
  });

  it("changes when something is deleted, even though the clock went backwards", () => {
    /*
     * The case a timestamp alone would miss. Deleting the newest row lowers the
     * maximum `updatedAt`, so without the count in the token a delete could
     * produce a revision the stream had already sent — and every other phone
     * would keep showing the deleted row until the next unrelated change.
     */
    const before = revisionToken(4, T + 500);
    const afterDelete = revisionToken(3, T);
    expect(afterDelete).not.toBe(before);
  });

  it("is the same for the same list", () => {
    expect(revisionToken(2, T)).toBe(revisionToken(2, T));
  });
});

describe("changes made on this device", () => {
  it("adds a row at the top", () => {
    const before = list([item({ name: "Bread", createdAt: T - 1000 })]);
    const fresh = item({ name: "Milk", createdAt: T });
    const after = applyPatch(before, { kind: "add", item: fresh });
    expect(after.active.map((entry) => entry.name)).toEqual(["Milk", "Bread"]);
  });

  it("never adds the same row twice", () => {
    // A replayed add after a reconnect is the same item, not a second one.
    const fresh = item();
    const once = applyPatch(list([]), { kind: "add", item: fresh });
    const twice = applyPatch(once, { kind: "add", item: fresh });
    expect(twice.active).toHaveLength(1);
  });

  it("moves a ticked row into the bought half", () => {
    const milk = item({ name: "Milk" });
    const after = applyPatch(list([milk]), {
      kind: "complete",
      id: milk.id,
      done: true,
      at: T,
      by: "Dad",
    });
    expect(after.active).toHaveLength(0);
    expect(after.completed[0].completedBy).toBe("Dad");
  });

  it("puts an unticked row back, forgetting who ticked it", () => {
    const milk = item({ name: "Milk", completedAt: T, completedBy: "Dad" });
    const after = applyPatch(list([milk]), {
      kind: "complete",
      id: milk.id,
      done: false,
      at: T,
      by: "Mum",
    });
    expect(after.active).toHaveLength(1);
    expect(after.active[0].completedBy).toBeNull();
  });

  it("removes a row", () => {
    const milk = item();
    const after = applyPatch(list([milk]), { kind: "remove", id: milk.id });
    expect(findItem(after, milk.id)).toBeNull();
  });

  it("ignores a change to a row that is not there", () => {
    const before = list([item()]);
    const after = applyPatch(before, { kind: "remove", id: newItemId() });
    expect(after.active).toHaveLength(1);
  });

  it("names the row a patch is about", () => {
    const milk = item();
    expect(patchTarget({ kind: "add", item: milk })).toBe(milk.id);
    expect(patchTarget({ kind: "remove", id: milk.id })).toBe(milk.id);
  });

  it("applies several in order", () => {
    const bread = item({ name: "Bread" });
    const milk = item({ name: "Milk", createdAt: T + 10 });
    const after = applyPatches(list([]), [
      pending({ kind: "add", item: bread }, T),
      pending({ kind: "add", item: milk }, T),
      pending({ kind: "remove", id: bread.id }, T),
    ]);
    expect(after.active.map((entry) => entry.name)).toEqual(["Milk"]);
  });
});

describe("has the server caught up?", () => {
  it("an add is satisfied once the row is there", () => {
    const milk = item();
    expect(isSatisfied(list([]), { kind: "add", item: milk })).toBe(false);
    expect(isSatisfied(list([milk]), { kind: "add", item: milk })).toBe(true);
  });

  it("a removal is satisfied once the row is gone", () => {
    const milk = item();
    expect(isSatisfied(list([milk]), { kind: "remove", id: milk.id })).toBe(false);
    expect(isSatisfied(list([]), { kind: "remove", id: milk.id })).toBe(true);
  });

  it("a tick is satisfied by anybody's tick, not only this one", () => {
    /*
     * The rule that makes the handover seamless. Somebody else ticking the same
     * thing is the same fact, so the local change is dropped rather than held on
     * top of an identical truth — which is what stops a row changing and changing
     * back.
     */
    const milk = item();
    const patch = { kind: "complete" as const, id: milk.id, done: true, at: T, by: "Me" };
    expect(isSatisfied(list([milk]), patch)).toBe(false);
    const theirTick = list([{ ...milk, completedAt: T, completedBy: "Someone else" }]);
    expect(isSatisfied(theirTick, patch)).toBe(true);
  });

  it("a tick on a row that has since been deleted has nothing left to protect", () => {
    const milk = item();
    expect(
      isSatisfied(list([]), {
        kind: "complete",
        id: milk.id,
        done: true,
        at: T,
        by: "Me",
      }),
    ).toBe(true);
  });
});

describe("reconciling", () => {
  it("keeps a change the server has not heard about yet", () => {
    const milk = item();
    const patches = [pending({ kind: "add", item: milk }, T)];
    expect(reconcile(list([]), patches, T + 100)).toHaveLength(1);
  });

  it("drops a change the server now agrees with", () => {
    const milk = item();
    const patches = [pending({ kind: "add", item: milk }, T)];
    expect(reconcile(list([milk]), patches, T + 100)).toHaveLength(0);
  });

  it("gives up on a change that never landed", () => {
    /*
     * The backstop. A phone that went into a lift mid-tap must not keep showing
     * a tick the database never got — past the grace period the server wins and
     * the row springs back.
     */
    const milk = item();
    const patches = [pending({ kind: "add", item: milk }, T)];
    expect(reconcile(list([]), patches, T + PENDING_GRACE_MS + 1)).toHaveLength(0);
  });

  it("holds on right up to the deadline", () => {
    const milk = item();
    const patches = [pending({ kind: "add", item: milk }, T)];
    expect(reconcile(list([]), patches, T + PENDING_GRACE_MS - 1)).toHaveLength(1);
  });
});

describe("reading it out", () => {
  it("counts things in English", () => {
    expect(describeCount(0)).toBe("0 things");
    expect(describeCount(1)).toBe("1 thing");
    expect(describeCount(7)).toBe("7 things");
  });

  it("gives the time of day for something bought today", () => {
    const now = new Date(2026, 7, 18, 17, 30);
    const earlier = new Date(2026, 7, 18, 16, 12);
    // Locale-dependent, so this asserts the shape rather than the exact string.
    expect(describeCompletion(earlier.getTime(), now.getTime())).toMatch(/\d/);
    expect(describeCompletion(earlier.getTime(), now.getTime())).not.toBe("Yesterday");
  });

  it("says Yesterday for yesterday", () => {
    const now = new Date(2026, 7, 18, 9, 0);
    const yesterday = new Date(2026, 7, 17, 22, 0);
    expect(describeCompletion(yesterday.getTime(), now.getTime())).toBe("Yesterday");
  });

  it("names the weekday inside the last week", () => {
    const now = new Date(2026, 7, 18, 9, 0);
    const saturday = new Date(2026, 7, 15, 10, 0);
    expect(describeCompletion(saturday.getTime(), now.getTime())).toBe("Saturday");
  });

  it("falls back to the date once the weekday would be ambiguous", () => {
    // Past seven days "Tuesday" could mean either of two Tuesdays.
    const now = new Date(2026, 7, 18, 9, 0);
    const old = new Date(2026, 6, 30, 10, 0);
    expect(describeCompletion(old.getTime(), now.getTime())).toMatch(/2026/);
  });
});

describe("the ceilings", () => {
  it("are the ones the page and the action both work from", () => {
    /*
     * There is no logic to test here — the point is that these are declared once
     * and shared. A second copy of "100" anywhere would be the bug this asserts
     * against.
     */
    expect(COMPLETED_HISTORY_LIMIT).toBe(100);
    expect(ACTIVE_ITEM_LIMIT).toBeGreaterThan(COMPLETED_HISTORY_LIMIT);
    expect(ITEM_NAME_MAX_LENGTH).toBeGreaterThan(20);
  });
});
