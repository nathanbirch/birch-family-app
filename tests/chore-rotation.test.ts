import { describe, expect, it } from "vitest";

import { CHORE_POOLS, type ChorePool } from "@/config/chore-rotation";
import type { ChildId } from "@/config/family";
import { getRotatingTasks } from "@/config/stars";
import {
  findChorePoolProblem,
  getChoreAssignments,
  getChoreMonthOffset,
  getChoreOwner,
  getChoresForChild,
  getDaysUntilChoreRotation,
} from "@/lib/stars/rotation";

/** Local date at noon, so tests never depend on the machine's timezone. */
function localDate(iso: string, hour = 12): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function poolFor(id: "bigs" | "littles"): ChorePool {
  const pool = CHORE_POOLS.find((entry) => entry.id === id);
  if (!pool) throw new Error(`No pool called ${id}`);
  return pool;
}

const BIGS = poolFor("bigs");
const LITTLES = poolFor("littles");

describe("configuration sanity", () => {
  it("is a usable set of pools", () => {
    expect(findChorePoolProblem(CHORE_POOLS)).toBeNull();
  });

  it("gives every rotating chore exactly one pool", () => {
    const pooled = CHORE_POOLS.flatMap((pool) => pool.chores);
    const rotating = getRotatingTasks().map((task) => task.id);

    expect([...pooled].sort()).toEqual([...rotating].sort());
    expect(new Set(pooled).size).toBe(pooled.length);
  });

  it("keeps the pools apart, so a child has one rotation", () => {
    const bigs = new Set<ChildId>(BIGS.children);
    for (const child of LITTLES.children) {
      expect(bigs.has(child)).toBe(false);
    }
  });
});

describe("the August 2026 anchor", () => {
  /*
   * These are read straight off the photograph of the chore chart taken on
   * 4 August 2026. If a future edit to the pools moves August, this fails —
   * which is the point. The anchor is the family's own truth, not a default.
   */
  const AUGUST: [string, ChildId][] = [
    ["pick-up-living-room", "clara"],
    ["vacuum-living-room", "clara"],
    ["dishwasher", "emily"],
    ["yard-pickup", "emily"],
    ["kitchen-island", "hannah"],
    ["bath-trash", "hannah"],
    ["feed-bella", "james"],
    ["vacuum-wooden-floor", "william"],
  ];

  it.each(AUGUST)("gives %s to %s", (taskId, childId) => {
    expect(getChoreOwner(CHORE_POOLS, localDate("2026-08-04"), taskId)).toBe(
      childId,
    );
  });

  it("is the same on the 1st and the 31st of the month", () => {
    for (const day of ["2026-08-01", "2026-08-15", "2026-08-31"]) {
      expect(getChoreOwner(CHORE_POOLS, localDate(day), "dishwasher")).toBe(
        "emily",
      );
    }
  });
});

describe("rotating on the first of the month", () => {
  it("changes overnight between the 31st and the 1st", () => {
    const july = getChoreOwner(CHORE_POOLS, localDate("2026-08-31"), "dishwasher");
    const august = getChoreOwner(CHORE_POOLS, localDate("2026-09-01"), "dishwasher");
    expect(july).not.toBe(august);
  });

  it("does not change at any other point in the month", () => {
    const owners = new Set(
      Array.from({ length: 30 }, (_, index) =>
        getChoreOwner(
          CHORE_POOLS,
          localDate(`2026-09-${String(index + 1).padStart(2, "0")}`),
          "kitchen-island",
        ),
      ),
    );
    expect(owners.size).toBe(1);
  });

  it("moves one place down the pool each month", () => {
    // Clara, Emily, Hannah — the dishwasher walks the pool in that order.
    const months: [string, ChildId][] = [
      ["2026-08-10", "emily"],
      ["2026-09-10", "hannah"],
      ["2026-10-10", "clara"],
      ["2026-11-10", "emily"],
    ];
    for (const [day, childId] of months) {
      expect(getChoreOwner(CHORE_POOLS, localDate(day), "dishwasher")).toBe(
        childId,
      );
    }
  });

  it("runs backwards, so last spring is answerable", () => {
    // Three months before the anchor is a whole number of cycles for the big
    // three, so May 2026 looks exactly like August 2026.
    expect(getChoreOwner(CHORE_POOLS, localDate("2026-05-12"), "dishwasher")).toBe(
      "emily",
    );
    // One month before, it is the child *ahead* of Emily in the pool.
    expect(getChoreOwner(CHORE_POOLS, localDate("2026-07-12"), "dishwasher")).toBe(
      "clara",
    );
  });

  it("counts months, not days", () => {
    expect(getChoreMonthOffset(BIGS, localDate("2026-08-01"))).toBe(0);
    expect(getChoreMonthOffset(BIGS, localDate("2026-08-31"))).toBe(0);
    expect(getChoreMonthOffset(BIGS, localDate("2026-09-01"))).toBe(1);
    expect(getChoreMonthOffset(BIGS, localDate("2027-08-01"))).toBe(12);
    expect(getChoreMonthOffset(BIGS, localDate("2026-07-31"))).toBe(-1);
  });
});

describe("fairness", () => {
  it("gives every child every chore in their pool, over one cycle", () => {
    for (const pool of CHORE_POOLS) {
      const held = new Map<ChildId, Set<string>>(
        pool.children.map((child) => [child, new Set<string>()]),
      );

      for (let month = 0; month < pool.children.length; month += 1) {
        const date = localDate("2026-08-04");
        date.setMonth(date.getMonth() + month);
        for (const assignment of getChoreAssignments([pool], date)) {
          held.get(assignment.childId)!.add(assignment.taskId);
        }
      }

      for (const child of pool.children) {
        expect([...held.get(child)!].sort()).toEqual([...pool.chores].sort());
      }
    }
  });

  it("never gives one child the same chore two months running", () => {
    for (let month = 0; month < 24; month += 1) {
      const date = localDate("2026-08-04");
      date.setMonth(date.getMonth() + month);
      const next = new Date(date);
      next.setMonth(next.getMonth() + 1);

      for (const assignment of getChoreAssignments(CHORE_POOLS, date)) {
        expect(getChoreOwner(CHORE_POOLS, next, assignment.taskId)).not.toBe(
          assignment.childId,
        );
      }
    }
  });

  it("shares the chores out as evenly as the counts allow", () => {
    for (const pool of CHORE_POOLS) {
      const per = pool.chores.length / pool.children.length;
      for (const child of pool.children) {
        const count = getChoresForChild(
          [pool],
          localDate("2026-08-04"),
          child,
        ).length;
        expect(count).toBeGreaterThanOrEqual(Math.floor(per));
        expect(count).toBeLessThanOrEqual(Math.ceil(per));
      }
    }
  });
});

describe("the countdown", () => {
  it("counts the days to the first of next month", () => {
    expect(getDaysUntilChoreRotation(localDate("2026-08-31"))).toBe(1);
    expect(getDaysUntilChoreRotation(localDate("2026-08-01"))).toBe(31);
    // February in a leap year, which a naive 30-day assumption would get wrong.
    expect(getDaysUntilChoreRotation(localDate("2028-02-01"))).toBe(29);
  });
});

describe("refusing a broken rotation", () => {
  const valid = CHORE_POOLS.map((pool) => ({ ...pool }));

  function problemWith(mutate: (pools: ChorePool[]) => ChorePool[]): string {
    const problem = findChorePoolProblem(mutate(valid.map((p) => ({ ...p }))));
    expect(problem).not.toBeNull();
    return problem!;
  }

  it("rejects a child in two pools", () => {
    expect(
      problemWith((pools) => {
        pools[1] = { ...pools[1], children: [...pools[1].children, "clara"] };
        return pools;
      }),
    ).toMatch(/clara/);
  });

  it("rejects a chore in two pools", () => {
    expect(
      problemWith((pools) => {
        pools[1] = { ...pools[1], chores: [...pools[1].chores, "dishwasher"] };
        return pools;
      }),
    ).toMatch(/dishwasher/);
  });

  it("rejects a chore that nobody rotates", () => {
    expect(
      problemWith((pools) => {
        pools[0] = {
          ...pools[0],
          chores: pools[0].chores.filter((id) => id !== "bath-trash"),
        };
        return pools;
      }),
    ).toMatch(/bath-trash/);
  });

  it("rejects a chore that is not a task at all", () => {
    expect(
      problemWith((pools) => {
        pools[0] = { ...pools[0], chores: [...pools[0].chores, "walk-the-cat"] };
        return pools;
      }),
    ).toMatch(/walk-the-cat/);
  });

  it("rejects a task that is assigned rather than rotated", () => {
    expect(
      problemWith((pools) => {
        pools[0] = { ...pools[0], chores: [...pools[0].chores, "tidy-room"] };
        return pools;
      }),
    ).toMatch(/tidy-room/);
  });

  it("rejects an empty pool", () => {
    expect(
      problemWith((pools) => {
        pools[0] = { ...pools[0], children: [] };
        return pools;
      }),
    ).toMatch(/no children/);
  });

  it("rejects a nonsense anchor month", () => {
    expect(
      problemWith((pools) => {
        pools[0] = { ...pools[0], anchorMonth: "August" };
        return pools;
      }),
    ).toMatch(/August/);
  });
});
