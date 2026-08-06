/**
 * A safe, read-only probe of the ChatGPT API's defences.
 *
 *     npm run api:probe                       # against http://localhost:3000
 *     npm run api:probe -- https://family.nathanbirch.one
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS AND IS NOT
 * ---------------------------------------------------------------------------
 * It sends a few dozen ordinary HTTP requests and checks the answers. It is
 * not a penetration test, it generates no load worth the name, and it never
 * sends a method other than GET, HEAD, POST, PUT, PATCH or DELETE — the last
 * four only to confirm they are refused, which is the one case where sending a
 * write method is the *point*.
 *
 * It is safe to run against production, and the rate-limit section is opt-in
 * precisely because running it will briefly consume the day's burst allowance:
 *
 *     npm run api:probe -- https://family.nathanbirch.one --rate-limits
 *
 * The key is read from BIRCH_FAMILY_API_KEY in the environment and is never
 * printed, not even truncated.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const base = (args.find((arg) => !arg.startsWith("--")) ?? "http://localhost:3000")
  .replace(/\/$/, "");
const includeRateLimits = args.includes("--rate-limits");

const KEY = process.env.BIRCH_FAMILY_API_KEY?.trim() ?? "";
const CONTEXT = `${base}/api/family/v1/family-context`;
const HEALTH = `${base}/api/family/v1/health`;

let passed = 0;
let failed = 0;

function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, { redirect: "manual", ...options });
  const text = await response.text();
  return { response, text };
}

const authed = () => ({ Authorization: `Bearer ${KEY}` });

/**
 * Refused, either way.
 *
 * 401 is the ordinary answer and 429 is the auth-failure limiter having
 * started blocking this source — which it will, partway through this probe,
 * and again if the probe is run twice inside its block window. Both are the
 * system working. A 200 is the finding.
 */
const refused = (status) => status === 401 || status === 429;

/* ------------------------------------------------------------------ */

console.log(`\nProbing ${base}\n`);

console.log("Transport and headers");
{
  if (base.startsWith("https://")) {
    check("the base URL is HTTPS", true);
  } else {
    console.log("  · skipping HTTPS checks (probing a local HTTP server)");
  }

  const { response } = await request(CONTEXT);
  check("nosniff is set", response.headers.get("x-content-type-options") === "nosniff");
  check(
    "a referrer policy is set",
    response.headers.get("referrer-policy") === "no-referrer",
  );
  check("errors are not stored", response.headers.get("cache-control") === "no-store");
  check(
    "no CORS header is offered to a browser",
    ![...response.headers.keys()].some((name) =>
      name.toLowerCase().startsWith("access-control"),
    ),
  );
  check(
    "a correlation id is returned",
    /^[0-9a-f]{16}$/.test(response.headers.get("x-correlation-id") ?? ""),
  );
}

console.log("\nAuthentication");
{
  const missing = await request(CONTEXT);
  check(
    "a request with no token is refused",
    refused(missing.response.status),
    `got ${missing.response.status}`,
  );

  const wrong = await request(CONTEXT, {
    headers: { Authorization: `Bearer ${"z".repeat(43)}` },
  });
  check(
    "a wrong token is refused",
    refused(wrong.response.status),
    `got ${wrong.response.status}`,
  );

  const stripped = (body) => body.replace(/"correlationId":"[0-9a-f]+"/, "");
  check(
    "a wrong token and a missing token get the identical answer",
    stripped(missing.text) === stripped(wrong.text),
    "the difference is an oracle",
  );

  const query = await request(`${CONTEXT}?token=${encodeURIComponent(KEY || "x")}`);
  check("a token in the query string is not accepted", query.response.status !== 200);

  /*
   * 401 or 429 both count as refused. By this point the probe has already
   * failed authentication several times, so the auth-failure limiter may have
   * started answering 429 — which is the limiter working, not a hole. What
   * would be a finding is a 200.
   */
  for (const [label, header] of [
    ["Basic", "Basic abc"],
    ["an unknown scheme", "Token abc"],
    ["a bare token", KEY || "x"],
  ]) {
    const bad = await request(CONTEXT, { headers: { Authorization: header } });
    check(
      `${label} in Authorization is refused`,
      refused(bad.response.status),
      `got ${bad.response.status}`,
    );
  }

  check(
    "no response body mentions the word Authorization",
    !missing.text.toLowerCase().includes("authorization"),
  );

  // The health endpoint authenticates too — it is not an unauthenticated
  // probe, and must not become one.
  const health = await request(HEALTH);
  check(
    "the health endpoint is not open",
    refused(health.response.status),
    `got ${health.response.status}`,
  );
  check(
    "the health endpoint describes no deployment detail",
    !/vercel|node|next|region|mongo|version|hostname/i.test(health.text),
  );
}

console.log("\nRead-only");
{
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const { response } = await request(CONTEXT, {
      method,
      headers: authed(),
    });
    check(`${method} is refused`, response.status === 405 || response.status === 404);
  }

  const head = await request(CONTEXT, { method: "HEAD", headers: authed() });
  check(
    "HEAD is answered without a body",
    head.text === "" && [200, 401, 503].includes(head.response.status),
  );
}

console.log("\nInput validation");
{
  const cases = [
    ["an unknown parameter", `${CONTEXT}?children=clara`],
    ["an extra parameter", `${CONTEXT}?child=clara&limit=999`],
    ["a repeated parameter", `${CONTEXT}?child=clara&child=emily`],
    ["an oversized parameter", `${CONTEXT}?child=${"x".repeat(300)}`],
    ["an oversized URL", `${CONTEXT}?child=${"x".repeat(1200)}`],
  ];

  for (const [label, url] of cases) {
    const { response } = await request(url, { headers: authed() });
    check(
      `${label} is rejected`,
      response.status === 400 || refused(response.status),
      `got ${response.status}`,
    );
  }

  const unknownChild = await request(`${CONTEXT}?child=nobody`, { headers: authed() });
  check(
    "an unknown child gets a generic answer that names nobody",
    unknownChild.response.status === 404 || refused(unknownChild.response.status),
  );
  check(
    "the unknown-child response does not list who does exist",
    !/clara|emily|hannah|william|james/i.test(unknownChild.text),
  );
}

console.log("\nResponse");
if (!KEY) {
  console.log("  · skipping (set BIRCH_FAMILY_API_KEY to check an authenticated response)");
} else {
  const { response, text } = await request(`${CONTEXT}?child=clara`, {
    headers: authed(),
  });

  if (response.status !== 200) {
    check(`an authenticated request succeeds`, false, `got ${response.status}`);
  } else {
    const bytes = Buffer.byteLength(text, "utf8");
    check(`the response is under 64KB (${bytes} bytes)`, bytes <= 64 * 1024);
    check("it is JSON", (() => {
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    })());

    const body = JSON.parse(text);
    check("it labels itself as data", typeof body.securityNotice === "string");
    check("it carries a freshness stamp", Boolean(body.dataFreshness?.lastUpdatedAt));
    check("it computes an age rather than storing one", body.identifiedChild?.calculatedAge >= 0);
    check(
      "it leaks no credential, address or internal metadata",
      !/_id|objectid|password|mongodb|bearer|@[a-z0-9.-]+\.[a-z]{2,}/i.test(text),
    );

    const etag = response.headers.get("etag");
    if (etag) {
      const conditional = await request(`${CONTEXT}?child=clara`, {
        headers: { ...authed(), "If-None-Match": etag },
      });
      check("a conditional GET is answered 304", conditional.response.status === 304);
    }
  }
}

console.log("\nOpenAPI document");
{
  const path = resolve(HERE, "..", "docs", "family-api", "birch-family-action.openapi.yaml");
  const text = readFileSync(path, "utf8");

  check("it contains no long secret-shaped string", !/[A-Za-z0-9_-]{43,}/.test(text));
  check("it names no environment variable", !/BIRCH_FAMILY_API_KEY|MONGODB_URI/.test(text));
  check("it declares no mutation", !/\n {4}(post|put|patch|delete):/i.test(text));
  check("it serves over HTTPS", text.includes("url: https://"));
}

if (includeRateLimits) {
  console.log("\nRate limiting (this consumes real allowance)");

  let sawTooMany = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { response } = await request(CONTEXT, {
      headers: { Authorization: `Bearer ${"q".repeat(43)}` },
    });
    if (response.status === 429) {
      sawTooMany = true;
      check(
        "repeated invalid authentication is rate limited",
        Number(response.headers.get("retry-after")) > 0,
        "no Retry-After header",
      );
      break;
    }
  }
  if (!sawTooMany) {
    check("repeated invalid authentication is rate limited", false, "never saw a 429");
  }
} else {
  console.log("\nRate limiting");
  console.log("  · skipped. Re-run with --rate-limits to exercise it.");
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
process.exit(failed === 0 ? 0 : 1);
