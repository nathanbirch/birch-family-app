/**
 * Turns the full-size avatar photographs into small, content-addressed files.
 *
 *   npm run avatars:generate
 *
 * Source: `assets/avatars/<id>.png` — the originals, whatever size they are.
 * Output: `public/avatars/<id>-<hash>.png` plus `src/config/avatar-manifest.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * 1. SIZE. The originals are 470-758px and 250-730KB each, 3.4MB in total, to
 *    render a circle that is never wider than about 140 CSS pixels. They were
 *    committed at full size and re-downloaded by every clone. Resizing to
 *    384px — enough for a 3x phone and a 2x desktop — removes almost all of
 *    that with no visible difference.
 *
 * 2. UNGUESSABLE NAMES. `/avatars/hannah.png` is trivially guessable once you
 *    know the domain and a first name, and nothing in `public/` sits behind
 *    the login: `next/image` optimises by fetching the URL server-side without
 *    the user's cookie, so gating those paths breaks every avatar. Hashing the
 *    filename means knowing the domain is no longer enough. Combined with the
 *    `noindex` header in `next.config.ts`, that closes the realistic exposure.
 *
 *    This is obscurity, not a security boundary, and is documented as such in
 *    docs/authentication.md. Anyone who can sign in can see these photographs
 *    anyway — there is one shared account.
 *
 * 3. CACHING. A content hash in the name means the URL changes whenever the
 *    picture changes, and never otherwise. That is what makes it safe to serve
 *    them `immutable` for a year, and safe for the service worker to treat
 *    them as cache-first. See docs/pwa-and-offline.md.
 *
 * The manifest is generated rather than hand-maintained so the hashes cannot
 * drift out of step with the files.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decodePng, encodePng, resampleRgba } from "./lib/png.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "assets", "avatars");
const OUT_DIR = join(ROOT, "public", "avatars");
const MANIFEST = join(ROOT, "src", "config", "avatar-manifest.ts");

/**
 * Stored width and height, in pixels.
 *
 * The avatar is at most ~140 CSS px (desktop) and ~90 (phone). 384 covers a
 * 3x phone and a 2x desktop with room to spare, and is one of Next's default
 * image widths, so `next/image` can serve it without an intermediate resize.
 */
const SIZE = 384;

/** Characters of the content hash in the filename. */
const HASH_LENGTH = 10;

function main() {
  let sources;
  try {
    sources = readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".png")).sort();
  } catch {
    console.error(
      `\nCould not read the avatar masters at:\n  ${SOURCE_DIR}\n\n` +
        "Put one square PNG per person there, named after their id in\n" +
        "src/config/family.ts (nathan.png, sarah.png, …), then re-run.\n",
    );
    process.exit(1);
  }

  if (!sources.length) {
    console.error(`\nNo PNGs found in ${SOURCE_DIR}.\n`);
    process.exit(1);
  }

  // Rebuilt from scratch, so renaming or removing a master cannot leave an
  // orphaned file being served from a URL nothing references any more.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\nOptimising ${sources.length} avatars to ${SIZE}x${SIZE}\n`);

  const entries = [];
  let before = 0;
  let after = 0;

  for (const file of sources) {
    const id = file.replace(/\.png$/, "");
    const original = readFileSync(join(SOURCE_DIR, file));
    const decoded = decodePng(original);

    if (decoded.width !== decoded.height) {
      console.warn(
        `  ! ${id}: master is ${decoded.width}x${decoded.height}, not square. ` +
          "It will be squashed — crop it to a square first.",
      );
    }

    const resized = resampleRgba(
      decoded.pixels,
      decoded.width,
      decoded.height,
      SIZE,
      SIZE,
    );
    // Alpha is kept: these are cut-out portraits, and the seat's colour shows
    // through behind them.
    const png = encodePng(resized, SIZE, SIZE, { alpha: true });

    const hash = createHash("sha256")
      .update(png)
      .digest("hex")
      .slice(0, HASH_LENGTH);
    const name = `${id}-${hash}.png`;
    writeFileSync(join(OUT_DIR, name), png);

    entries.push({ id, name });
    before += original.length;
    after += png.length;

    const saved = Math.round((1 - png.length / original.length) * 100);
    console.log(
      `  ${id.padEnd(9)} ${String(decoded.width).padStart(3)}px ` +
        `${String(Math.round(original.length / 1024)).padStart(4)}KB  ->  ` +
        `${SIZE}px ${String(Math.round(png.length / 1024)).padStart(3)}KB  ` +
        `(-${saved}%)  ${name}`,
    );
  }

  writeManifest(entries);

  console.log(
    `\n  total ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB ` +
      `(-${Math.round((1 - after / before) * 100)}%)`,
  );
  console.log(`  wrote ${MANIFEST.replace(ROOT + "/", "")}\n`);
}

function writeManifest(entries) {
  const lines = entries.map((e) => `  ${e.id}: "/avatars/${e.name}",`);

  writeFileSync(
    MANIFEST,
    `/**
 * Generated by \`npm run avatars:generate\` — do not edit by hand.
 *
 * Maps each person's id to their optimised avatar. The filenames carry a
 * content hash, so they change whenever the picture does and never otherwise.
 * That is what lets \`next.config.ts\` serve them \`immutable\` for a year and
 * the service worker treat them as cache-first.
 *
 * Re-run the script after replacing anything in \`assets/avatars/\`.
 */

export const AVATAR_SOURCES = {
${lines.join("\n")}
} as const satisfies Record<string, \`/avatars/\${string}\`>;

export type AvatarId = keyof typeof AVATAR_SOURCES;
`,
  );
}

main();
