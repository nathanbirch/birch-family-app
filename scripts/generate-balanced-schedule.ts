/**
 * Development-only schedule search.
 *
 *   npm run schedule:generate
 *
 * There are exactly 1344 5x5 Latin squares whose first row is fixed, and every
 * structurally distinct five-week rotation is one of them (relabelling the
 * children just renames the symbols). So we enumerate all of them exhaustively
 * rather than guessing, score each one, and print the best.
 *
 * Using a Latin square guarantees the two hard requirements for free:
 *   - every child appears once per week (rows are permutations)
 *   - every child occupies every position exactly once (columns are too),
 *     which also means no child can repeat a position in consecutive weeks.
 *
 * The search then optimises the soft goals: minimise siblings who stay
 * shoulder-to-shoulder from one week to the next, and even out how often each
 * sibling pair ends up together over the whole cycle.
 *
 * The winning schedule is copied by hand into `src/config/rotation.ts`.
 */

import { CHILD_IDS, type ChildId } from "../src/config/family";
import {
  analyseSchedule,
  isCyclicShiftOf,
  isReversalOf,
  type RotationSchedule,
  type WeekPermutation,
} from "../src/lib/schedule-analysis";

const SIZE = CHILD_IDS.length;

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const result: T[][] = [];
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) result.push([item, ...tail]);
  });
  return result;
}

/** All Latin squares of order 5 whose first row is `CHILD_IDS`. */
function enumerateLatinSquares(): RotationSchedule[] {
  const allRows = permutations(CHILD_IDS);
  const squares: RotationSchedule[] = [];
  const current: ChildId[][] = [[...CHILD_IDS]];

  const fits = (row: readonly ChildId[]): boolean =>
    current.every((existing) => existing.every((id, i) => id !== row[i]));

  const step = (): void => {
    if (current.length === SIZE) {
      squares.push(current.map((row) => [...row]));
      return;
    }
    for (const row of allRows) {
      if (!fits(row)) continue;
      current.push(row);
      step();
      current.pop();
    }
  };

  step();
  return squares;
}

/** Reject weeks that are merely a rotation or a mirror of the week before. */
function hasTrivialTransition(schedule: RotationSchedule): boolean {
  for (let i = 0; i < schedule.length; i += 1) {
    const a: WeekPermutation = schedule[i];
    const b: WeekPermutation = schedule[(i + 1) % schedule.length];
    if (isCyclicShiftOf(a, b) || isReversalOf(a, b)) return true;
  }
  return false;
}

type Scored = {
  schedule: RotationSchedule;
  totalRepeats: number;
  variance: number;
  strongRange: number;
};

function score(schedule: RotationSchedule): Scored {
  const report = analyseSchedule(schedule);
  const strongValues = report.perPair.map((entry) => entry.combinedStrong);
  return {
    schedule,
    totalRepeats: report.totalRepeats,
    variance: report.spread.variance,
    strongRange: Math.max(...strongValues) - Math.min(...strongValues),
  };
}

function compare(a: Scored, b: Scored): number {
  // 1. Fewest siblings kept side-by-side across a rotation.
  if (a.totalRepeats !== b.totalRepeats) return a.totalRepeats - b.totalRepeats;
  // 2. Most even distribution of weighted pairings over the cycle.
  if (a.variance !== b.variance) return a.variance - b.variance;
  // 3. Tightest spread of shoulder-to-shoulder pairings.
  return a.strongRange - b.strongRange;
}

function formatSchedule(schedule: RotationSchedule): string {
  return schedule
    .map((week, i) => `  Week ${i + 1}: ${week.join(", ")}`)
    .join("\n");
}

function main(): void {
  const squares = enumerateLatinSquares();
  const candidates = squares.filter((square) => !hasTrivialTransition(square));

  console.log(`Latin squares with a fixed first row: ${squares.length}`);
  console.log(
    `After discarding pure rotations / reversals:  ${candidates.length}\n`,
  );

  const scored = candidates.map(score).sort(compare);
  const best = scored[0];
  const report = analyseSchedule(best.schedule);

  console.log("Best schedule found");
  console.log("===================");
  console.log(formatSchedule(best.schedule));
  console.log(`\nValid: ${report.valid}`);
  if (!report.valid) {
    for (const issue of report.issues) console.log(`  ! ${issue.message}`);
  }

  console.log("\nWeek-to-week repeated shoulder-to-shoulder pairs");
  for (const t of report.transitions) {
    console.log(`  Week ${t.from} -> Week ${t.to}: ${t.repeats}`);
  }
  console.log(`  Total: ${report.totalRepeats}`);

  console.log("\nSibling adjacency over the full five-week cycle");
  console.log(
    "  pair                 table(s/w)  vehicle(s/w)  combined  weighted",
  );
  for (const entry of report.perPair) {
    const name = `${entry.pair[0]} + ${entry.pair[1]}`.padEnd(20);
    console.log(
      `  ${name} ` +
        `${String(entry.tableStrong).padStart(6)}/${entry.tableWeak}` +
        `${String(entry.vehicleStrong).padStart(11)}/${entry.vehicleWeak}` +
        `${String(entry.combinedStrong).padStart(10)}` +
        `${entry.combinedWeighted.toFixed(1).padStart(10)}`,
    );
  }
  console.log(
    `\n  weighted spread: min ${report.spread.min}, max ${report.spread.max}, ` +
      `range ${report.spread.range}, variance ${report.spread.variance.toFixed(3)}`,
  );

  const distinctBest = scored.filter((s) => compare(s, best) === 0).length;
  console.log(
    `\n${distinctBest} candidate schedule(s) tie for this score; the first is used.`,
  );
  console.log("Copy the weeks above into src/config/rotation.ts.");
}

main();
