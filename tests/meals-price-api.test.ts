/**
 * @vitest-environment node
 *
 * The Meals price API, end to end, with the database mocked.
 *
 * What is pinned here is what makes it safe to leave open to the internet
 * behind nothing but a key: no key, a wrong key or a malformed one never
 * reaches the catalog; only the three main stores can be written; a body that
 * would silently re-cost every meal (the pack in the wrong unit) is refused
 * until confirmed; and only one store's price on one ingredient ever changes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const store = vi.hoisted(() => ({
  isApiKeyHash: vi.fn(),
  readCatalog: vi.fn(),
  setStorePrice: vi.fn(),
}));
vi.mock("@/lib/meals/store", () => store);

const { listIngredients, getIngredient, putStorePrice } = await import("@/lib/meals/price-api");
const { hashApiKey, API_KEY_LENGTH, suspiciousJump, toApiIngredient } = await import(
  "@/lib/meals/price-api-shape"
);
const { compiledCatalog, seedId } = await import("@/lib/meals/seed");
const { resetLimiters } = await import("@/lib/family-api/rate-limit");

const KEY = "k".repeat(API_KEY_LENGTH);
const CHEDDAR = seedId("ingredient", "cheddar");
const BASE = "https://birch.example/api/meals/v1/ingredients";

function catalog() {
  return { ...compiledCatalog(), source: "database" as const };
}

function request(url: string, init: RequestInit & { key?: string | null } = {}) {
  const headers = new Headers(init.headers);
  const key = init.key === undefined ? KEY : init.key;
  if (key !== null) headers.set("authorization", `Bearer ${key}`);
  headers.set("x-forwarded-for", "203.0.113.9");
  return new Request(url, { ...init, headers });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function put(body: unknown, id = CHEDDAR, key?: string | null) {
  return putStorePrice(
    request(`${BASE}/${id}/prices`, {
      method: "PUT",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
      key,
    }),
    params(id),
  );
}

beforeEach(() => {
  resetLimiters();
  store.isApiKeyHash.mockReset().mockImplementation(async (hash: string) => hash === hashApiKey(KEY));
  store.readCatalog.mockReset().mockResolvedValue(catalog());
  store.setStorePrice.mockReset().mockImplementation(async (id: string, price: { store: string; price: number; packLabel?: string; packUnits?: number }) => {
    const ingredient = catalog().ingredients.find((item) => item.id === id);
    if (!ingredient) return null;
    return {
      ...ingredient,
      prices: [
        ...ingredient.prices.filter((p) => p.store !== price.store),
        { ...price, checkedAt: Date.now(), estimated: false },
      ],
    };
  });
});

describe("the key", () => {
  it("refuses a request with no key, and never reads the catalog", async () => {
    const response = await listIngredients(request(BASE, { key: null }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(store.readCatalog).not.toHaveBeenCalled();
  });

  it("refuses a wrong key, and never writes", async () => {
    const response = await put({ store: "Walmart", price: 7.5 }, CHEDDAR, "x".repeat(API_KEY_LENGTH));
    expect(response.status).toBe(401);
    expect(store.setStorePrice).not.toHaveBeenCalled();
  });

  it("does not even look up a key of the wrong length", async () => {
    await listIngredients(request(BASE, { key: "short" }));
    expect(store.isApiKeyHash).not.toHaveBeenCalled();
  });

  it("looks keys up by hash, never by the key itself", async () => {
    await listIngredients(request(BASE));
    expect(store.isApiKeyHash).toHaveBeenCalledWith(hashApiKey(KEY));
    expect(hashApiKey(KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stops answering a source after ten wrong keys", async () => {
    const wrong = () => listIngredients(request(BASE, { key: "y".repeat(API_KEY_LENGTH) }));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await wrong()).status).toBe(401);
    }
    const blocked = await wrong();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("reading", () => {
  it("lists every ingredient with what a tool needs to price it", async () => {
    const response = await listIngredients(request(BASE));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.count).toBe(231);
    const cheddar = body.ingredients.find((i: { id: string }) => i.id === CHEDDAR);
    expect(cheddar).toMatchObject({
      name: "Cheddar cheese, shredded",
      unit: "cup",
      usualPack: { label: "2 lb bag", units: 8 },
      best: { store: "Costco" },
    });
    expect(cheddar.usedInRecipes).toBeGreaterThan(10);
    expect(cheddar.prices.find((p: { store: string }) => p.store === "Costco").pack).toEqual({
      label: "5 lb bag",
      units: 20,
    });
  });

  it("searches by name", async () => {
    const body = await (await listIngredients(request(`${BASE}?q=cheddar`))).json();
    expect(body.ingredients.map((i: { name: string }) => i.name)).toEqual(["Cheddar cheese, shredded"]);
  });

  it("reads one ingredient, and 404s one that does not exist", async () => {
    expect((await getIngredient(request(`${BASE}/${CHEDDAR}`), params(CHEDDAR))).status).toBe(200);
    const missing = "0".repeat(24);
    expect((await getIngredient(request(`${BASE}/${missing}`), params(missing))).status).toBe(404);
    expect((await getIngredient(request(`${BASE}/nope`), params("nope"))).status).toBe(404);
  });

  it("refuses to serve the offline starter catalog as if it were the database", async () => {
    store.readCatalog.mockResolvedValue(compiledCatalog());
    expect((await listIngredients(request(BASE))).status).toBe(503);
  });

  it("answers a database failure with a plain 503", async () => {
    store.isApiKeyHash.mockRejectedValue(new Error("cluster down, secret detail"));
    const response = await listIngredients(request(BASE));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret detail");
  });
});

describe("writing a price", () => {
  it("records one store's price in the usual pack", async () => {
    const response = await put({ store: "Walmart", price: 8.12 });
    expect(response.status).toBe(200);
    expect(store.setStorePrice).toHaveBeenCalledWith(CHEDDAR, { store: "Walmart", price: 8.12 });
    const body = await response.json();
    expect(body.prices.find((p: { store: string }) => p.store === "Walmart")).toMatchObject({
      price: 8.12,
      estimated: false,
    });
  });

  it("records a store's own bigger pack", async () => {
    const response = await put({ store: "Costco", price: 17.49, packLabel: "5 lb bag", packUnits: 20 });
    expect(response.status).toBe(200);
    expect(store.setStorePrice).toHaveBeenCalledWith(
      CHEDDAR,
      expect.objectContaining({ packLabel: "5 lb bag", packUnits: 20 }),
    );
  });

  it("only writes the three stores the family shops at", async () => {
    const response = await put({ store: "Target", price: 5 });
    expect(response.status).toBe(422);
    expect(store.setStorePrice).not.toHaveBeenCalled();
  });

  it("refuses nonsense: no price, a zero price, half a pack, and not-JSON", async () => {
    expect((await put({ store: "Walmart" })).status).toBe(422);
    expect((await put({ store: "Walmart", price: 0 })).status).toBe(422);
    expect((await put({ store: "Costco", price: 17, packUnits: 20 })).status).toBe(422);
    expect((await put("store=Walmart")).status).toBe(400);
    expect(store.setStorePrice).not.toHaveBeenCalled();
  });

  it("refuses a body far too big to be a price", async () => {
    expect((await put({ store: "Walmart", price: 5, padding: "x".repeat(5000) })).status).toBe(413);
  });

  it("holds back a pack in the wrong unit until it is confirmed", async () => {
    // "5 lb bag" recorded as 5 — pounds, not the 20 cups it holds. Cheese is
    // four cups a pound, so this is *exactly* 4× — the case a "more than 4×"
    // rule let through when tried against a real server.
    const suspicious = await put({ store: "Costco", price: 16.99, packLabel: "5 lb bag", packUnits: 5 });
    expect(suspicious.status).toBe(409);
    expect((await suspicious.json()).message).toContain("cups");
    expect(store.setStorePrice).not.toHaveBeenCalled();

    const confirmed = await put({
      store: "Costco",
      price: 17.49,
      packLabel: "5 lb bag",
      packUnits: 5,
      confirm: true,
    });
    expect(confirmed.status).toBe(200);
  });

  it("404s an ingredient that does not exist, without writing", async () => {
    expect((await put({ store: "Walmart", price: 5 }, "f".repeat(24))).status).toBe(404);
    expect(store.setStorePrice).not.toHaveBeenCalled();
  });
});

describe("the price-jump check", () => {
  const cheddar = compiledCatalog().ingredients.find((i) => i.id === CHEDDAR)!;

  it("passes an ordinary change and a fair bulk price", () => {
    expect(suspiciousJump(cheddar, { store: "Walmart", price: 9.49 })).toBe(false);
    expect(suspiciousJump(cheddar, { store: "Costco", price: 18, packLabel: "5 lb", packUnits: 20 })).toBe(false);
  });

  it("flags a per-unit price moved three times or more, either way", () => {
    // Exactly the wrong-unit case: the same Costco price, pounds for cups.
    expect(suspiciousJump(cheddar, { store: "Costco", price: 16.99, packLabel: "5 lb", packUnits: 5 })).toBe(true);
    expect(suspiciousJump(cheddar, { store: "Walmart", price: 40 })).toBe(true);
    expect(suspiciousJump(cheddar, { store: "Walmart", price: 1 })).toBe(true);
  });

  it("describes prices with their per-unit cost and ISO dates", () => {
    const view = toApiIngredient(cheddar, 3);
    expect(view.prices[0].checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(view.prices.every((p) => typeof p.perUnit === "number")).toBe(true);
  });
});
