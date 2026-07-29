/**
 * Pure helpers for analysing and validating a five-week rotation schedule.
 *
 * Used by the unit tests and by `scripts/generate-balanced-schedule.ts`.
 * None of this runs in the deployed app — the app only looks up a week.
 */

import { CHILD_IDS, type ChildId } from "@/config/family";
import {
  ADJACENCY_MODELS,
  ADJACENCY_WEIGHTS,
  type AdjacencyModel,
} from "@/config/seating";

export type WeekPermutation = readonly ChildId[];
export type RotationSchedule = readonly WeekPermutation[];

/** Canonical, order-independent key for a sibling pair, e.g. `clara|emily`. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Every unordered pair of children, in a stable order. */
export function allSiblingPairs(
  children: readonly ChildId[] = CHILD_IDS,
): Array<[ChildId, ChildId]> {
  const pairs: Array<[ChildId, ChildId]> = [];
  for (let i = 0; i < children.length; i += 1) {
    for (let j = i + 1; j < children.length; j += 1) {
      pairs.push([children[i], children[j]]);
    }
  }
  return pairs;
}

export type AdjacencyCounts = {
  /** Weighted total per sibling pair (strong = 1, weak = 0.5). */
  weighted: Map<string, number>;
  /** Shoulder-to-shoulder count per sibling pair. */
  strong: Map<string, number>;
  /** Across-the-table / front-and-behind count per sibling pair. */
  weak: Map<string, number>;
};

function emptyCounts(children: readonly ChildId[]): AdjacencyCounts {
  const weighted = new Map<string, number>();
  const strong = new Map<string, number>();
  const weak = new Map<string, number>();
  for (const [a, b] of allSiblingPairs(children)) {
    const key = pairKey(a, b);
    weighted.set(key, 0);
    strong.set(key, 0);
    weak.set(key, 0);
  }
  return { weighted, strong, weak };
}

function bump(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

/**
 * Count how often each sibling pair sits near each other across the whole
 * cycle, for one or more layouts.
 */
export function getPairAdjacencyCounts(
  schedule: RotationSchedule,
  models: readonly AdjacencyModel[] = ADJACENCY_MODELS,
  children: readonly ChildId[] = CHILD_IDS,
): AdjacencyCounts {
  const counts = emptyCounts(children);

  for (const week of schedule) {
    for (const model of models) {
      for (const [p, q] of model.strong) {
        const key = pairKey(week[p - 1], week[q - 1]);
        bump(counts.strong, key, 1);
        bump(counts.weighted, key, ADJACENCY_WEIGHTS.strong);
      }
      for (const [p, q] of model.weak) {
        const key = pairKey(week[p - 1], week[q - 1]);
        bump(counts.weak, key, 1);
        bump(counts.weighted, key, ADJACENCY_WEIGHTS.weak);
      }
    }
  }

  return counts;
}

/** The set of strongly-adjacent sibling pairs in a single week. */
export function strongPairsForWeek(
  week: WeekPermutation,
  models: readonly AdjacencyModel[] = ADJACENCY_MODELS,
): Set<string> {
  const pairs = new Set<string>();
  for (const model of models) {
    for (const [p, q] of model.strong) {
      pairs.add(pairKey(week[p - 1], week[q - 1]));
    }
  }
  return pairs;
}

/**
 * How many sibling pairs are shoulder-to-shoulder in two consecutive weeks.
 * Lower is better — it means siblings get a genuinely different neighbour.
 */
export function repeatedAdjacencies(
  a: WeekPermutation,
  b: WeekPermutation,
  models: readonly AdjacencyModel[] = ADJACENCY_MODELS,
): number {
  const first = strongPairsForWeek(a, models);
  let repeats = 0;
  for (const key of strongPairsForWeek(b, models)) {
    if (first.has(key)) repeats += 1;
  }
  return repeats;
}

/** `true` when `b` is a cyclic shift of `a` (including the identity). */
export function isCyclicShiftOf(a: WeekPermutation, b: WeekPermutation): boolean {
  const n = a.length;
  for (let offset = 0; offset < n; offset += 1) {
    let matches = true;
    for (let i = 0; i < n; i += 1) {
      if (b[i] !== a[(i + offset) % n]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

/** `true` when `b` is `a` read backwards. */
export function isReversalOf(a: WeekPermutation, b: WeekPermutation): boolean {
  return a.length === b.length && a.every((id, i) => id === b[b.length - 1 - i]);
}

export type ValidationIssue = { code: string; message: string };

/**
 * Check every hard fairness requirement. Returns an empty array when the
 * schedule is valid.
 */
export function validateRotationSchedule(
  schedule: RotationSchedule,
  children: readonly ChildId[] = CHILD_IDS,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const size = children.length;

  if (schedule.length !== size) {
    issues.push({
      code: "week-count",
      message: `Expected ${size} weeks, found ${schedule.length}.`,
    });
  }

  schedule.forEach((week, index) => {
    if (week.length !== size) {
      issues.push({
        code: "week-length",
        message: `Week ${index + 1} has ${week.length} children, expected ${size}.`,
      });
      return;
    }
    const unique = new Set(week);
    if (unique.size !== size) {
      issues.push({
        code: "duplicate-child",
        message: `Week ${index + 1} lists a child more than once.`,
      });
    }
    for (const child of week) {
      if (!children.includes(child)) {
        issues.push({
          code: "unknown-child",
          message: `Week ${index + 1} references unknown child "${child}".`,
        });
      }
    }
  });

  // Every child occupies every position exactly once (the hard requirement).
  for (let position = 0; position < size; position += 1) {
    const occupants = schedule.map((week) => week[position]);
    const unique = new Set(occupants);
    if (unique.size !== size) {
      issues.push({
        code: "position-coverage",
        message:
          `Child position ${position + 1} is not filled by all ${size} children ` +
          `exactly once (found: ${occupants.join(", ")}).`,
      });
    }
  }

  // No child keeps the same position from one week to the next, wrap included.
  for (let i = 0; i < schedule.length; i += 1) {
    const current = schedule[i];
    const next = schedule[(i + 1) % schedule.length];
    for (let position = 0; position < size; position += 1) {
      if (current[position] && current[position] === next[position]) {
        issues.push({
          code: "consecutive-position",
          message:
            `"${current[position]}" stays in position ${position + 1} between ` +
            `week ${i + 1} and week ${((i + 1) % schedule.length) + 1}.`,
        });
      }
    }
  }

  return issues;
}

export type ScheduleReport = {
  valid: boolean;
  issues: ValidationIssue[];
  /** Repeated strong adjacencies for each week-to-week transition. */
  transitions: Array<{ from: number; to: number; repeats: number }>;
  totalRepeats: number;
  perPair: Array<{
    pair: [ChildId, ChildId];
    tableStrong: number;
    tableWeak: number;
    vehicleStrong: number;
    vehicleWeak: number;
    combinedStrong: number;
    combinedWeighted: number;
  }>;
  spread: { min: number; max: number; range: number; variance: number };
};

/** Build a full human-readable report for a schedule. */
export function analyseSchedule(
  schedule: RotationSchedule,
  children: readonly ChildId[] = CHILD_IDS,
): ScheduleReport {
  const issues = validateRotationSchedule(schedule, children);
  const [tableModel, vehicleModel] = ADJACENCY_MODELS;
  const table = getPairAdjacencyCounts(schedule, [tableModel], children);
  const vehicle = getPairAdjacencyCounts(schedule, [vehicleModel], children);
  const combined = getPairAdjacencyCounts(schedule, ADJACENCY_MODELS, children);

  const perPair = allSiblingPairs(children).map((pair) => {
    const key = pairKey(pair[0], pair[1]);
    return {
      pair,
      tableStrong: table.strong.get(key) ?? 0,
      tableWeak: table.weak.get(key) ?? 0,
      vehicleStrong: vehicle.strong.get(key) ?? 0,
      vehicleWeak: vehicle.weak.get(key) ?? 0,
      combinedStrong: combined.strong.get(key) ?? 0,
      combinedWeighted: combined.weighted.get(key) ?? 0,
    };
  });

  const weightedValues = perPair.map((entry) => entry.combinedWeighted);
  const mean =
    weightedValues.reduce((sum, value) => sum + value, 0) / weightedValues.length;
  const variance =
    weightedValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    weightedValues.length;

  const transitions = schedule.map((week, i) => ({
    from: i + 1,
    to: ((i + 1) % schedule.length) + 1,
    repeats: repeatedAdjacencies(week, schedule[(i + 1) % schedule.length]),
  }));

  return {
    valid: issues.length === 0,
    issues,
    transitions,
    totalRepeats: transitions.reduce((sum, t) => sum + t.repeats, 0),
    perPair,
    spread: {
      min: Math.min(...weightedValues),
      max: Math.max(...weightedValues),
      range: Math.max(...weightedValues) - Math.min(...weightedValues),
      variance,
    },
  };
}
