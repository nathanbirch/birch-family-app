/**
 * The in-process half of rate limiting: the fast, free, per-instance layer.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS LAYER IS FOR, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * These counters live in one Node process's memory. On Vercel that means one
 * serverless instance, and there can be several — so an attacker spread across
 * enough concurrent instances sees a limit that is effectively multiplied by
 * the instance count, and every limit here resets when an instance recycles.
 * **This layer alone cannot bound anything.** It is stated plainly here
 * because a rate limiter that is quietly per-instance is worse than none: it
 * looks like a control and is not one.
 *
 * What it *is* for is the two jobs a distributed store would do badly:
 *
 * 1. **Rejecting invalid credentials for free.** A brute-force attempt must
 *    never cost a database round trip, or the defence becomes the attack — the
 *    cheapest way to run up a MongoDB bill would be to guess passwords at it.
 *    This layer answers in microseconds and touches nothing.
 * 2. **Shedding a burst before it reaches anything expensive.** By the time a
 *    request is being counted durably it has already cost a network hop.
 *
 * The ceilings that actually bound cost — per-credential daily and global
 * daily — are durable and live in `usage.ts`. The edge layer that bounds
 * traffic before it reaches this process at all is the platform's, and is
 * configuration rather than code: see docs/family-api/security.md.
 *
 * ---------------------------------------------------------------------------
 * FIXED WINDOWS, NOT SLIDING
 * ---------------------------------------------------------------------------
 * A fixed window lets through up to twice the limit across a window boundary.
 * For a family API whose honest traffic is a handful of requests an hour that
 * is irrelevant, and a fixed window is a counter and an expiry rather than a
 * list of timestamps per key — which means an attacker cannot make this module
 * allocate in proportion to the requests they send.
 */

/** One counter. Kept flat and small: this is allocated per distinct key. */
type Window = {
  count: number;
  /** Epoch ms at which `count` resets. */
  resetAt: number;
  /** Epoch ms until which this key is blocked outright. 0 when it is not. */
  blockedUntil: number;
};

export type LimitDecision = {
  allowed: boolean;
  /** Seconds until the caller could succeed. Only meaningful when blocked. */
  retryAfterSeconds: number;
};

const ALLOWED: LimitDecision = { allowed: true, retryAfterSeconds: 0 };

/**
 * A bounded set of counters.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A CEILING ON THE NUMBER OF KEYS
 * ---------------------------------------------------------------------------
 * The auth-failure limiter is keyed by source address. An attacker with a
 * large address pool — or one simply spoofing `X-Forwarded-For` upstream of
 * something that trusts it — could otherwise make this map grow until the
 * function runs out of memory, turning a rate limiter into the denial of
 * service it exists to prevent.
 *
 * So the map has a hard cap, and when it is full **new keys are refused**
 * rather than admitted or allowed to evict existing ones. Refusing is the
 * conservative direction: a legitimate caller sees a 429 during an attack,
 * which is the correct behaviour for an API with one legitimate caller.
 * Evicting would be strictly worse — it would let an attacker flush their own
 * block by generating traffic from fresh addresses.
 */
export class WindowStore {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly maxKeys = 10_000) {}

  /**
   * Count one event against `key`.
   *
   * `now` is injected rather than read from the clock so the tests can walk a
   * window boundary exactly instead of sleeping through one.
   */
  hit(
    key: string,
    options: { limit: number; windowMs: number; blockMs?: number },
    now: number,
  ): LimitDecision {
    this.prune(now);

    let window = this.windows.get(key);

    if (window && window.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((window.blockedUntil - now) / 1000),
      };
    }

    if (!window || window.resetAt <= now) {
      if (!window && this.windows.size >= this.maxKeys) {
        // Full. Refuse rather than admit — see the note above.
        return { allowed: false, retryAfterSeconds: 60 };
      }
      window = { count: 0, resetAt: now + options.windowMs, blockedUntil: 0 };
      this.windows.set(key, window);
    }

    window.count += 1;

    if (window.count > options.limit) {
      // Repeated exhaustion escalates from "wait out the window" to a block,
      // so a persistent guesser stops getting a fresh five attempts a minute
      // for as long as they care to keep trying.
      if (options.blockMs) window.blockedUntil = now + options.blockMs;
      const until = Math.max(window.resetAt, window.blockedUntil);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
      };
    }

    return ALLOWED;
  }

  /** Visible for tests and for the runbook's "how do I clear a block" answer. */
  reset(): void {
    this.windows.clear();
  }

  size(): number {
    return this.windows.size;
  }

  /**
   * Drop expired entries.
   *
   * Amortised: a full sweep runs at most once a minute, so a burst of a
   * thousand requests pays for one sweep rather than a thousand. Between
   * sweeps an expired entry costs one comparison in `hit()`, which is where it
   * would be checked anyway.
   */
  private lastPrune = 0;

  private prune(now: number): void {
    if (now - this.lastPrune < 60_000) return;
    this.lastPrune = now;

    for (const [key, window] of this.windows) {
      if (window.resetAt <= now && window.blockedUntil <= now) {
        this.windows.delete(key);
      }
    }
  }
}

/*
 * The three process-wide stores.
 *
 * Stashed on `globalThis` for the same reason `src/lib/db.ts` stashes the
 * Mongo client: `next dev` re-evaluates modules on every edit, and a limiter
 * that forgets everything each time a file is saved cannot be tested by hand
 * locally. In production the module is evaluated once and this is a no-op.
 */
declare global {
  var __birchFamilyApiLimiters:
    | { authFail: WindowStore; burst: WindowStore; sustained: WindowStore }
    | undefined;
}

function stores() {
  globalThis.__birchFamilyApiLimiters ??= {
    authFail: new WindowStore(),
    burst: new WindowStore(1_000),
    sustained: new WindowStore(1_000),
  };
  return globalThis.__birchFamilyApiLimiters;
}

/**
 * The limiter for requests that failed authentication.
 *
 * Keyed by a *hashed* source address (see `logging.ts`), and deliberately
 * checked before anything else touches the network or the database.
 */
export function checkAuthFailure(
  sourceKey: string,
  options: { limit: number; blockSeconds: number },
  now: number = Date.now(),
): LimitDecision {
  return stores().authFail.hit(
    sourceKey,
    { limit: options.limit, windowMs: 60_000, blockMs: options.blockSeconds * 1000 },
    now,
  );
}

/** Short-window limiter for successfully authenticated requests. */
export function checkBurst(
  credentialKey: string,
  limit: number,
  now: number = Date.now(),
): LimitDecision {
  return stores().burst.hit(credentialKey, { limit, windowMs: 60_000 }, now);
}

/** Hour-window limiter for successfully authenticated requests. */
export function checkSustained(
  credentialKey: string,
  limit: number,
  now: number = Date.now(),
): LimitDecision {
  return stores().sustained.hit(
    credentialKey,
    { limit, windowMs: 60 * 60_000 },
    now,
  );
}

/** Clear every in-process limiter. Used by tests and by the emergency runbook. */
export function resetLimiters(): void {
  const store = stores();
  store.authFail.reset();
  store.burst.reset();
  store.sustained.reset();
}
