import { describe, expect, it } from "vitest";

import { CHORE_POOLS, type ChorePool } from "@/config/chore-rotation";
import type { ChildId } from "@/config/family";
import { getRotatingTasks } from "@/config/stars";
import {
  findChorePoolProblem,
  getChoreAssignments,
  getChoreWeekOffset,
  getChoreOwner,
  getChoresForChild,
  getDaysUntilChoreRotation,
} from "@/lib/stars/rotation";

/** Local date at noon, so tests never depend on the machine's timezone. */
function localDate(iso: string, hour = 12): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function poolFor(id: "elder-pair" | "younger-pair"): ChorePool {
  const pool = CHORE_POOLS.find((entry) => entry.id === id);
  if (!pool) throw new Error(`No pool called ${id}`);
  return pool;
}

const ELDERS = poolFor("elder-pair");
const YOUNGERS = poolFor("younger-pair");

/** The anchor week: Monday 10 August 2026, and the Wednesday inside it. */
const ANCHOR_WEEK = localDate("2026-08-12");
/** The first Monday the pairs swap on. */
const NEXT_WEEK = localDate("2026-08-17");

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
    const elders = new Set<ChildId>(ELDERS.children);
    for (const child of YOUNGERS.children) {
      expect(elders.has(child)).toBe(false);
    }
  });

  it("rotates two pairs and leaves James out of both", () => {
    expect(CHORE_POOLS.map((pool) => [...pool.children])).toEqual([
      ["hannah", "emily"],
      ["clara", "william"],
    ]);

    const rotated = CHORE_POOLS.flatMap((pool) => pool.children);
    expect(rotated).not.toContain("james");
    // His chores are `fixed` in config/stars.ts instead, so nothing here can
    // hand one of them to somebody else on a Monday morning.
    expect(getChoresForChild(CHORE_POOLS, ANCHOR_WEEK, "james")).toEqual([]);
    expect(getChoreOwner(CHORE_POOLS, ANCHOR_WEEK, "feed-bella")).toBeNull();
  });
});

describe("the anchor week", () => {
  /*
   * The week of Monday 10 August 2026, dealt exactly as the photograph of the
   * chore chart taken on 4 August 2026 shows it — the chores rotated monthly
   * until this week, so the anchor and the photograph agree. If a future edit
   * to the pools moves this week, this fails, which is the point.
   */
  const ANCHOR: [string, ChildId][] = [
    ["pick-up-living-room", "clara"],
    ["vacuum-living-room", "clara"],
    ["vacuum-wooden-floor", "william"],
    ["dishwasher", "emily"],
    ["yard-pickup", "emily"],
    ["kitchen-island", "hannah"],
    ["bath-trash", "hannah"],
  ];

  it.each(ANCHOR)("gives %s to %s", (taskId, childId) => {
    expect(getChoreOwner(CHORE_POOLS, ANCHOR_WEEK, taskId)).toBe(childId);
  });

  it("is the same on every day of that week", () => {
    for (const day of ["2026-08-10", "2026-08-14", "2026-08-16"]) {
      expect(getChoreOwner(CHORE_POOLS, localDate(day), "dishwasher")).toBe(
        "emily",
      );
    }
  });
});

describe("swapping on Monday morning", () => {
  it("changes overnight between Sunday and Monday", () => {
    const sunday = getChoreOwner(CHORE_POOLS, localDate("2026-08-16"), "dishwasher");
    const monday = getChoreOwner(CHORE_POOLS, localDate("2026-08-17"), "dishwasher");
    expect(sunday).toBe("emily");
    expect(monday).toBe("hannah");
  });

  it("does not change at any other point in the week", () => {
    const owners = new Set(
      ["17", "18", "19", "20", "21", "22", "23"].map((day) =>
        getChoreOwner(CHORE_POOLS, localDate(`2026-08-${day}`), "kitchen-island"),
      ),
    );
    expect(owners.size).toBe(1);
  });

  it("hands the elder pair's chores across, whole", () => {
    expect(getChoresForChild(CHORE_POOLS, ANCHOR_WEEK, "hannah").sort()).toEqual(
      ["bath-trash", "kitchen-island"],
    );
    expect(getChoresForChild(CHORE_POOLS, NEXT_WEEK, "hannah").sort()).toEqual(
      ["dishwasher", "yard-pickup"],
    );
    expect(getChoresForChild(CHORE_POOLS, NEXT_WEEK, "emily").sort()).toEqual(
      ["bath-trash", "kitchen-island"],
    );
  });

  it("passes the younger pair's odd chore over too", () => {
    // Three chores between two children: two one week, one the next.
    expect(getChoresForChild(CHORE_POOLS, ANCHOR_WEEK, "clara")).toHaveLength(2);
    expect(getChoresForChild(CHORE_POOLS, ANCHOR_WEEK, "william")).toHaveLength(1);
    expect(getChoresForChild(CHORE_POOLS, NEXT_WEEK, "clara")).toHaveLength(1);
    expect(getChoresForChild(CHORE_POOLS, NEXT_WEEK, "william")).toHaveLength(2);
  });

  it("puts each pair back where it started every second week", () => {
    const fortnight = localDate("2026-08-24");
    for (const [taskId, childId] of [
      ["dishwasher", "emily"],
      ["kitchen-island", "hannah"],
      ["pick-up-living-room", "clara"],
      ["vacuum-wooden-floor", "william"],
    ] as [string, ChildId][]) {
      expect(getChoreOwner(CHORE_POOLS, fortnight, taskId)).toBe(childId);
    }
  });

  it("does not run backwards past the anchor", () => {
    /*
     * It used to, and the fridge disproved it: the chart is laminated with
     * each child's chores printed on it, so Clara's column said "pick up the
     * living room floor" in July exactly as it does in August. Extrapolating
     * backwards was not recovering history — it was inventing one, and it cost
     * fourteen real stars when two July weeks were back-filled off
     * photographs of that chart.
     *
     * Before the anchor, every week is the anchor's week — which is also every
     * week the chores rotated monthly, and so every week the database already
     * holds stars for.
     */
    for (const day of ["2026-08-03", "2026-07-12", "2026-05-12", "2019-01-01"]) {
      expect(getChoreOwner(CHORE_POOLS, localDate(day), "dishwasher")).toBe(
        "emily",
      );
      expect(
        getChoreOwner(CHORE_POOLS, localDate(day), "pick-up-living-room"),
      ).toBe("clara");
      expect(
        getChoreOwner(CHORE_POOLS, localDate(day), "vacuum-wooden-floor"),
      ).toBe("william");
    }
  });

  it("still moves on normally after the anchor", () => {
    // The clamp must not flatten the rotation itself — only the guesswork
    // before it starts.
    expect(getChoreOwner(CHORE_POOLS, localDate("2026-09-16"), "dishwasher")).toBe(
      "hannah",
    );
  });

  it("counts weeks, not days", () => {
    expect(getChoreWeekOffset(ELDERS, localDate("2026-08-10"))).toBe(0);
    expect(getChoreWeekOffset(ELDERS, localDate("2026-08-16", 23))).toBe(0);
    expect(getChoreWeekOffset(ELDERS, localDate("2026-08-17", 0))).toBe(1);
    expect(getChoreWeekOffset(ELDERS, localDate("2026-10-05"))).toBe(8);
    // Clamped at the anchor rather than going negative — see above.
    expect(getChoreWeekOffset(ELDERS, localDate("2026-08-09"))).toBe(0);
    expect(getChoreWeekOffset(ELDERS, localDate("2020-01-01"))).toBe(0);
  });
});

describe("fairness", () => {
  it("gives every child every chore in their pool, over one cycle", () => {
    for (const pool of CHORE_POOLS) {
      const held = new Map<ChildId, Set<string>>(
        pool.children.map((child) => [child, new Set<string>()]),
      );

      for (let week = 0; week < pool.children.length; week += 1) {
        const date = localDate("2026-08-12");
        date.setDate(date.getDate() + week * 7);
        for (const assignment of getChoreAssignments([pool], date)) {
          held.get(assignment.childId)!.add(assignment.taskId);
        }
      }

      for (const child of pool.children) {
        expect([...held.get(child)!].sort()).toEqual([...pool.chores].sort());
      }
    }
  });

  it("never gives one child the same chore two weeks running", () => {
    for (let week = 0; week < 26; week += 1) {
      const date = localDate("2026-08-12");
      date.setDate(date.getDate() + week * 7);
      const next = new Date(date);
      next.setDate(next.getDate() + 7);

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
        const count = getChoresForChild([pool], ANCHOR_WEEK, child).length;
        expect(count).toBeGreaterThanOrEqual(Math.floor(per));
        expect(count).toBeLessThanOrEqual(Math.ceil(per));
      }
    }
  });
});

describe("the countdown", () => {
  it("counts the days to next Monday", () => {
    expect(getDaysUntilChoreRotation(localDate("2026-08-16"))).toBe(1);
    expect(getDaysUntilChoreRotation(localDate("2026-08-17"))).toBe(7);
    expect(getDaysUntilChoreRotation(localDate("2026-08-12"))).toBe(5);
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
        pools[1] = { ...pools[1], children: [...pools[1].children, "hannah"] };
        return pools;
      }),
    ).toMatch(/hannah/);
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
        pools[0] = { ...pools[0], chores: [...pools[0].chores, "feed-bella"] };
        return pools;
      }),
    ).toMatch(/feed-bella/);
  });

  it("rejects an empty pool", () => {
    expect(
      problemWith((pools) => {
        pools[0] = { ...pools[0], children: [] };
        return pools;
      }),
    ).toMatch(/no children/);
  });

  it("rejects a nonsense anchor week", () => {
    expect(
      problemWith((pools) => {
        pools[0] = { ...pools[0], anchorWeek: "2026-08" };
        return pools;
      }),
    ).toMatch(/2026-08/);
  });

  it("rejects an anchor that is not a Monday", () => {
    // A Wednesday anchor would quietly move the changeover to Wednesdays.
    expect(
      problemWith((pools) => {
        pools[0] = { ...pools[0], anchorWeek: "2026-08-12" };
        return pools;
      }),
    ).toMatch(/Monday/);
  });
});
