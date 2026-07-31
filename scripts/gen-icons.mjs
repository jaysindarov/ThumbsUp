/**
 * Generate the extension icons.
 *
 * Node has no canvas, and pulling in a rasteriser for four small PNGs is not
 * worth the dependency, so the mark is described as signed-distance fields and
 * rendered here with 3× supersampling. Deterministic, dependency-free, and the
 * source of truth for the artwork is this file rather than a binary blob.
 */

import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = resolve(projectRoot, 'public/icons');
const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 3;

/* ------------------------------ geometry ------------------------------ */
/* All shapes are in a 0..1 unit square; SDFs return distance in unit space. */

const sdRoundedRect = (px, py, cx, cy, hw, hh, r) => {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

const sdCapsule = (px, py, ax, ay, bx, by, r) => {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
};

/** Coverage of a shape at (x, y): 1 inside, 0 outside, soft at the edge. */
const coverage = (distance, softness) =>
  Math.min(1, Math.max(0, 0.5 - distance / softness));

function shade(x, y, softness) {
  // Rounded-square background with a diagonal gradient.
  const bg = coverage(sdRoundedRect(x, y, 0.5, 0.5, 0.5, 0.5, 0.24), softness);
  const t = Math.min(1, Math.max(0, (x + y) / 2));
  const bgColor = [
    Math.round(10 + t * 130),
    Math.round(132 - t * 40),
    Math.round(255 - t * 5),
  ];

  // Thumbs-up mark: fist, thumb, and a cuff at the wrist.
  const fist = sdRoundedRect(x, y, 0.585, 0.63, 0.175, 0.155, 0.075);
  const thumb = sdCapsule(x, y, 0.36, 0.6, 0.4, 0.3, 0.088);
  const cuff = sdRoundedRect(x, y, 0.44, 0.735, 0.085, 0.13, 0.055);
  const mark = coverage(Math.min(fist, thumb, cuff), softness);

  // Knuckle grooves, cut back out of the fist.
  const groove = Math.min(
    sdCapsule(x, y, 0.5, 0.585, 0.735, 0.585, 0.008),
    sdCapsule(x, y, 0.5, 0.66, 0.735, 0.66, 0.008),
  );
  const grooveMask = coverage(groove, softness);

  const markAlpha = Math.max(0, mark - grooveMask * 0.85);
  const r = Math.round(bgColor[0] * (1 - markAlpha) + 255 * markAlpha);
  const g = Math.round(bgColor[1] * (1 - markAlpha) + 255 * markAlpha);
  const b = Math.round(bgColor[2] * (1 - markAlpha) + 255 * markAlpha);
  return [r, g, b, Math.round(bg * 255)];
}

function renderRgba(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const softness = 1.5 / (size * SUPERSAMPLE);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          const [pr, pg, pb, pa] = shade(x, y, softness);
          r += pr;
          g += pg;
          b += pb;
          a += pa;
        }
      }
      const n = SUPERSAMPLE * SUPERSAMPLE;
      const offset = (py * size + px) * 4;
      pixels[offset] = Math.round(r / n);
      pixels[offset + 1] = Math.round(g / n);
      pixels[offset + 2] = Math.round(b / n);
      pixels[offset + 3] = Math.round(a / n);
    }
  }
  return pixels;
}

/* -------------------------------- PNG -------------------------------- */

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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12: compression, filter, interlace — all zero.

  // Filter type 0 (None) prefixed to each scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(iconDir, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, renderRgba(size));
  await writeFile(resolve(iconDir, `icon-${size}.png`), png);
}
console.log(`✔ icons generated → public/icons (${SIZES.join(', ')})`);
