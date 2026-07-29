/**
 * Generates the PWA icon PNGs locally.
 *
 *   npm run icons:generate
 *
 * No image libraries and no network: the icon is drawn with plain maths into
 * an RGBA buffer and encoded as a PNG using Node's built-in zlib. Re-run this
 * after changing the mark or the brand colour below.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

/** Ocean primary — matches `DEFAULT_THEME_ID` in src/config/themes.ts. */
const BRAND = [3, 105, 161];
const WHITE = [255, 255, 255];

/** Supersampling factor for smooth edges. */
const SS = 3;

const ICONS = [
  { file: "icon-192.png", size: 192, padding: 0, rounded: true },
  { file: "icon-512.png", size: 512, padding: 0, rounded: true },
  // Maskable icons keep the mark inside the safe zone so launchers may crop.
  { file: "icon-maskable-512.png", size: 512, padding: 0.1, rounded: false },
  { file: "apple-touch-icon.png", size: 180, padding: 0, rounded: false },
  { file: "favicon-32.png", size: 32, padding: 0, rounded: true },
];


/**
 * Colour of a single sample point, in a 0..1 unit square.
 * Returns `null` outside the icon shape (transparent).
 */
function sample(u, v, rounded, padding) {
  // Rounded-square background.
  const r = 0.22;
  if (rounded) {
    const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
    const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
    if (Math.hypot(dx, dy) > r) return null;
  }

  let color = BRAND;

  // The mark: a plate with a steering-wheel wink, matching <AppMark />.
  const scale = 1 - padding * 2;
  const x = (u - 0.5) / scale;
  const y = (v - 0.5) / scale;
  const dist = Math.hypot(x, y);

  if (dist < 0.33) color = WHITE;
  // Wheel rim.
  if (dist > 0.185 && dist < 0.235) color = BRAND;
  // Hub.
  if (dist < 0.062) color = BRAND;
  // Spokes: two horizontal, one down.
  const spoke = 0.026;
  if (Math.abs(y) < spoke && Math.abs(x) > 0.05 && Math.abs(x) < 0.215) color = BRAND;
  if (Math.abs(x) < spoke && y > 0.05 && y < 0.215) color = BRAND;

  return color;
}

function renderIcon({ size, rounded, padding }) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const u = (px + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;
          const color = sample(u, v, rounded, padding);
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          hits += 1;
        }
      }

      const total = SS * SS;
      const offset = (py * size + px) * 4;
      if (hits === 0) continue;

      // Average of the covered samples; coverage becomes the alpha, which
      // anti-aliases the rounded corners.
      pixels[offset] = Math.round(r / hits);
      pixels[offset + 1] = Math.round(g / hits);
      pixels[offset + 2] = Math.round(b / hits);
      pixels[offset + 3] = Math.round((hits / total) * 255);
    }
  }

  return pixels;
}

/* ---------------------------- PNG encoding ---------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* -------------------------------- Run -------------------------------- */

mkdirSync(OUT_DIR, { recursive: true });

for (const icon of ICONS) {
  const pixels = renderIcon(icon);
  writeFileSync(join(OUT_DIR, icon.file), encodePng(pixels, icon.size));
  console.log(`wrote public/icons/${icon.file} (${icon.size}x${icon.size})`);
}
