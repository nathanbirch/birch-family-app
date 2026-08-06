import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which data sources fell back during the current request.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES
 * ---------------------------------------------------------------------------
 * Three of this app's stores are deliberately forgiving. `getWeekMarks` returns
 * a blank week when the cluster is unreachable; `getChorePools` and
 * `getPetRotations` fall back to the values compiled into `src/config/`. That
 * is exactly right for a page a family looks at over breakfast — a database
 * wobble should not blank the seating chart — and each one says so in a console
 * warning.
 *
 * It is not right for an API. A blank week and a week in which nobody has
 * ticked anything are the same object, so a child asking the assistant whether
 * they are finished would be told, confidently, that they had done nothing all
 * day. That is the failure mode
 * [`docs/ai/13`](../../docs/ai/13—birch-ai-integration-architecture.md) calls
 * *dishonest*: not merely wrong, but wrong and certain-sounding.
 *
 * So the stores also record the fallback here, and `lib/family-api/sources.ts`
 * reads it into `dataFreshness.degradedSources`. The pages never call
 * `withDataHealth`, so for them this is a no-op and their behaviour is exactly
 * unchanged.
 *
 * ---------------------------------------------------------------------------
 * WHY `AsyncLocalStorage` AND NOT REACT'S `cache()`
 * ---------------------------------------------------------------------------
 * `cache()` was the first attempt and it is silently wrong here. It scopes to a
 * *render*, and a Route Handler is not one — outside a render it hands back a
 * fresh value on every call, so `reportDegraded` would write to one set and
 * `degradedSources` would read an empty different one, for ever, with no error
 * anywhere. A health signal that quietly reports health is worse than no signal
 * at all.
 *
 * `AsyncLocalStorage` scopes to an explicit `run()`, which is a scope this
 * code owns rather than one the framework happens to provide. It also makes
 * the no-op case honest: outside `withDataHealth` there is no store, so
 * `reportDegraded` does nothing and `degradedSources` returns `[]`, which is
 * precisely the behaviour the pages want.
 *
 * A module-level `Set` would have been simpler and unusable: it is shared by
 * every request an instance handles, so one failed read at breakfast would mark
 * every response degraded until the process recycled, and one request's failure
 * would surface in another request's response.
 */

declare global {
  var __birchDataHealth: AsyncLocalStorage<Set<string>> | undefined;
}

/*
 * Stashed on `globalThis` for the same reason `src/lib/db.ts` stashes the Mongo
 * client: `next dev` re-evaluates modules on save, and two copies of this
 * module would mean the store writing into one `AsyncLocalStorage` while the
 * reader looked at another — the exact bug this file exists to avoid.
 */
function storage(): AsyncLocalStorage<Set<string>> {
  globalThis.__birchDataHealth ??= new AsyncLocalStorage<Set<string>>();
  return globalThis.__birchDataHealth;
}

/**
 * Run `work` with a fresh degradation scope.
 *
 * Everything `work` awaits — however deep — reports into the same set, and
 * nothing outside it can see or affect that set.
 */
export function withDataHealth<T>(work: () => Promise<T>): Promise<T> {
  return storage().run(new Set<string>(), work);
}

/**
 * Name a source that fell back. Safe to call repeatedly, and a no-op outside a
 * `withDataHealth` scope — which is every page in the app.
 */
export function reportDegraded(source: string): void {
  storage().getStore()?.add(source);
}

/** What fell back during this scope, in the order it was reported. */
export function degradedSources(): string[] {
  const store = storage().getStore();
  return store ? [...store] : [];
}
