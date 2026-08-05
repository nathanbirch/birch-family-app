/**
 * Turns the full-size pet cut-outs into small, content-addressed files.
 *
 *   npm run pets:generate
 *
 * Source: `assets/pets/<id>.png` — the originals, whatever size they are.
 * Output: `public/pets/<id>-<hash>.png` plus `src/config/pet-manifest.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The same three reasons as `optimise-avatars.mjs` — size, unguessable names
 * and immutable caching — so read that file for the full argument. What is
 * different here is the *framing*, and that is the whole point of a separate
 * script.
 *
 * 1. TRIM. Both masters are cut-outs with a wide margin of fully transparent
 *    pixels, and the margins are not the same on each. Left alone, Bella and
 *    Leia would be rendered at visibly different sizes in cards that are the
 *    same size. So every master is cropped to its own alpha bounding box
 *    before anything else happens, which throws away the arbitrary part.
 *
 * 2. ONE CANVAS. The trimmed animal is then scaled to fit — never to fill, so
 *    nothing is ever cropped off — and centred on a canvas that is identical
 *    for every pet. That is what makes the two cards the same shape, and it is
 *    also what makes the avatar coordinates in `src/config/pets.ts` mean
 *    something: they are percentages of this canvas, so a spot picked once
 *    against the generated file stays put.
 *
 * Re-run this and the geometry is reproduced exactly; the coordinates only
 * need revisiting if you replace a master with a differently-posed photo.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decodePng, encodePng, resampleRgba } from "./lib/png.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "assets", "pets");
const OUT_DIR = join(ROOT, "public", "pets");
const MANIFEST = join(ROOT, "src", "config", "pet-manifest.ts");

/**
 * The shared canvas, in pixels.
 *
 * 3:2 landscape, which suits an animal lying down far better than the 2:3
 * portrait the seating scenes use. 828 is one of Next's default device widths,
 * so `next/image` can serve this file as-is at 2x on a phone and at rather
 * more than 1x in the ~480px card on a desktop, without an intermediate
 * resize.
 */
const CANVAS_WIDTH = 828;
const CANVAS_HEIGHT = 552;

/**
 * Fraction of the canvas left clear around the animal.
 *
 * Without it a trimmed cut-out touches the edge of the card on one axis, which
 * reads as a cropping mistake rather than a photograph.
 */
const MARGIN = 0.04;

/** Alpha below this counts as "nothing here" when measuring the bounding box. */
const TRIM_ALPHA_THRESHOLD = 8;

/** Characters of the content hash in the filename. */
const HASH_LENGTH = 10;

function main() {
  let sources;
  try {
    sources = readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".png")).sort();
  } catch {
    console.error(
      `\nCould not read the pet masters at:\n  ${SOURCE_DIR}\n\n` +
        "Put one cut-out PNG per animal there, named after its id in\n" +
        "src/config/pets.ts (bella.png, leia.png), then re-run.\n",
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

  console.log(
    `\nOptimising ${sources.length} pets to ${CANVAS_WIDTH}x${CANVAS_HEIGHT}\n`,
  );

  const entries = [];
  let before = 0;
  let after = 0;

  for (const file of sources) {
    const id = file.replace(/\.png$/, "");
    const original = readFileSync(join(SOURCE_DIR, file));
    const decoded = decodePng(original);

    const bounds = alphaBounds(decoded);
    if (!bounds) {
      console.error(`\n  ! ${id}: the master is entirely transparent.\n`);
      process.exit(1);
    }

    const trimmed = crop(decoded, bounds);
    const canvas = fitOnCanvas(trimmed);
    // Alpha is kept: these are cut-outs, and the card's surface colour shows
    // through behind them.
    const png = encodePng(canvas, CANVAS_WIDTH, CANVAS_HEIGHT, { alpha: true });

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
      `  ${id.padEnd(7)} ${decoded.width}x${decoded.height} ` +
        `${String(Math.round(original.length / 1024)).padStart(4)}KB  ->  ` +
        `trimmed ${trimmed.width}x${trimmed.height}  ->  ` +
        `${String(Math.round(png.length / 1024)).padStart(3)}KB  ` +
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

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** The smallest rectangle containing every pixel that is not transparent. */
function alphaBounds({ pixels, width, height }) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= TRIM_ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function crop({ pixels, width }, bounds) {
  const out = Buffer.alloc(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    const from = ((bounds.y + y) * width + bounds.x) * 4;
    pixels.copy(out, y * bounds.width * 4, from, from + bounds.width * 4);
  }
  return { pixels: out, width: bounds.width, height: bounds.height };
}

/**
 * Scales the animal to fit inside the margins and centres it on the canvas.
 *
 * "Fit", not "fill": a family pet is not a background texture, and cropping a
 * tail or an ear off to fill a rectangle would be worse than a little empty
 * space. The empty space costs almost nothing — uniform transparent rows are
 * about as compressible as data gets.
 */
function fitOnCanvas({ pixels, width, height }) {
  const maxWidth = Math.round(CANVAS_WIDTH * (1 - MARGIN * 2));
  const maxHeight = Math.round(CANVAS_HEIGHT * (1 - MARGIN * 2));
  const scale = Math.min(maxWidth / width, maxHeight / height);

  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const scaled = resampleRgba(pixels, width, height, targetWidth, targetHeight);

  const canvas = Buffer.alloc(CANVAS_WIDTH * CANVAS_HEIGHT * 4);
  const offsetX = Math.round((CANVAS_WIDTH - targetWidth) / 2);
  const offsetY = Math.round((CANVAS_HEIGHT - targetHeight) / 2);

  for (let y = 0; y < targetHeight; y += 1) {
    const from = y * targetWidth * 4;
    const to = ((offsetY + y) * CANVAS_WIDTH + offsetX) * 4;
    scaled.copy(canvas, to, from, from + targetWidth * 4);
  }

  return canvas;
}

/* ------------------------------------------------------------------ */
/* Manifest                                                            */
/* ------------------------------------------------------------------ */

function writeManifest(entries) {
  const lines = entries.map((e) => `  ${e.id}: "/pets/${e.name}",`);

  writeFileSync(
    MANIFEST,
    `/**
 * Generated by \`npm run pets:generate\` — do not edit by hand.
 *
 * Maps each pet's id to its optimised photograph. The filenames carry a
 * content hash, so they change whenever the picture does and never otherwise.
 * That is what lets \`next.config.ts\` serve them \`immutable\` for a year and
 * the service worker treat them as cache-first.
 *
 * Every file is exactly \`PET_PHOTO_WIDTH\` x \`PET_PHOTO_HEIGHT\`, with the
 * animal trimmed and centred, which is what makes the avatar coordinates in
 * \`src/config/pets.ts\` reusable across both pets.
 *
 * Re-run the script after replacing anything in \`assets/pets/\`.
 */

export const PET_PHOTO_WIDTH = ${CANVAS_WIDTH};
export const PET_PHOTO_HEIGHT = ${CANVAS_HEIGHT};

export const PET_PHOTO_SOURCES = {
${lines.join("\n")}
} as const satisfies Record<string, \`/pets/\${string}\`>;

export type PetPhotoId = keyof typeof PET_PHOTO_SOURCES;
`,
  );
}

main();
