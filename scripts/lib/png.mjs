/**
 * A very small PNG codec: decode, resample, encode.
 *
 * Shared by `generate-icons.mjs` and `optimise-avatars.mjs`. No image
 * libraries and no network — just Node's `zlib` — which keeps the asset
 * pipeline dependency-free and reproducible.
 *
 * Scope is deliberately narrow: 8-bit, non-interlaced PNGs. That covers
 * everything this project ships, and anything else throws a clear error
 * rather than producing subtly wrong output.
 */

import { deflateSync, inflateSync } from "node:zlib";

/* ------------------------------- Decoding ------------------------------- */

/** → `{ width, height, pixels }` where `pixels` is RGBA, 4 bytes each. */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG file.");

  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  let palette = null;
  let transparency = null;
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
      channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[data[9]];
      if (!channels) throw new Error(`Unsupported colour type ${data[9]}.`);
      if (data[9] === 3) palette = { indexed: true };
    } else if (type === "PLTE") {
      palette = { indexed: true, table: Buffer.from(data) };
    } else if (type === "tRNS") {
      transparency = Buffer.from(data);
    } else if (type === "IDAT") {
      chunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const flat = Buffer.alloc(height * stride);
  let read = 0;

  // Undo the per-scanline filters. PNG spec, section 9.
  for (let y = 0; y < height; y += 1) {
    const filter = raw[read];
    read += 1;
    const line = raw.subarray(read, read + stride);
    read += stride;

    const current = flat.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? flat.subarray((y - 1) * stride, y * stride) : null;

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

  // Normalise every colour type to straight RGBA, so callers need one path.
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const at = i * channels;
    let r;
    let g;
    let b;
    let a = 255;

    if (palette?.table) {
      const index = flat[at];
      r = palette.table[index * 3];
      g = palette.table[index * 3 + 1];
      b = palette.table[index * 3 + 2];
      if (transparency && index < transparency.length) a = transparency[index];
    } else if (channels >= 3) {
      r = flat[at];
      g = flat[at + 1];
      b = flat[at + 2];
      if (channels === 4) a = flat[at + 3];
    } else {
      r = flat[at];
      g = flat[at];
      b = flat[at];
      if (channels === 2) a = flat[at + 1];
    }

    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = a;
  }

  return { width, height, pixels };
}

/* ------------------------------ Resampling ------------------------------ */

/**
 * Area-average downscale of an RGBA buffer.
 *
 * Alpha is **premultiplied** before averaging and divided out afterwards.
 * Without that, fully transparent pixels contribute their (arbitrary) colour
 * to the average and cut-out portraits get a dark or light halo around the
 * edge — very visible on these avatars, which are cut out against transparency.
 */
export function resampleRgba(source, width, height, targetWidth, targetHeight) {
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  const scaleX = width / targetWidth;
  const scaleY = height / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * scaleY));

    for (let x = 0; x < targetWidth; x += 1) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * scaleX));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;

      for (let sy = y0; sy < Math.min(y1, height); sy += 1) {
        for (let sx = x0; sx < Math.min(x1, width); sx += 1) {
          const at = (sy * width + sx) * 4;
          const alpha = source[at + 3] / 255;
          r += source[at] * alpha;
          g += source[at + 1] * alpha;
          b += source[at + 2] * alpha;
          a += alpha;
          n += 1;
        }
      }

      const at = (y * targetWidth + x) * 4;
      if (a > 0) {
        out[at] = Math.round(r / a);
        out[at + 1] = Math.round(g / a);
        out[at + 2] = Math.round(b / a);
        out[at + 3] = Math.round((a / n) * 255);
      }
    }
  }

  return out;
}

/* ------------------------------- Encoding ------------------------------- */

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

/**
 * Encodes RGBA pixels as a PNG.
 *
 * `alpha: false` drops the alpha channel (colour type 2), which is right for
 * the icons — they are opaque squares, and the channel would be three wasted
 * bytes per pixel.
 *
 * Scanlines use **adaptive filtering**: all five PNG filters are tried and the
 * one with the smallest sum of absolute differences is kept. That heuristic is
 * what the spec recommends, and on photographs it is the difference between a
 * file that compresses and one that does not — roughly 3x smaller here than
 * always using filter 0.
 */
export function encodePng(rgba, width, height, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3;
  const stride = width * channels;

  // Strip alpha up front if it is not wanted, so filtering sees final bytes.
  const source = Buffer.alloc(height * stride);
  for (let i = 0; i < width * height; i += 1) {
    source[i * channels] = rgba[i * 4];
    source[i * channels + 1] = rgba[i * 4 + 1];
    source[i * channels + 2] = rgba[i * 4 + 2];
    if (alpha) source[i * channels + 3] = rgba[i * 4 + 3];
  }

  const raw = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const line = source.subarray(y * stride, (y + 1) * stride);
    const previous =
      y > 0 ? source.subarray((y - 1) * stride, y * stride) : null;

    let bestFilter = 0;
    let bestScore = Infinity;
    let best = null;

    for (let filter = 0; filter <= 4; filter += 1) {
      let score = 0;
      for (let i = 0; i < stride; i += 1) {
        const left = i >= channels ? line[i - channels] : 0;
        const up = previous ? previous[i] : 0;
        const upLeft = previous && i >= channels ? previous[i - channels] : 0;
        let value;

        if (filter === 0) value = line[i];
        else if (filter === 1) value = line[i] - left;
        else if (filter === 2) value = line[i] - up;
        else if (filter === 3) value = line[i] - ((left + up) >> 1);
        else {
          const estimate = left + up - upLeft;
          const dl = Math.abs(estimate - left);
          const du = Math.abs(estimate - up);
          const dul = Math.abs(estimate - upLeft);
          const predictor = dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
          value = line[i] - predictor;
        }

        candidate[i] = value & 0xff;
        // Treat bytes as signed when scoring: small deltas either side of zero
        // are what actually compresses well.
        score += Math.abs(((value & 0xff) << 24) >> 24);
      }

      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        best = Buffer.from(candidate);
      }
    }

    raw[y * (stride + 1)] = bestFilter;
    best.copy(raw, y * (stride + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = alpha ? 6 : 2; // RGBA or RGB
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
