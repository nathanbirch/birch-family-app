/**
 * Generates every app icon from one master image.
 *
 *   npm run icons:generate
 *
 * Source: `assets/icon-master.png` — the birch-tree mark.
 * Output: `public/icons/*.png` and `public/favicon.ico`.
 *
 * No image libraries and no network, matching the rest of this project's
 * tooling: the PNG is decoded with Node's zlib, resampled by area averaging,
 * and re-encoded by hand.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DOES MORE THAN RESIZE
 * ---------------------------------------------------------------------------
 * Two properties of the master would produce broken icons if it were simply
 * scaled down.
 *
 * 1. Its background is rgb(1, 98, 166) — *nearly* the brand blue #0369a1, but
 *    not it. The difference is invisible in isolation and obvious where the
 *    icon meets app chrome tinted with the real brand colour: the PWA splash
 *    screen and the installed app's title bar. So every pixel is reduced to
 *    "how much mark is here", then recomposited over the exact brand colour.
 *    The artwork is two-tone, so nothing is lost doing this.
 *
 * 2. Its artwork reaches 90% of the way to the edge. Android crops maskable
 *    icons to a circle covering the central 80%, which would slice the outer
 *    leaves off. The maskable variant is therefore scaled to fit that safe
 *    circle, while the ordinary icons keep the master's original framing.
 *
 * Placement is measured from the artwork rather than hardcoded, so swapping in
 * a differently-framed master still produces correct icons — including
 * re-centring one whose mark sits slightly off-centre, as this one does.
 */

import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "assets", "icon-master.png");
const ICON_DIR = join(ROOT, "public", "icons");
const PUBLIC_DIR = join(ROOT, "public");

/** Ocean primary — matches `DEFAULT_THEME_ID` in src/config/themes.ts. */
const BRAND = [3, 105, 161];
const MARK = [255, 255, 255];

/**
 * How far the artwork reaches from the icon's centre, as a fraction of the
 * icon's width.
 *
 * `0.45` reproduces the master's own framing. `0.40` is the maskable safe
 * zone — Android may crop to a circle of that radius, and anything outside it
 * is not guaranteed to survive.
 */
const FRAMING = 0.45;
const MASKABLE_SAFE = 0.4;

const ICONS = [
  { file: "icon-192.png", size: 192, radius: FRAMING },
  { file: "icon-512.png", size: 512, radius: FRAMING },
  { file: "icon-maskable-512.png", size: 512, radius: MASKABLE_SAFE },
  // iOS applies its own rounded mask, so this must stay square and opaque.
  // A pre-rounded or transparent apple-touch-icon renders with black corners.
  { file: "apple-touch-icon.png", size: 180, radius: FRAMING },
  { file: "favicon-32.png", size: 32, radius: FRAMING },
];

/** Sizes packed into favicon.ico, for contexts that still request one. */
const ICO_SIZES = [16, 32, 48];

/* ---------------------------- PNG decoding ---------------------------- */

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG file.");

  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const chunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) {
        throw new Error(`Only 8-bit PNGs are supported (got ${data[8]}-bit).`);
      }
      if (data[12] !== 0) throw new Error("Interlaced PNGs are not supported.");
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[data[9]];
      if (!channels) throw new Error(`Unsupported colour type ${data[9]}.`);
    } else if (type === "IDAT") {
      chunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let read = 0;

  // Undo the per-scanline filters. PNG spec, section 9.
  for (let y = 0; y < height; y += 1) {
    const filter = raw[read];
    read += 1;
    const line = raw.subarray(read, read + stride);
    read += stride;

    const current = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? current[i - channels] : 0;
      const up = previous ? previous[i] : 0;
      const upLeft = previous && i >= channels ? previous[i - channels] : 0;
      let value = line[i];

      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const dl = Math.abs(estimate - left);
        const du = Math.abs(estimate - up);
        const dul = Math.abs(estimate - upLeft);
        value += dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
      }

      current[i] = value & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

/* ---------------------------- Coverage map ---------------------------- */

function readPixel(pixels, channels, index) {
  const at = index * channels;
  if (channels >= 3) return [pixels[at], pixels[at + 1], pixels[at + 2]];
  return [pixels[at], pixels[at], pixels[at]];
}

/**
 * Reduces the master to one "how much mark is here" value per pixel, from
 * 0 (background) to 1 (solid mark).
 *
 * Projecting each colour onto the background-to-mark axis preserves the
 * anti-aliased edges as fractional coverage, which is what lets the icons be
 * recomposited over a different background colour without haloing.
 */
function toCoverage({ width, height, channels, pixels }) {
  const background = readPixel(pixels, channels, 0);
  const axis = [
    MARK[0] - background[0],
    MARK[1] - background[1],
    MARK[2] - background[2],
  ];
  const lengthSquared = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;

  const coverage = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const [r, g, b] = readPixel(pixels, channels, i);
    const dot =
      (r - background[0]) * axis[0] +
      (g - background[1]) * axis[1] +
      (b - background[2]) * axis[2];
    coverage[i] = Math.min(1, Math.max(0, dot / lengthSquared));
  }

  return { width, height, coverage, background };
}

/**
 * Where the artwork sits: the centre of its bounding box, and how far the ink
 * reaches from that centre.
 *
 * The radius is the number that matters, because a maskable crop is a circle —
 * it cares about distance from the centre, not about a bounding box.
 */
function measureArtwork({ width, height, coverage }) {
  const INK = 0.5;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (coverage[y * width + x] < INK) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error("The master image appears to be blank.");

  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  let radius = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (coverage[y * width + x] < INK) continue;
      const distance = Math.hypot(x - centreX, y - centreY);
      if (distance > radius) radius = distance;
    }
  }

  return { centreX, centreY, radius };
}

/* ------------------------------ Rendering ----------------------------- */

/**
 * Draws the artwork into a `size` x `size` icon, re-centred, with its ink
 * reaching `radiusFraction` of the icon's width from the centre.
 *
 * Sampling averages every source pixel falling inside each destination pixel.
 * At these reduction ratios — 1254 down to as little as 16 — anything cheaper
 * than area averaging visibly aliases the thin leaf veins.
 */
function render(source, size, radiusFraction) {
  const { width, height, coverage } = source;
  const { centreX, centreY, radius } = source.artwork;

  const scale = (radiusFraction * size) / radius;
  const half = size / 2;
  const out = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // The source rectangle this destination pixel covers.
      const sx0 = centreX + (x - half) / scale;
      const sx1 = centreX + (x + 1 - half) / scale;
      const sy0 = centreY + (y - half) / scale;
      const sy1 = centreY + (y + 1 - half) / scale;

      let total = 0;
      let samples = 0;
      const startX = Math.max(0, Math.floor(sx0));
      const endX = Math.min(width - 1, Math.ceil(sx1) - 1);
      const startY = Math.max(0, Math.floor(sy0));
      const endY = Math.min(height - 1, Math.ceil(sy1) - 1);

      for (let sy = startY; sy <= endY; sy += 1) {
        for (let sx = startX; sx <= endX; sx += 1) {
          total += coverage[sy * width + sx];
          samples += 1;
        }
      }

      // Sampling entirely outside the master: plain background.
      const alpha = samples > 0 ? total / samples : 0;
      const at = (y * size + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        out[at + c] = Math.round(BRAND[c] + (MARK[c] - BRAND[c]) * alpha);
      }
    }
  }

  return out;
}

/* ---------------------------- PNG encoding ---------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
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

function encodePng(rgb, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour, no alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------------------- ICO encoding ---------------------------- */

/**
 * An .ico is a small directory of images. Since Windows Vista an entry may be
 * a PNG verbatim rather than the older BMP form, so each one is simply a PNG
 * we have already generated.
 */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;

  entries.forEach((entry, index) => {
    const at = index * 16;
    // 256 is encoded as 0. Nothing here is that large, but be correct.
    directory[at] = entry.size >= 256 ? 0 : entry.size;
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[at + 2] = 0; // palette entries
    directory[at + 3] = 0; // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(entry.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((e) => e.png)]);
}

/* --------------------------------- Run -------------------------------- */

function main() {
  let file;
  try {
    file = readFileSync(SOURCE);
  } catch {
    console.error(
      `\nCould not read the master icon at:\n  ${SOURCE}\n\n` +
        "Put a square master PNG there and re-run.\n" +
        "See docs/pwa-and-offline.md for what it should look like.\n",
    );
    process.exit(1);
  }

  const decoded = decodePng(file);
  const source = toCoverage(decoded);
  source.artwork = measureArtwork(source);

  const { width, height } = decoded;
  const { radius, centreX, centreY } = source.artwork;
  const reach = (radius / (width / 2)) * 100;

  console.log(`Master: ${width}x${height}`);
  console.log(
    `  background      rgb(${source.background.join(", ")}) ` +
      `-> normalised to rgb(${BRAND.join(", ")})`,
  );
  console.log(
    `  artwork centre  ${centreX.toFixed(1)}, ${centreY.toFixed(1)} ` +
      `(canvas centre ${(width / 2).toFixed(1)}, ${(height / 2).toFixed(1)}) - re-centred`,
  );
  console.log(`  artwork reach   ${reach.toFixed(1)}% of half-width`);
  if (reach > MASKABLE_SAFE * 200) {
    console.log(
      `                  exceeds the ${MASKABLE_SAFE * 200}% maskable safe zone, ` +
        "so the maskable icon is inset",
    );
  }
  console.log("");

  mkdirSync(ICON_DIR, { recursive: true });

  const rendered = new Map();
  for (const icon of ICONS) {
    const png = encodePng(render(source, icon.size, icon.radius), icon.size);
    writeFileSync(join(ICON_DIR, icon.file), png);
    if (icon.radius === FRAMING) rendered.set(icon.size, png);

    const note = icon.radius === MASKABLE_SAFE ? "   <- inset for masking" : "";
    console.log(
      `  ${icon.file.padEnd(24)} ${String(icon.size).padStart(3)}px  ` +
        `${String(png.length).padStart(6)} bytes${note}`,
    );
  }

  const ico = encodeIco(
    ICO_SIZES.map((size) => ({
      size,
      png: rendered.get(size) ?? encodePng(render(source, size, FRAMING), size),
    })),
  );
  writeFileSync(join(PUBLIC_DIR, "favicon.ico"), ico);
  console.log(
    `  ${"../favicon.ico".padEnd(24)} ${ICO_SIZES.join("/")}px  ` +
      `${String(ico.length).padStart(6)} bytes`,
  );

  console.log("\nDone.");
}

main();
