/**
 * @vitest-environment node
 *
 * Enforces the one rule about `"use server"` modules that Next.js will not
 * tell you about until a user clicks the button.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS TO PREVENT
 * ---------------------------------------------------------------------------
 * A module marked `"use server"` may export async functions and nothing else.
 * Every export becomes a callable server endpoint, so a plain constant has no
 * meaning and Next.js rejects the module:
 *
 *     A "use server" file can only export async functions, found object.
 *
 * The failure is total, not partial. `actions.ts` once exported a two-line
 * constant alongside `login()`, and the result was that *every* sign-in
 * attempt — right credentials, wrong credentials, empty form — threw and hit
 * the error boundary. Sign-in was completely broken.
 *
 * Three things all failed to catch it, which is why this file exists:
 *
 *   - `tsc` is happy; the rule is a Next.js convention, not a type error.
 *   - `next build` passed, because /login prerenders fine and the action
 *     module is only evaluated when someone actually submits the form.
 *   - The unit tests passed, because Vitest imports the module directly and
 *     never applies the `"use server"` transform.
 *
 * So this test reads the source and checks the rule textually. Crude, but it
 * is the layer where the mistake is actually visible.
 */

const SRC = new URL("../src", import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

/** Every file whose first statement is the `"use server"` directive. */
function collectServerActionModules(): { path: string; source: string }[] {
  return walk(SRC)
    .map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter(({ source }) => /^\s*["']use server["'];/.test(source));
}

const MODULES = collectServerActionModules();

describe('"use server" modules', () => {
  it("finds the sign-in actions, so this test is actually guarding something", () => {
    // If the file is renamed and this breaks, point it at the new location
    // rather than deleting the check.
    expect(MODULES.map((m) => m.path.replace(SRC, "src"))).toContain(
      "src/lib/auth/actions.ts",
    );
  });

  it.each(MODULES.map((m) => [m.path.replace(SRC, "src"), m.source]))(
    "%s exports only async functions",
    (path, source) => {
      /*
       * Value exports that are not `async function`. Type-only exports are
       * erased before Next applies the rule, so `export type` and
       * `export type { … }` are both fine.
       */
      const offenders: string[] = [];

      for (const match of source.matchAll(/^export\s+(.+)$/gm)) {
        const rest = match[1];
        if (rest.startsWith("type ")) continue;
        if (/^\{[^}]*\}\s*from/.test(rest) && /^\{\s*type\s/.test(rest)) continue;
        if (rest.startsWith("async function ")) continue;
        offenders.push(rest.slice(0, 60));
      }

      expect(
        offenders,
        `${path} may only export async functions — ` +
          `a non-function export breaks the whole module at runtime, ` +
          `not just that export. Move it to a plain module.`,
      ).toEqual([]);
    },
  );
});
