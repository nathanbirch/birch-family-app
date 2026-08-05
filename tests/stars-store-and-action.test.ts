/**
 * @vitest-environment node
 *
 * The chore-rotation store and the `setStar` Server Action.
 *
 * Both are boundaries: one between the database and the page, the other
 * between the internet and the database. The store's job is to degrade rather
 * than break; the action's job is to refuse anything it was not asked for,
 * whether or not the request came from the page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const collection = vi.hoisted(() => ({ find: vi.fn() }));
const getCollection = vi.hoisted(() => vi.fn(async () => collection));
const requireUser = vi.hoisted(() => vi.fn(async () => ({ id: "u1" })));
const setStarMark = vi.hoisted(() => vi.fn(async () => {}));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getCollection }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/lib/auth/dal", () => ({ requireUser }));
vi.mock("@/lib/stars/marks", () => ({ setStarMark }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { getChorePools } = await import("@/lib/stars/rotation-store");
const { setStar } = await import("@/lib/stars/actions");
const { CHORE_POOLS } = await import("@/config/chore-rotation");

function findReturns(documents: unknown[]) {
  collection.find.mockReturnValue({ toArray: async () => documents });
}

/** A valid stored pool, which tests then break in one way each. */
function stored(overrides: Record<string, unknown> = {}) {
  return {
    poolId: "bigs",
    name: "The big three",
    children: ["clara", "emily", "hannah"],
    chores: [
      "pick-up-living-room",
      "dishwasher",
      "kitchen-island",
      "vacuum-living-room",
      "yard-pickup",
      "bath-trash",
    ],
    anchorMonth: "2026-08",
    ...overrides,
  };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  findReturns([]);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("reading the pools", () => {
  it("falls back to the compiled pools when the collection is empty", async () => {
    const pools = await getChorePools();
    expect(pools).toEqual(CHORE_POOLS);
  });

  it("prefers what is stored", async () => {
    findReturns([stored({ anchorMonth: "2026-09" })]);

    const pools = await getChorePools();
    const bigs = pools.find((pool) => pool.id === "bigs")!;
    expect(bigs.anchorMonth).toBe("2026-09");
    // The pool with no document keeps its compiled default rather than
    // vanishing and taking its children's chores with it.
    expect(pools.find((pool) => pool.id === "littles")).toEqual(CHORE_POOLS[1]);
  });

  it("keeps the configured order however the documents come back", async () => {
    findReturns([
      { ...stored(), poolId: "littles", children: ["james", "william"], chores: ["feed-bella", "vacuum-wooden-floor"] },
      stored(),
    ]);
    const pools = await getChorePools();
    expect(pools.map((pool) => pool.id)).toEqual(["bigs", "littles"]);
  });

  it("ignores one malformed document and keeps the rest", async () => {
    findReturns([
      stored({ anchorMonth: "August 2026" }), // fails the YYYY-MM check
    ]);

    const pools = await getChorePools();
    expect(pools).toEqual(CHORE_POOLS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("malformed"));
  });

  it.each([
    ["an unknown pool id", stored({ poolId: "middles" })],
    ["no children", stored({ children: [] })],
    ["no chores", stored({ chores: [] })],
    ["a child who is not in the family", stored({ children: ["gandalf"] })],
    ["a name that is missing", stored({ name: undefined })],
  ])("ignores a document with %s", async (_label, document) => {
    findReturns([document]);
    const pools = await getChorePools();
    expect(pools).toEqual(CHORE_POOLS);
  });

  it("falls back wholesale when the stored set is unusable", async () => {
    // Valid on its own, but it hands the littles' chores to the big three —
    // which leaves William and James with nothing and two children told to do
    // the same job.
    findReturns([
      stored({ chores: [...stored().chores, "feed-bella"] }),
    ]);

    const pools = await getChorePools();
    expect(pools).toEqual(CHORE_POOLS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unusable"));
  });

  it("falls back when the database cannot be reached", async () => {
    collection.find.mockImplementation(() => {
      throw new Error("connection refused");
    });

    const pools = await getChorePools();
    expect(pools).toEqual(CHORE_POOLS);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("could not be reached"),
    );
  });

  it("says what went wrong in the log, for whoever has to fix it", async () => {
    collection.find.mockImplementation(() => {
      throw new Error("connection refused");
    });
    await getChorePools();
    expect(warn.mock.calls[0][0]).toContain("connection refused");
  });
});

describe("the setStar action", () => {
  const valid = {
    childId: "hannah",
    weekStart: "2026-08-03",
    taskId: "piano",
    dayIndex: 2,
    value: true,
  };

  it("requires somebody to be signed in, before anything else happens", async () => {
    requireUser.mockRejectedValueOnce(new Error("REDIRECT"));
    await expect(setStar(valid)).rejects.toThrow("REDIRECT");
    expect(setStarMark).not.toHaveBeenCalled();
  });

  it("saves a legitimate star and refreshes the page", async () => {
    const result = await setStar(valid);

    expect(result).toEqual({ ok: true });
    expect(setStarMark).toHaveBeenCalledWith(
      "hannah",
      "2026-08-03",
      "piano",
      2,
      true,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/stars");
  });

  it.each([
    ["an unknown child", { childId: "gandalf" }],
    ["a parent", { childId: "nathan" }],
    ["an empty child", { childId: "" }],
    ["a week that is not a date", { weekStart: "next week" }],
    ["a day below the week", { dayIndex: -1 }],
    ["a day past Friday", { dayIndex: 5 }],
    ["a fractional day", { dayIndex: 1.5 }],
    ["a value that is not a boolean", { value: "yes" as unknown as boolean }],
    ["an empty task", { taskId: "" }],
    ["a task id long enough to be an attack", { taskId: "x".repeat(65) }],
  ])("refuses %s", async (_label, patch) => {
    const result = await setStar({ ...valid, ...patch });
    expect(result.ok).toBe(false);
    expect(setStarMark).not.toHaveBeenCalled();
  });

  it("refuses a week that is not a Monday", async () => {
    // Otherwise a second, offset set of documents could be opened for the same
    // seven days.
    const result = await setStar({ ...valid, weekStart: "2026-08-04" });
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/week/i) });
    expect(setStarMark).not.toHaveBeenCalled();
  });

  it("refuses a task that is not on that child's chart", async () => {
    // Rendering only a child's own tasks is a rendering decision, not a
    // security boundary: this endpoint is reachable directly.
    const result = await setStar({ ...valid, taskId: "write-alphabet" });
    expect(result).toEqual({ ok: false, message: "That is not on this chart." });
    expect(setStarMark).not.toHaveBeenCalled();
  });

  it("refuses a chore that belongs to a different child this month", async () => {
    // August 2026: the dishwasher is Emily's, not Hannah's. Accepting it would
    // put stars in the weekly report that nobody could have earned.
    const result = await setStar({ ...valid, taskId: "dishwasher" });
    expect(result.ok).toBe(false);
  });

  it("accepts that same chore for the child who does have it", async () => {
    const result = await setStar({
      ...valid,
      childId: "emily",
      taskId: "dishwasher",
    });
    expect(result).toEqual({ ok: true });
  });

  it("reports a write that failed, without leaking the reason", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    setStarMark.mockRejectedValueOnce(new Error("connection refused"));

    const result = await setStar(valid);

    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).not.toContain("connection");
    expect((result as { message: string }).message).toMatch(/try again/i);
    // …but it is in the log for whoever has to fix it.
    expect(error).toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("unticks as readily as it ticks", async () => {
    const result = await setStar({ ...valid, value: false });
    expect(result).toEqual({ ok: true });
    expect(setStarMark).toHaveBeenCalledWith(
      "hannah",
      "2026-08-03",
      "piano",
      2,
      false,
    );
  });
});
