/**
 * Writes `docs/family-api/birch-family-action.openapi.yaml`.
 *
 *     npm run api:openapi
 *
 * The document is built from `src/lib/family-api/openapi.ts`, which reads the
 * same limits and the same roster the route handler does. Running this is not
 * optional after changing the response shape — `tests/family-api-openapi.test.ts`
 * fails if the committed file no longer matches, which is the point.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderOpenApiYaml } from "../src/lib/family-api/openapi";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(
  HERE,
  "..",
  "docs",
  "family-api",
  "birch-family-action.openapi.yaml",
);

/*
 * Wrapped in a function rather than written as top-level `await`: `tsx`
 * transpiles a `.ts` script to CommonJS here, and top-level await is a syntax
 * error in that format. `scripts/seed-database.ts` has the same shape for the
 * same reason.
 */
async function main(): Promise<void> {
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, renderOpenApiYaml(), "utf8");
  console.log(`Wrote ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
