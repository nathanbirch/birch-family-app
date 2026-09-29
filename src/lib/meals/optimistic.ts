/**
 * What a tap on the Meals page does to the family's state, before the server
 * has answered.
 *
 * Pure, and the reducer `MealsBoard` hands to `useOptimistic`. Every Server
 * Action in `actions.ts` has a matching change here, and the two must agree —
 * if they did not, a heart would fill on tap and then empty when the real
 * answer arrived. The tests hold them to that.
 */

import type { PersonId } from "@/config/family";
import type { RatingScore } from "@/config/meals";

import type { FamilyMealState, PlanEntry } from "./types";

export type MealStateChange =
  | { kind: "favorite"; recipeId: string; favorite: boolean }
  | { kind: "rate"; recipeId: string; personId: PersonId; score: RatingScore | 0 }
  | { kind: "cooked"; recipeId: string; day: string; made: boolean }
  | { kind: "plan-add"; entry: PlanEntry }
  | { kind: "plan-update"; id: string; servings?: number; day?: number | null }
  | { kind: "plan-remove"; id: string }
  | { kind: "plan-clear" }
  | { kind: "have"; ingredientId: string; have: boolean };

export function applyMealChange(
  state: FamilyMealState,
  change: MealStateChange,
): FamilyMealState {
  switch (change.kind) {
    case "favorite": {
      const without = state.favorites.filter((id) => id !== change.recipeId);
      return { ...state, favorites: change.favorite ? [...without, change.recipeId] : without };
    }

    case "rate": {
      const current = { ...state.ratings[change.recipeId] };
      if (change.score === 0) delete current[change.personId];
      else current[change.personId] = change.score;
      return { ...state, ratings: { ...state.ratings, [change.recipeId]: current } };
    }

    case "cooked": {
      const days = (state.cooked[change.recipeId] ?? []).filter((day) => day !== change.day);
      const next = change.made ? [...days, change.day].sort().reverse() : days;
      return { ...state, cooked: { ...state.cooked, [change.recipeId]: next } };
    }

    case "plan-add": {
      if (state.plan.entries.some((entry) => entry.id === change.entry.id)) return state;
      return {
        ...state,
        plan: { ...state.plan, entries: [...state.plan.entries, change.entry] },
      };
    }

    case "plan-update":
      return {
        ...state,
        plan: {
          ...state.plan,
          entries: state.plan.entries.map((entry) =>
            entry.id === change.id
              ? {
                  ...entry,
                  ...(change.servings !== undefined ? { servings: change.servings } : {}),
                  ...(change.day !== undefined ? { day: change.day } : {}),
                }
              : entry,
          ),
        },
      };

    case "plan-remove":
      return {
        ...state,
        plan: {
          ...state.plan,
          entries: state.plan.entries.filter((entry) => entry.id !== change.id),
        },
      };

    case "plan-clear":
      return { ...state, plan: { entries: [], haveIt: [] } };

    case "have": {
      const without = state.plan.haveIt.filter((id) => id !== change.ingredientId);
      return {
        ...state,
        plan: {
          ...state.plan,
          haveIt: change.have ? [...without, change.ingredientId] : without,
        },
      };
    }
  }
}
