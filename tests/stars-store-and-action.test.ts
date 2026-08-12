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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    poolId: "elder-pair",
    name: "Hannah & Emily",
    children: ["hannah", "emily"],
    chores: ["kitchen-island", "dishwasher", "bath-trash", "yard-pickup"],
    anchorWeek: "2026-08-10",
    ...overrides,
  };
}

let warn: ReturnType<typeof vi.spyOn>;

/*
 * Wednesday 5 August 2026, at noon in Rexburg (18:00 UTC).
 *
 * The action only writes to the column that is happening *today*, on the
 * family's clock rather than the server's — so these tests have to stand on a
 * particular day, and it is the Wednesday that `valid` below ticks.
 */
const NOON_IN_REXBURG = new Date("2026-08-05T18:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON_IN_REXBURG);
  vi.clearAllMocks();
  findReturns([]);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reading the pools", () => {
  it("falls back to the compiled pools when the collection is empty", async () => {
    const pools = await getChorePools();
    expect(pools).toEqual(CHORE_POOLS);
  });

  it("prefers what is stored", async () => {
    findReturns([stored({ anchorWeek: "2026-08-17" })]);

    const pools = await getChorePools();
    const elders = pools.find((pool) => pool.id === "elder-pair")!;
    expect(elders.anchorWeek).toBe("2026-08-17");
    // The pool with no document keeps its compiled default rather than
    // vanishing and taking its children's chores with it.
    expect(pools.find((pool) => pool.id === "younger-pair")).toEqual(
      CHORE_POOLS[1],
    );
  });

  it("keeps the configured order however the documents come back", async () => {
    findReturns([
      {
        ...stored(),
        poolId: "younger-pair",
        children: ["clara", "william"],
        chores: [
          "pick-up-living-room",
          "vacuum-wooden-floor",
          "vacuum-living-room",
        ],
      },
      stored(),
    ]);
    const pools = await getChorePools();
    expect(pools.map((pool) => pool.id)).toEqual([
      "elder-pair",
      "younger-pair",
    ]);
  });

  it("ignores one malformed document and keeps the rest", async () => {
    findReturns([
      stored({ anchorWeek: "2026-08" }), // fails the YYYY-MM-DD check
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
    // Valid on its own, but it hands the younger pair's chore to the elder
    // one — which leaves two children told to do the same job.
    findReturns([
      stored({ chores: [...stored().chores, "vacuum-wooden-floor"] }),
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

  it.each([
    ["tomorrow", 3],
    ["Friday", 4],
    ["yesterday", 1],
    ["Monday", 0],
  ])("refuses %s, whichever side of today it falls", async (_label, dayIndex) => {
    /*
     * The chart renders the other four columns as untappable, but this is a
     * POST endpoint and that is only a rendering decision. Ahead is a star
     * nobody has earned yet; behind is Sunday-night catching up. Both are the
     * same refusal.
     */
    const result = await setStar({ ...valid, dayIndex });
    expect(result.ok).toBe(false);
    expect(setStarMark).not.toHaveBeenCalled();
  });

  it("refuses every column at the weekend", async () => {
    // Saturday, in Rexburg. The chart runs Monday to Friday, so there is no
    // day to record and the whole week is closed.
    vi.setSystemTime(new Date("2026-08-08T18:00:00Z"));

    for (const dayIndex of [0, 1, 2, 3, 4]) {
      const result = await setStar({ ...valid, dayIndex });
      expect(result.ok).toBe(false);
    }
    expect(setStarMark).not.toHaveBeenCalled();
  });

  it("refuses a week that has already finished", async () => {
    // Last week's Monday, ticked this week: the column is real, the week is
    // over, and the star is a reconstruction.
    const result = await setStar({ ...valid, weekStart: "2026-07-27" });
    expect(result.ok).toBe(false);
    expect(setStarMark).not.toHaveBeenCalled();
  });

  it("goes by Rexburg's clock, not the server's", async () => {
    /*
     * 01:00 UTC on Thursday is still 19:00 on Wednesday in Rexburg. A server
     * that used its own clock would spend every evening refusing the column
     * the children are looking at and opening tomorrow's instead.
     */
    vi.setSystemTime(new Date("2026-08-06T01:00:00Z"));

    expect((await setStar({ ...valid, dayIndex: 2 })).ok).toBe(true);
    expect((await setStar({ ...valid, dayIndex: 3 })).ok).toBe(false);
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
