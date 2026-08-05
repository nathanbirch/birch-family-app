/**
 * @vitest-environment node
 *
 * The `starWeeks` store, with MongoDB mocked out.
 *
 * Two things here are worth testing rather than trusting, and both are the
 * kind of bug that only shows up in production data:
 *
 *   - The write is an aggregation pipeline rather than `$set` on a dotted
 *     path, because the dotted form creates a missing row as an *object*
 *     (`{ "2": true }`) instead of an array. The shape of that pipeline is
 *     asserted directly.
 *   - Reads are forgiving: a document written by an older build, or by a hand
 *     edit, must never take the page down.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const collection = vi.hoisted(() => ({
  find: vi.fn(),
  updateOne: vi.fn(),
}));
const getCollection = vi.hoisted(() => vi.fn(async () => collection));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getCollection }));
// `cache()` is React's per-render memo; in a test it must not memoise across
// cases or the second read would return the first one's answer.
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));

const { getWeekMarks, setStarMark } = await import("@/lib/stars/marks");

function findReturns(documents: unknown[]) {
  collection.find.mockReturnValue({ toArray: async () => documents });
}

beforeEach(() => {
  vi.clearAllMocks();
  collection.updateOne.mockResolvedValue({ acknowledged: true });
  findReturns([]);
});

describe("reading a week", () => {
  it("gives every child an entry, even with nothing stored", async () => {
    const marks = await getWeekMarks("2026-08-03");
    expect(Object.keys(marks).sort()).toEqual(
      ["clara", "emily", "hannah", "james", "william"].sort(),
    );
    expect(marks.hannah).toEqual({});
  });

  it("asks for exactly the week it was given", async () => {
    await getWeekMarks("2026-08-03");
    expect(collection.find).toHaveBeenCalledWith({ weekStart: "2026-08-03" });
  });

  it("returns what was stored", async () => {
    findReturns([
      {
        childId: "clara",
        weekStart: "2026-08-03",
        marks: { "tidy-room": [true, true, false, false, false] },
      },
    ]);

    const marks = await getWeekMarks("2026-08-03");
    expect(marks.clara["tidy-room"]).toEqual([true, true, false, false, false]);
  });

  it("pads a short row and trims a long one", async () => {
    findReturns([
      {
        childId: "clara",
        weekStart: "2026-08-03",
        marks: {
          "tidy-room": [true],
          piano: [true, true, true, true, true, true, true],
        },
      },
    ]);

    const marks = await getWeekMarks("2026-08-03");
    expect(marks.clara["tidy-room"]).toEqual([true, false, false, false, false]);
    expect(marks.clara.piano).toHaveLength(5);
  });

  it("treats anything that is not exactly `true` as unticked", async () => {
    findReturns([
      {
        childId: "clara",
        weekStart: "2026-08-03",
        // Every shape a hand edit or an older build might leave behind.
        marks: { "tidy-room": [1, "true", null, {}, undefined] },
      },
    ]);

    const marks = await getWeekMarks("2026-08-03");
    expect(marks.clara["tidy-room"]).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("drops a task that no longer exists", async () => {
    // A retired chore must not reappear on a chart because somebody ticked it
    // in March.
    findReturns([
      {
        childId: "clara",
        weekStart: "2026-08-03",
        marks: { "polish-the-cat": [true, true, true, true, true] },
      },
    ]);

    const marks = await getWeekMarks("2026-08-03");
    expect(marks.clara).toEqual({});
  });

  it("ignores a document for somebody who is not a child here", async () => {
    findReturns([
      { childId: "nathan", weekStart: "2026-08-03", marks: { piano: [true] } },
      { childId: "", weekStart: "2026-08-03", marks: {} },
    ]);

    const marks = await getWeekMarks("2026-08-03");
    expect(Object.keys(marks)).toHaveLength(5);
    expect("nathan" in marks).toBe(false);
  });

  it("copes with `marks` being missing or the wrong type", async () => {
    findReturns([
      { childId: "clara", weekStart: "2026-08-03" },
      { childId: "emily", weekStart: "2026-08-03", marks: null },
      { childId: "james", weekStart: "2026-08-03", marks: "nonsense" },
    ]);

    const marks = await getWeekMarks("2026-08-03");
    expect(marks.clara).toEqual({});
    expect(marks.emily).toEqual({});
    expect(marks.james).toEqual({});
  });

  it("shows an empty chart rather than an error when the database is down", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    collection.find.mockImplementation(() => {
      throw new Error("no route to host");
    });

    const marks = await getWeekMarks("2026-08-03");

    expect(marks.hannah).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("2026-08-03"));
    warn.mockRestore();
  });
});

describe("writing a star", () => {
  it("refuses a task that does not exist", async () => {
    // `taskId` becomes a *field name*, so an unchecked one could write
    // anywhere in the document.
    await expect(
      setStarMark("clara", "2026-08-03", "polish-the-cat", 0, true),
    ).rejects.toThrow(/polish-the-cat/);
    await expect(
      setStarMark("clara", "2026-08-03", "marks.piano", 0, true),
    ).rejects.toThrow();
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it("refuses a day outside the five-day week", async () => {
    for (const day of [-1, 5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        setStarMark("clara", "2026-08-03", "piano", day, true),
      ).rejects.toThrow(/day/i);
    }
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it("upserts on the child and the week", async () => {
    await setStarMark("clara", "2026-08-03", "piano", 2, true);

    const [filter, , options] = collection.updateOne.mock.calls[0];
    expect(filter).toEqual({ childId: "clara", weekStart: "2026-08-03" });
    expect(options).toEqual({ upsert: true });
  });

  it("rebuilds the whole row as an array of five", async () => {
    await setStarMark("clara", "2026-08-03", "piano", 2, true);

    const [, pipeline] = collection.updateOne.mock.calls[0];
    // A pipeline, not a `$set` document — that is the whole point.
    expect(Array.isArray(pipeline)).toBe(true);

    const stage = pipeline[0].$set;
    const row = stage.marks.$mergeObjects[1].piano;
    // Five elements, built by $map over a range, so a missing row cannot be
    // created as an object with a "2" key.
    expect(row.$map.input).toEqual({ $range: [0, 5] });
    expect(row.$map.in.$cond[0]).toEqual({ $eq: ["$$day", 2] });
    expect(row.$map.in.$cond[1]).toBe(true);
    expect(stage.updatedAt).toBe("$$NOW");
  });

  it("keeps the other four days as they were", async () => {
    await setStarMark("clara", "2026-08-03", "piano", 2, false);

    const [, pipeline] = collection.updateOne.mock.calls[0];
    const otherwise = pipeline[0].$set.marks.$mergeObjects[1].piano.$map.in
      .$cond[2];
    // Reads the existing element and coerces it to a boolean, defaulting to
    // false — which is what makes the first write of a week safe.
    expect(JSON.stringify(otherwise)).toContain("$marks.piano");
    expect(JSON.stringify(otherwise)).toContain("$arrayElemAt");
  });

  it("merges into whatever else the document holds", async () => {
    await setStarMark("clara", "2026-08-03", "piano", 0, true);
    const [, pipeline] = collection.updateOne.mock.calls[0];
    expect(pipeline[0].$set.marks.$mergeObjects[0]).toEqual({
      $ifNull: ["$marks", {}],
    });
  });

  it("retries once when two taps race to create the same document", async () => {
    // The unique index turns a lost upsert race into a duplicate-key error.
    // The retry is guaranteed to win: the document now exists, so the second
    // attempt takes the update path.
    const duplicate = Object.assign(new Error("E11000 duplicate key"), {
      code: 11000,
    });
    collection.updateOne
      .mockRejectedValueOnce(duplicate)
      .mockResolvedValueOnce({ acknowledged: true });

    await expect(
      setStarMark("clara", "2026-08-03", "piano", 0, true),
    ).resolves.toBeUndefined();
    expect(collection.updateOne).toHaveBeenCalledTimes(2);
  });

  it("does not retry, or swallow, any other failure", async () => {
    collection.updateOne.mockRejectedValue(new Error("disk on fire"));

    await expect(
      setStarMark("clara", "2026-08-03", "piano", 0, true),
    ).rejects.toThrow("disk on fire");
    expect(collection.updateOne).toHaveBeenCalledTimes(1);
  });

  it("gives up if the retry also collides", async () => {
    const duplicate = Object.assign(new Error("E11000"), { code: 11000 });
    collection.updateOne.mockRejectedValue(duplicate);

    await expect(
      setStarMark("clara", "2026-08-03", "piano", 0, true),
    ).rejects.toThrow();
    expect(collection.updateOne).toHaveBeenCalledTimes(2);
  });
});
