import "server-only";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { extractBearerToken } from "@/lib/family-api/auth";
import { checkAuthFailure } from "@/lib/family-api/rate-limit";
import { isItemId } from "@/lib/shopping/list";

import { searchable } from "./browse";
import { ingredientUsage } from "./costing";
import {
  API_KEY_LENGTH,
  MAX_PRICE_JUMP,
  PriceUpdateSchema,
  hashApiKey,
  suspiciousJump,
  toApiIngredient,
} from "./price-api-shape";
import { isApiKeyHash, readCatalog, setStorePrice } from "./store";

/**
 * The Meals price API: the one door, outside the family login, through which
 * a scheduled assistant reads the ingredient list and records what a store
 * charges today.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CAN AND CANNOT DO
 * ---------------------------------------------------------------------------
 * It can list ingredients, read one, and set **one store's price** on one —
 * for Walmart, Broulim's or Costco only. It cannot create or delete anything,
 * touch a recipe, the plan, the shopping list, or any other page's data. That
 * is the whole reason it is three narrow routes rather than a general one.
 *
 * ---------------------------------------------------------------------------
 * THE KEY
 * ---------------------------------------------------------------------------
 * A bearer key made by `npm run meals:api-key`, which prints it once and
 * stores only its SHA-256 in `mealApiKeys`. So a leaked database holds no
 * usable key, and revoking one is deleting its document. The lookup is by
 * hash, and a 256-bit random key cannot be guessed a byte at a time through
 * timing, so there is no constant-time comparison to get wrong.
 *
 * Failed attempts are limited per (hashed) source address with the same
 * limiter the family-context API uses, in its own namespace: ten wrong keys a
 * minute, then ten minutes of 429s.
 *
 * `proxy.ts` excludes `/api/meals/v1/` from the session redirect for the
 * reason it excludes `/api/family/`: a caller with a bearer key and no cookie
 * would otherwise be sent to the login page. Everything else under
 * `/api/meals/` — the photos — stays behind the login.
 */

const AUTH_FAILURE_LIMIT = { limit: 10, blockSeconds: 600 };
const MAX_BODY_BYTES = 4_096;

type Params = { params: Promise<{ id: string }> };

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

function problem(status: number, error: string, message: string, extra?: Record<string, string>) {
  return json({ error, message }, status, extra);
}

function sourceKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `meals:${createHash("sha256").update(forwarded).digest("hex").slice(0, 32)}`;
}

/** `null` when the caller may go on; otherwise the response to send. */
async function authorise(request: Request): Promise<Response | null> {
  const token = extractBearerToken(request.headers.get("authorization"));
  const known =
    token !== null && token.length === API_KEY_LENGTH && (await isApiKeyHash(hashApiKey(token)));
  if (known) return null;

  const decision = checkAuthFailure(sourceKey(request), AUTH_FAILURE_LIMIT);
  if (!decision.allowed) {
    return problem(429, "rate_limited", "Too many failed attempts. Try again later.", {
      "Retry-After": String(decision.retryAfterSeconds),
    });
  }
  return problem(401, "unauthorized", "Send the Meals API key as `Authorization: Bearer <key>`.", {
    "WWW-Authenticate": 'Bearer realm="birch-meals"',
  });
}

async function loadCatalog() {
  const catalog = await readCatalog();
  // The starter catalog is a fine thing to *show* when the cluster is away,
  // and exactly the wrong thing to hand a tool that is about to write.
  return catalog.source === "database" ? catalog : null;
}

/**
 * Any failure the handlers did not plan for — the cluster dropping mid-write —
 * becomes a plain 503 with nothing in it worth reading, rather than a stack.
 */
async function guarded(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    console.error("[meals-api] Request failed:", error);
    return problem(503, "unavailable", "That could not be done right now. Try again shortly.");
  }
}

/** GET /api/meals/v1/ingredients[?q=cheddar] */
export function listIngredients(request: Request): Promise<Response> {
  return guarded(() => list(request));
}

/** GET /api/meals/v1/ingredients/{id} */
export function getIngredient(request: Request, context: Params): Promise<Response> {
  return guarded(() => getOne(request, context));
}

/** PUT /api/meals/v1/ingredients/{id}/prices */
export function putStorePrice(request: Request, context: Params): Promise<Response> {
  return guarded(() => putPrice(request, context));
}

async function list(request: Request): Promise<Response> {
  const denied = await authorise(request);
  if (denied) return denied;

  const catalog = await loadCatalog();
  if (!catalog) return problem(503, "unavailable", "The meals database can't be reached right now.");

  const usage = ingredientUsage(catalog.recipes);
  const query = new URL(request.url).searchParams.get("q")?.slice(0, 80) ?? "";
  const words = searchable(query).split(" ").filter(Boolean);
  const ingredients = catalog.ingredients
    .filter((ingredient) => {
      const name = searchable(ingredient.name);
      return words.every((word) => name.includes(word));
    })
    .map((ingredient) => toApiIngredient(ingredient, usage.get(ingredient.id)?.length ?? 0));

  return json({ count: ingredients.length, ingredients });
}

async function getOne(request: Request, context: Params): Promise<Response> {
  const denied = await authorise(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isItemId(id)) return problem(404, "not_found", "No ingredient has that id.");

  const catalog = await loadCatalog();
  if (!catalog) return problem(503, "unavailable", "The meals database can't be reached right now.");

  const ingredient = catalog.ingredients.find((item) => item.id === id);
  if (!ingredient) return problem(404, "not_found", "No ingredient has that id.");
  const usage = ingredientUsage(catalog.recipes).get(id)?.length ?? 0;
  return json(toApiIngredient(ingredient, usage));
}

async function putPrice(request: Request, context: Params): Promise<Response> {
  const denied = await authorise(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isItemId(id)) return problem(404, "not_found", "No ingredient has that id.");

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return problem(413, "too_large", "That body is too big.");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return problem(413, "too_large", "That body is too big.");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return problem(400, "bad_json", "The body must be JSON.");
  }

  const parsed = PriceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: "invalid",
        message: "Check the body: store, price, and optionally packLabel with packUnits.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      422,
    );
  }

  const catalog = await loadCatalog();
  if (!catalog) return problem(503, "unavailable", "The meals database can't be reached right now.");
  const ingredient = catalog.ingredients.find((item) => item.id === id);
  if (!ingredient) return problem(404, "not_found", "No ingredient has that id.");

  if (!parsed.data.confirm && suspiciousJump(ingredient, parsed.data)) {
    return problem(
      409,
      "check_pack",
      `That moves the price per ${ingredient.unit} more than ${MAX_PRICE_JUMP}× from what is recorded. ` +
        `Check packUnits is in ${ingredient.unit}s (the usual ${ingredient.packLabel} holds ` +
        `${ingredient.packUnits}), then resend with "confirm": true if it is right.`,
    );
  }

  const updated = await setStorePrice(id, parsed.data);
  if (!updated) return problem(404, "not_found", "No ingredient has that id.");

  revalidatePath("/meals", "layout");
  const usage = ingredientUsage(catalog.recipes).get(id)?.length ?? 0;
  return json(toApiIngredient(updated, usage));
}
