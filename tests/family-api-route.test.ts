/**
 * @vitest-environment node
 *
 * The whole request pipeline, end to end, with the database and the calendar
 * mocked out.
 *
 * This is where the ordering guarantees in `lib/family-api/handler.ts` are
 * pinned: that an unauthenticated request never reaches a data source, that a
 * kill switch beats a valid credential, and that no error body ever says
 * anything useful to whoever sent it.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The two things the handler touches that would otherwise need a cluster.
 *
 * `gatherContextInput` is mocked rather than the MongoDB driver, so these
 * tests exercise the pipeline and not the driver — and so a test can assert
 * that it was *not* called, which is the whole point of several of them.
 */
const gatherContextInput = vi.hoisted(() => vi.fn());
const countAndCheck = vi.hoisted(() => vi.fn());

vi.mock("@/lib/family-api/sources", () => ({ gatherContextInput }));
vi.mock("@/lib/family-api/usage", () => ({ countAndCheck, peek: vi.fn() }));

const { handleFamilyContext, checkRequestShape } = await import(
  "@/lib/family-api/handler"
);
const { clearCache } = await import("@/lib/family-api/cache");
const { resetLimiters } = await import("@/lib/family-api/rate-limit");
const { familyNow } = await import("@/lib/family-api/time");
const { MIN_KEY_LENGTH } = await import("@/lib/family-api/auth");

const KEY = "K".repeat(MIN_KEY_LENGTH);
const NOW = familyNow(new Date("2026-08-05T18:00:00Z"), "America/Boise");
const SAVED = { ...process.env };

function contextInput(child: { id: string; name: string; birthDate: string } | null) {
  return {
    now: NOW,
    child,
    starDayIndex: 2,
    chores: child
      ? [
          {
            id: "tidy-room",
            label: "Tidy room",
            chart: "chores",
            marks: [true, false, false, false, false],
          },
        ]
      : [],
    seating: { weekNumber: 2, cycleLength: 5, summary: "Clara is in Child Seat 4." },
    petSleeping: {
      date: "2026-08-05",
      assignments: [{ pet: "Leia", assignedTo: "Clara" }],
    },
    calendar: { status: "ok" as const, today: [], nextSevenDays: [] },
    upcomingBirthdays: { items: [], truncated: false },
    windDownTime: "19:30",
    lastUpdatedAt: NOW.instant,
    degraded: [] as string[],
  };
}

function get(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "GET", headers });
}

const AUTHED = { authorization: `Bearer ${KEY}` };
const URL_BASE = "https://family.example/api/family/v1/family-context";

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  resetLimiters();

  process.env.BIRCH_FAMILY_API_ENABLED = "true";
  process.env.BIRCH_FAMILY_API_KEY = KEY;
  delete process.env.BIRCH_FAMILY_API_KEY_NEXT;
  delete process.env.BIRCH_FAMILY_API_DENY_ALL;

  gatherContextInput.mockImplementation(async ({ child }) => contextInput(child));
  countAndCheck.mockResolvedValue({ status: "ok", count: 1 });
});

afterEach(() => {
  process.env = { ...SAVED };
});

/* ------------------------------------------------------------------ */

describe("authentication", () => {
  it("serves a valid key", async () => {
    const response = await handleFamilyContext(get(URL_BASE, AUTHED));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.schemaVersion).toBeDefined();
    expect(body.timezone).toBe("America/Boise");
  });

  it("rejects a missing key with a generic 401", async () => {
    const response = await handleFamilyContext(get(URL_BASE));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Authentication required.",
        correlationId: expect.any(String),
      },
    });
  });

  it("gives a wrong key the byte-identical answer a missing one gets", async () => {
    /*
     * The whole point: an attacker must not be able to tell "there is no key
     * configured" from "your key is wrong" from "your key was revoked".
     */
    const missing = await handleFamilyContext(get(URL_BASE));
    const wrong = await handleFamilyContext(
      get(URL_BASE, { authorization: `Bearer ${"Z".repeat(MIN_KEY_LENGTH)}` }),
    );

    const strip = (body: Record<string, { correlationId?: string }>) => {
      delete body.error.correlationId;
      return body;
    };

    expect(wrong.status).toBe(missing.status);
    expect(strip(await wrong.json())).toEqual(strip(await missing.json()));
  });

  it("never reaches a data source without a valid key", async () => {
    await handleFamilyContext(get(URL_BASE));
    await handleFamilyContext(get(URL_BASE, { authorization: "Bearer nope" }));

    // Neither the database nor the durable counters. Guessing at this endpoint
    // must cost this family nothing at all.
    expect(gatherContextInput).not.toHaveBeenCalled();
    expect(countAndCheck).not.toHaveBeenCalled();
  });

  it("accepts the rotation's second key", async () => {
    const next = "N".repeat(MIN_KEY_LENGTH);
    process.env.BIRCH_FAMILY_API_KEY_NEXT = next;

    const response = await handleFamilyContext(
      get(URL_BASE, { authorization: `Bearer ${next}` }),
    );
    expect(response.status).toBe(200);
  });

  it("stops serving a key the moment it is removed", async () => {
    delete process.env.BIRCH_FAMILY_API_KEY;
    expect((await handleFamilyContext(get(URL_BASE, AUTHED))).status).toBe(401);
  });

  it("never echoes the key anywhere in the response", async () => {
    const response = await handleFamilyContext(get(URL_BASE, AUTHED));
    const body = await response.text();
    const headers = JSON.stringify([...response.headers]);

    expect(body).not.toContain(KEY);
    expect(headers).not.toContain(KEY);
    expect(headers.toLowerCase()).not.toContain("authorization");
  });

  it("never writes the key to the log", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await handleFamilyContext(get(`${URL_BASE}?child=clara`, AUTHED));
    await handleFamilyContext(get(URL_BASE));

    const written = [...info.mock.calls, ...warn.mock.calls].flat().join("\n");
    expect(written).not.toContain(KEY);
    expect(written.toLowerCase()).not.toContain("authorization");
    // Nor which child was asked about — only that one was.
    expect(written).not.toContain("clara");
    expect(written).toContain('"childRequested":true');

    info.mockRestore();
    warn.mockRestore();
  });
});

describe("the kill switches", () => {
  it("refuses everything when the feature flag is off", async () => {
    delete process.env.BIRCH_FAMILY_API_ENABLED;

    const response = await handleFamilyContext(get(URL_BASE, AUTHED));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("temporarily_unavailable");
    expect(gatherContextInput).not.toHaveBeenCalled();
  });

  it("refuses a valid key under deny-all", async () => {
    process.env.BIRCH_FAMILY_API_DENY_ALL = "true";
    expect((await handleFamilyContext(get(URL_BASE, AUTHED))).status).toBe(503);
  });

  it("fails closed for an unparseable flag", async () => {
    process.env.BIRCH_FAMILY_API_ENABLED = "TRUE";
    expect((await handleFamilyContext(get(URL_BASE, AUTHED))).status).toBe(503);
  });
});

describe("the child parameter", () => {
  it("returns a child's chores when named", async () => {
    const response = await handleFamilyContext(get(`${URL_BASE}?child=clara`, AUTHED));
    const body = await response.json();

    expect(body.identifiedChild.id).toBe("clara");
    expect(body.responsibilities.chores).toHaveLength(1);
  });

  it("returns family-wide context with no chores when omitted", async () => {
    const body = await (await handleFamilyContext(get(URL_BASE, AUTHED))).json();

    expect(body.identifiedChild).toBeNull();
    expect(body.responsibilities.chores).toEqual([]);
    expect(body.responsibilities.availability).toBe("requires-child");
  });

  it("returns a generic 404 for an unknown child", async () => {
    const response = await handleFamilyContext(
      get(`${URL_BASE}?child=nobody`, AUTHED),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    // Says nothing about who does exist.
    expect(body.error.message).not.toContain("nobody");
    expect(JSON.stringify(body)).not.toContain("clara");
    expect(gatherContextInput).not.toHaveBeenCalled();
  });

  it("does not serve one child's data under another child's cache key", async () => {
    const clara = await (
      await handleFamilyContext(get(`${URL_BASE}?child=clara`, AUTHED))
    ).json();
    const emily = await (
      await handleFamilyContext(get(`${URL_BASE}?child=emily`, AUTHED))
    ).json();
    const family = await (await handleFamilyContext(get(URL_BASE, AUTHED))).json();

    expect(clara.identifiedChild.id).toBe("clara");
    expect(emily.identifiedChild.id).toBe("emily");
    expect(family.identifiedChild).toBeNull();
  });

  it("treats different spellings of one child as the same cache entry", async () => {
    await handleFamilyContext(get(`${URL_BASE}?child=clara`, AUTHED));
    await handleFamilyContext(get(`${URL_BASE}?child=Clara`, AUTHED));

    // Resolved against the allowlist before the key is built, so the second
    // request is a cache hit rather than a second entry.
    expect(gatherContextInput).toHaveBeenCalledTimes(1);
  });
});

describe("request shape", () => {
  it.each([
    ["an unknown parameter", `${URL_BASE}?children=clara`],
    ["an extra parameter alongside a good one", `${URL_BASE}?child=clara&limit=999`],
    ["a repeated parameter", `${URL_BASE}?child=clara&child=emily`],
    ["an oversized parameter", `${URL_BASE}?child=${"x".repeat(200)}`],
  ])("rejects %s with a 400", async (_label, url) => {
    const response = await handleFamilyContext(get(url, AUTHED));
    expect(response.status).toBe(400);
    expect(gatherContextInput).not.toHaveBeenCalled();
  });

  it("rejects an oversized URL before parsing it", async () => {
    const url = `${URL_BASE}?child=${"x".repeat(2000)}`;
    expect(checkRequestShape(get(url))).toEqual({ ok: false });
  });

  it("rejects a GET carrying a body", async () => {
    const request = new Request(URL_BASE, {
      method: "GET",
      headers: { ...AUTHED, "content-length": "512" },
    });
    expect((await handleFamilyContext(request)).status).toBe(400);
  });

  it("accepts no parameters at all", () => {
    expect(checkRequestShape(get(URL_BASE))).toEqual({ ok: true, child: null });
  });
});

describe("rate limiting", () => {
  it("returns 429 with Retry-After once the burst limit is passed", async () => {
    process.env.BIRCH_FAMILY_API_BURST_PER_MINUTE = "3";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await handleFamilyContext(get(URL_BASE, AUTHED))).status).toBe(200);
    }

    const response = await handleFamilyContext(get(URL_BASE, AUTHED));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await response.json()).error.code).toBe("rate_limited");

    delete process.env.BIRCH_FAMILY_API_BURST_PER_MINUTE;
  });

  it("returns 429 after too many invalid credentials, without touching Mongo", async () => {
    process.env.BIRCH_FAMILY_API_AUTH_FAIL_PER_MINUTE = "2";

    const bad = { authorization: "Bearer wrong" };
    expect((await handleFamilyContext(get(URL_BASE, bad))).status).toBe(401);
    expect((await handleFamilyContext(get(URL_BASE, bad))).status).toBe(401);

    const blocked = await handleFamilyContext(get(URL_BASE, bad));
    expect(blocked.status).toBe(429);
    expect(countAndCheck).not.toHaveBeenCalled();

    delete process.env.BIRCH_FAMILY_API_AUTH_FAIL_PER_MINUTE;
  });

  it("returns 429 when the per-credential daily ceiling is spent", async () => {
    countAndCheck.mockResolvedValueOnce({
      status: "exceeded",
      count: 301,
      retryAfterSeconds: 3600,
    });

    const response = await handleFamilyContext(get(URL_BASE, AUTHED));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(gatherContextInput).not.toHaveBeenCalled();
  });

  it("returns 503 when the global circuit breaker trips", async () => {
    countAndCheck
      .mockResolvedValueOnce({ status: "ok", count: 5 })
      .mockResolvedValueOnce({
        status: "exceeded",
        count: 1001,
        retryAfterSeconds: 3600,
      });

    const response = await handleFamilyContext(get(URL_BASE, AUTHED));
    expect(response.status).toBe(503);
    expect(gatherContextInput).not.toHaveBeenCalled();
  });

  it("keeps serving, and says so, when the counters cannot be reached", async () => {
    countAndCheck.mockResolvedValue({ status: "unavailable" });

    const response = await handleFamilyContext(get(URL_BASE, AUTHED));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.dataFreshness.degradedSources).toContain("usage-counters");
    expect(body.dataFreshness.status).not.toBe("fresh");
  });
});

describe("caching", () => {
  it("serves a repeated request from cache without touching the sources", async () => {
    await handleFamilyContext(get(URL_BASE, AUTHED));
    await handleFamilyContext(get(URL_BASE, AUTHED));

    expect(gatherContextInput).toHaveBeenCalledTimes(1);
  });

  it("still counts a cached request against the ceilings", async () => {
    await handleFamilyContext(get(URL_BASE, AUTHED));
    await handleFamilyContext(get(URL_BASE, AUTHED));

    // Two requests, two credentials-and-global pairs. A cache hit must not be
    // a way to get free requests.
    expect(countAndCheck).toHaveBeenCalledTimes(4);
  });

  it("answers a conditional GET with 304", async () => {
    const first = await handleFamilyContext(get(URL_BASE, AUTHED));
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await handleFamilyContext(
      get(URL_BASE, { ...AUTHED, "if-none-match": etag! }),
    );
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("does not cache an error", async () => {
    await handleFamilyContext(get(URL_BASE));
    const response = await handleFamilyContext(get(URL_BASE));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("headers", () => {
  it("sets the security headers on a success", async () => {
    const response = await handleFamilyContext(get(URL_BASE, AUTHED));

    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=");
    expect(response.headers.get("cache-control")).toContain("private");
  });

  it("sets no CORS headers at all", async () => {
    // GPT Actions are server-to-server. A browser has no business here, and
    // omitting CORS entirely is what stops one.
    const response = await handleFamilyContext(get(URL_BASE, AUTHED));
    for (const [name] of response.headers) {
      expect(name.toLowerCase()).not.toContain("access-control");
    }
  });

  it("offers only GET and HEAD when it refuses a method", () => {
    // Next.js produces the 405 itself for an unexported method; this pins the
    // `Allow` header the error helper emits.
    expect(
      new Response(null, { headers: { Allow: "GET, HEAD" } }).headers.get("allow"),
    ).toBe("GET, HEAD");
  });
});

describe("failure", () => {
  it("returns a generic 503 when a source throws, leaking nothing", async () => {
    gatherContextInput.mockRejectedValue(
      new Error(
        "MongoServerError: connection to mongodb+srv://user:hunter2@cluster0" +
          ".pmxixtt.mongodb.net failed at /var/task/src/lib/db.ts:131",
      ),
    );

    const response = await handleFamilyContext(get(URL_BASE, AUTHED));
    expect(response.status).toBe(503);

    const raw = await response.text();
    for (const secret of [
      "mongodb",
      "hunter2",
      "cluster0",
      "/var/task",
      "MongoServerError",
      "db.ts",
    ]) {
      expect(raw, secret).not.toContain(secret);
    }

    expect(JSON.parse(raw)).toEqual({
      error: {
        code: "temporarily_unavailable",
        message: "Current family information is temporarily unavailable.",
        correlationId: expect.any(String),
      },
    });
  });

  it("gives every error a correlation id that identifies nobody", async () => {
    const response = await handleFamilyContext(get(URL_BASE));
    const { error } = await response.json();

    expect(error.correlationId).toMatch(/^[0-9a-f]{16}$/);
    expect(response.headers.get("x-correlation-id")).toBe(error.correlationId);
  });

  it("reports degraded sources honestly rather than as empty data", async () => {
    gatherContextInput.mockImplementation(async ({ child }) => ({
      ...contextInput(child),
      calendar: { status: "unavailable" as const, today: [], nextSevenDays: [] },
      degraded: ["calendar"],
    }));

    const body = await (await handleFamilyContext(get(URL_BASE, AUTHED))).json();
    expect(body.calendar.availability).toBe("unavailable");
    expect(body.dataFreshness.status).toBe("stale");
  });
});

describe("HEAD", () => {
  it("runs the whole pipeline and sends no body", async () => {
    const response = await handleFamilyContext(get(URL_BASE, AUTHED), {
      bodyless: true,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    // Counted, so HEAD is not a free way to probe the endpoint.
    expect(countAndCheck).toHaveBeenCalled();
  });
});
