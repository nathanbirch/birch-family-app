/**
 * @vitest-environment node
 *
 * The degradation signal.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS TO PREVENT
 * ---------------------------------------------------------------------------
 * Three of this app's stores are deliberately forgiving: an unreachable Atlas
 * cluster gives a blank star chart and the compiled rotations rather than an
 * error page. That is right for a page a family reads over breakfast.
 *
 * It was wrong for the API, and this was found by running it against a
 * deliberately-unreachable database: every chore came back `incomplete`,
 * `dataFreshness` said nothing was wrong, and a child asking whether they were
 * finished would have been told — confidently — that they had done nothing all
 * day. A blank week and a week nobody has ticked are the same object.
 *
 * These tests pin the signal that tells them apart.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const find = vi.hoisted(() => vi.fn());
const getCollection = vi.hoisted(() =>
  vi.fn(async () => ({ find, findOne: vi.fn(), updateOne: vi.fn() })),
);

vi.mock("@/lib/db", () => ({ getCollection, COLLECTIONS: {} }));

const { degradedSources, reportDegraded, withDataHealth } = await import(
  "@/lib/data-health"
);
const { getWeekMarks } = await import("@/lib/stars/marks");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the signal itself", () => {
  it("collects names within a scope, without duplicating them", async () => {
    const seen = await withDataHealth(async () => {
      reportDegraded("stars");
      reportDegraded("stars");
      reportDegraded("chores");
      return degradedSources();
    });

    expect(seen.sort()).toEqual(["chores", "stars"]);
  });

  it("keeps concurrent scopes apart", async () => {
    // Two requests in flight on one instance must not see each others'
    // failures. This is the property a module-level Set would not have.
    const [first, second] = await Promise.all([
      withDataHealth(async () => {
        reportDegraded("stars");
        await new Promise((resolve) => setTimeout(resolve, 5));
        return degradedSources();
      }),
      withDataHealth(async () => {
        reportDegraded("calendar");
        return degradedSources();
      }),
    ]);

    expect(first).toEqual(["stars"]);
    expect(second).toEqual(["calendar"]);
  });

  it("is an inert no-op outside a scope, which is every page in the app", () => {
    // The pages never open a scope, so this must cost them nothing and must
    // never throw. A health signal that can take a request down is worse than
    // no signal.
    expect(() => reportDegraded("anything")).not.toThrow();
    expect(degradedSources()).toEqual([]);
  });
});

describe("a store that falls back says so", () => {
  it("reports 'stars' when the marks cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    find.mockImplementation(() => {
      throw new Error("connection refused");
    });

    const { marks, degraded } = await withDataHealth(async () => {
      const read = await getWeekMarks("2026-08-03");
      return { marks: read, degraded: degradedSources() };
    });

    // The page still gets its blank chart — the app's behaviour is unchanged.
    expect(marks.clara).toEqual({});
    // And the API can now tell that blank from genuinely-untouched.
    expect(degraded).toContain("stars");

    warn.mockRestore();
  });

  it("says nothing when the read succeeds", async () => {
    find.mockReturnValue({ toArray: async () => [] });

    const degraded = await withDataHealth(async () => {
      await getWeekMarks("2026-08-10");
      return degradedSources();
    });

    expect(degraded).toEqual([]);
  });
});
