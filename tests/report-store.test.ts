/**
 * @vitest-environment node
 *
 * The two reads the weekly report adds to the `starWeeks` store, with MongoDB
 * mocked out.
 *
 * Both exist for the same reason: the report list shows eleven weeks at once,
 * and doing that a week at a time would be eleven round trips on the critical
 * path of a page nobody would wait for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const collection = vi.hoisted(() => ({
  find: vi.fn(),
  updateOne: vi.fn(),
  distinct: vi.fn(),
}));
const getCollection = vi.hoisted(() => vi.fn(async () => collection));
const reportDegraded = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getCollection }));
vi.mock("@/lib/data-health", () => ({ reportDegraded }));
// `cache()` is React's per-render memo; in a test it must not memoise across
// cases or the second read would return the first one's answer.
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));

const { getMarksForWeeks, listStarWeekStarts } = await import("@/lib/stars/marks");

function findReturns(documents: unknown[]) {
  collection.find.mockReturnValue({ toArray: async () => documents });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  findReturns([]);
  collection.distinct.mockResolvedValue([]);
});

describe("several weeks at once", () => {
  it("asks for all of them in one query", async () => {
    await getMarksForWeeks(["2026-08-03", "2026-07-27"]);

    expect(collection.find).toHaveBeenCalledTimes(1);
    expect(collection.find).toHaveBeenCalledWith({
      weekStart: { $in: ["2026-08-03", "2026-07-27"] },
    });
  });

  it("returns a blank week for one nobody ticked, rather than nothing at all", async () => {
    const weeks = await getMarksForWeeks(["2026-08-03", "2026-07-27"]);

    // Every requested week comes back, so the caller never has to check.
    expect(Object.keys(weeks).sort()).toEqual(["2026-07-27", "2026-08-03"]);
    expect(weeks["2026-07-27"].hannah).toEqual({});
  });

  it("files each document under its own week", async () => {
    findReturns([
      {
        childId: "clara",
        weekStart: "2026-08-03",
        marks: { "tidy-room": [true, false, false, false, false] },
      },
      {
        childId: "clara",
        weekStart: "2026-07-27",
        marks: { "tidy-room": [true, true, true, true, true] },
      },
    ]);

    const weeks = await getMarksForWeeks(["2026-08-03", "2026-07-27"]);

    expect(weeks["2026-08-03"].clara["tidy-room"]).toEqual([
      true, false, false, false, false,
    ]);
    expect(weeks["2026-07-27"].clara["tidy-room"]).toEqual([
      true, true, true, true, true,
    ]);
  });

  it("ignores a document for a week nobody asked about", async () => {
    findReturns([
      { childId: "clara", weekStart: "2020-01-06", marks: { "tidy-room": [true] } },
    ]);

    const weeks = await getMarksForWeeks(["2026-08-03"]);

    expect(Object.keys(weeks)).toEqual(["2026-08-03"]);
    expect(weeks["2026-08-03"].clara).toEqual({});
  });

  it("does not go near the database for an empty list", async () => {
    const weeks = await getMarksForWeeks([]);

    expect(weeks).toEqual({});
    expect(collection.find).not.toHaveBeenCalled();
  });

  it("shows empty reports rather than an error page when the database is down", async () => {
    collection.find.mockImplementation(() => {
      throw new Error("no connection");
    });

    const weeks = await getMarksForWeeks(["2026-08-03"]);

    expect(weeks["2026-08-03"].hannah).toEqual({});
    // Recorded as well as logged: a blank week and a week nobody ticked are
    // the same object, and something has to be able to tell them apart.
    expect(reportDegraded).toHaveBeenCalledWith("stars");
  });
});

describe("which weeks have stars in them", () => {
  it("lists them newest first", async () => {
    collection.distinct.mockResolvedValue([
      "2026-07-20",
      "2026-08-03",
      "2026-07-27",
    ]);

    expect(await listStarWeekStarts()).toEqual([
      "2026-08-03",
      "2026-07-27",
      "2026-07-20",
    ]);
  });

  it("drops anything in the column that is not a week", async () => {
    collection.distinct.mockResolvedValue(["2026-08-03", null, 42, undefined]);

    expect(await listStarWeekStarts()).toEqual(["2026-08-03"]);
  });

  it("loses the history rather than the page when the database is down", async () => {
    collection.distinct.mockRejectedValue(new Error("no connection"));

    // The caller still shows the latest finished week — see `reportableWeeks`.
    expect(await listStarWeekStarts()).toEqual([]);
    expect(reportDegraded).toHaveBeenCalledWith("stars");
  });
});
