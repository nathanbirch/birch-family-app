/**
 * Turns the full-size school document photographs into small,
 * content-addressed files.
 *
 *   npm run documents:generate
 *
 * Source: `assets/documents/<id>.jpg` — the originals, whatever size they are.
 * Output: `public/documents/<id>-<hash>.jpg` (full view) and
 * `public/documents/<id>-<hash>-thumb.jpg` (card thumbnail), plus
 * `src/config/document-manifest.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS ONE SHELLS OUT
 * ---------------------------------------------------------------------------
 * Every other optimiser in this folder (`optimise-avatars.mjs`,
 * `optimise-pets.mjs`, `generate-icons.mjs`) decodes and re-encodes PNG by
 * hand with Node's zlib, on purpose: no image library, no network. That works
 * because those masters are all PNG, a format simple enough to hand-roll.
 *
 * These masters are photographs of printed pages, saved as JPEG — a format
 * with no realistic hand-rolled decoder, and one where the whole point is a
 * lossy re-encode a from-scratch codec would take months to get right. Rather
 * than add a JPEG library dependency, this script shells out to `sips`, the
 * image tool that ships with macOS, which is also where every photo in
 * `assets/documents/` was dropped in from. It is the one script in this folder
 * that will not run on Linux or in CI — it only ever needs to run on a
 * developer's Mac after adding or replacing a document photo, the same way
 * the avatar and pet masters are only ever replaced by hand.
 *
 * The three reasons for content-hashed, generated output are otherwise
 * identical to the avatar script: SIZE (a 5712x4284, 11MB phone photo has no
 * business being fetched to render inside a card), UNGUESSABLE NAMES (see
 * docs/authentication.md), and CACHING (an immutable, year-long cache in
 * `next.config.ts`).
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "assets", "documents");
const OUT_DIR = join(ROOT, "public", "documents");
const MANIFEST = join(ROOT, "src", "config", "document-manifest.ts");

/**
 * Long-edge size of the full view, in pixels.
 *
 * Big enough to pan and zoom into printed 10-11pt text without it turning to
 * mush, small enough that a phone on a slow connection still opens it
 * instantly. 1600 is comfortably past what a phone screen shows at 1x even
 * zoomed in a little, without shipping the 4000px+ a modern phone camera
 * actually captures.
 */
const FULL_MAX_DIMENSION = 1600;
const FULL_JPEG_QUALITY = 82;

/** Width of the card thumbnail. Never viewed larger than a few hundred px. */
const THUMB_WIDTH = 360;
const THUMB_JPEG_QUALITY = 60;

/** Characters of the content hash in the filename. */
const HASH_LENGTH = 10;

function main() {
  assertSipsAvailable();

  let sources;
  try {
    sources = readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".jpg")).sort();
  } catch {
    console.error(
      `\nCould not read the document masters at:\n  ${SOURCE_DIR}\n\n` +
        "Put one JPEG per document there, named with its id from\n" +
        "src/config/documents.ts, then re-run.\n",
    );
    process.exit(1);
  }

  if (!sources.length) {
    console.error(`\nNo JPEGs found in ${SOURCE_DIR}.\n`);
    process.exit(1);
  }

  // Rebuilt from scratch, so renaming or removing a master cannot leave an
  // orphaned file being served from a URL nothing references any more.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const work = mkdtempSync(join(tmpdir(), "birch-documents-"));

  console.log(`\nOptimising ${sources.length} document photo(s)\n`);

  const entries = [];
  let before = 0;
  let after = 0;

  try {
    for (const file of sources) {
      const id = file.replace(/\.jpg$/, "");
      const source = join(SOURCE_DIR, file);
      const original = readFileSync(source);

      const full = resize(source, work, `${id}-full.jpg`, {
        longEdge: FULL_MAX_DIMENSION,
        quality: FULL_JPEG_QUALITY,
      });
      const thumb = resize(source, work, `${id}-thumb.jpg`, {
        width: THUMB_WIDTH,
        quality: THUMB_JPEG_QUALITY,
      });

      const fullEntry = writeHashed(full);
      const thumbEntry = writeHashed(thumb);

      entries.push({ id, full: fullEntry, thumb: thumbEntry });

      before += original.length;
      after += fullEntry.bytes + thumbEntry.bytes;

      console.log(
        `  ${id.padEnd(24)} ${String(Math.round(original.length / 1024)).padStart(5)}KB  ->  ` +
          `${fullEntry.width}x${fullEntry.height} ${String(Math.round(fullEntry.bytes / 1024)).padStart(3)}KB full, ` +
          `${thumbEntry.width}x${thumbEntry.height} ${String(Math.round(thumbEntry.bytes / 1024)).padStart(2)}KB thumb`,
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  writeManifest(entries);

  console.log(
    `\n  total ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB ` +
      `(-${Math.round((1 - after / before) * 100)}%)`,
  );
  console.log(`  wrote ${MANIFEST.replace(ROOT + "/", "")}\n`);
}

function assertSipsAvailable() {
  try {
    execFileSync("sips", ["--version"], { stdio: "ignore" });
  } catch {
    console.error(
      "\nThis script needs `sips`, which ships with macOS. Run it from a Mac.\n",
    );
    process.exit(1);
  }
}

/**
 * Resizes `source` into `dir/name` with `sips`, and reports the result.
 *
 * `-Z` caps the *longer* edge and preserves aspect ratio, which is what
 * `longEdge` uses; a plain `--resampleWidth` scales to an exact width instead,
 * which is what the thumbnail wants so every card lines up on the same grid.
 */
function resize(source, dir, name, { longEdge, width, quality }) {
  const out = join(dir, name);
  const args = ["-s", "format", "jpeg", "-s", "formatOptions", String(quality)];
  if (longEdge) args.push("-Z", String(longEdge));
  if (width) args.push("--resampleWidth", String(width));
  execFileSync("sips", [source, ...args, "--out", out], { stdio: "ignore" });
  return out;
}

function writeHashed(tempFile) {
  const bytes = readFileSync(tempFile);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, HASH_LENGTH);
  const [, width, height] = execFileSync("sips", [
    "-g",
    "pixelWidth",
    "-g",
    "pixelHeight",
    tempFile,
  ])
    .toString()
    .match(/pixelWidth: (\d+)[\s\S]*pixelHeight: (\d+)/)
    .map(Number);

  const name = tempFile
    .split("/")
    .pop()
    .replace(/-full\.jpg$/, `-${hash}.jpg`)
    .replace(/-thumb\.jpg$/, `-${hash}-thumb.jpg`);
  writeFileSync(join(OUT_DIR, name), bytes);

  return { file: name, width, height, bytes: bytes.length };
}

function writeManifest(entries) {
  const lines = entries.map(
    (e) =>
      `  "${e.id}": {\n` +
      `    full: { src: "/documents/${e.full.file}", width: ${e.full.width}, height: ${e.full.height} },\n` +
      `    thumb: { src: "/documents/${e.thumb.file}", width: ${e.thumb.width}, height: ${e.thumb.height} },\n` +
      `  },`,
  );

  writeFileSync(
    MANIFEST,
    `/**
 * Generated by \`npm run documents:generate\` — do not edit by hand.
 *
 * Maps each document's id to its optimised full view and thumbnail. The
 * filenames carry a content hash, so they change whenever the photo does and
 * never otherwise. That is what lets \`next.config.ts\` serve them
 * \`immutable\` for a year and the service worker treat them as cache-first.
 *
 * Re-run the script after replacing anything in \`assets/documents/\`.
 */

export type DocumentImage = {
  src: \`/documents/\${string}\`;
  width: number;
  height: number;
};

export const DOCUMENT_SOURCES = {
${lines.join("\n")}
} as const satisfies Record<string, { full: DocumentImage; thumb: DocumentImage }>;

export type DocumentImageId = keyof typeof DOCUMENT_SOURCES;
`,
  );
}

main();
