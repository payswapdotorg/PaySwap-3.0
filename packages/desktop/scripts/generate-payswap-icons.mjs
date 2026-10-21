#!/usr/bin/env node
/*
 * PaySwap desktop icon derivation (P9-B).
 *
 * Regenerates every raster icon under packages/desktop/build/ from the
 * canonical PaySwap mark: a rounded-square tile on the product emerald
 * gradient (packages/ui/src/payswap token ramps) carrying the original
 * swap glyph — two opposing exchange arrows — in near-white ink. The
 * installer variant swaps the glyph for a download-into-tray mark. The
 * macOS DMG background is a quiet ink gradient with a soft emerald glow.
 *
 * Design laws (spec/productization/PRODUCT-IDENTITY.md §2):
 *   - original PaySwap identity only; NO ZCode art, wordmarks or boot art;
 *   - colors come from the PaySwap design token system (emerald accent,
 *     warm-stone neutrals), never an inherited brand ramp.
 *
 * Implementation notes:
 *   - Pure Node (node:zlib only): a committed, deterministic, offline
 *     generator — no browser, no native image library, no network. Anyone
 *     can re-run it and get byte-identical rasters.
 *   - Geometry is evaluated as signed distance fields at supersampled
 *     resolution, then box-downsampled (premultiplied alpha) to each
 *     target size, so every size is derived from one parametric master.
 *   - ICO containers embed PNG entries (Vista+ format, understood by
 *     Electron/Explorer); ICNS containers embed PNG entries (ic07..ic14).
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(scriptDir, "..", "build");

/* ---------------- PaySwap design tokens (from packages/ui/src/payswap) ---- */

const COLOR = {
  emerald400: [0x34, 0xd3, 0x99], // --ps-emerald-400
  emerald500: [0x10, 0xb9, 0x81], // --ps-emerald-500
  emerald700: [0x04, 0x78, 0x57], // --ps-emerald-700
  ink50: [0xfa, 0xfa, 0xf8], // --ps-neutral-50 (glyph ink)
  ink900: [0x1c, 0x1a, 0x17], // --ps-neutral-900
  ink950: [0x13, 0x12, 0x11], // --ps-neutral-950
};

const MASTER_RENDER_SIZE = 4096; // single supersampled master per variant
const CORNER_RADIUS = 0.225; // rounded-square radius, fraction of tile edge

/* ---------------------------- minimal PNG encoder ------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

/** Encode RGBA (straight alpha, 8bpc) as PNG. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------ SDF primitives ---------------------------- */

function sdRoundRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Capsule (rounded segment) SDF, already offset by its radius. */
function sdCapsule(px, py, ax, ay, bx, by, radius) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - radius;
}

/** Triangle SDF (iq, https://www.shadertoy.com/view/ws3GDf). */
function sdTriangle(px, py, v0, v1, v2) {
  const e0x = v1[0] - v0[0];
  const e0y = v1[1] - v0[1];
  const e1x = v2[0] - v1[0];
  const e1y = v2[1] - v1[1];
  const e2x = v0[0] - v2[0];
  const e2y = v0[1] - v2[1];
  const w0x = px - v0[0];
  const w0y = py - v0[1];
  const w1x = px - v1[0];
  const w1y = py - v1[1];
  const w2x = px - v2[0];
  const w2y = py - v2[1];
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const pq0x = w0x - e0x * clamp01((w0x * e0x + w0y * e0y) / (e0x * e0x + e0y * e0y));
  const pq0y = w0y - e0y * clamp01((w0x * e0x + w0y * e0y) / (e0x * e0x + e0y * e0y));
  const pq1x = w1x - e1x * clamp01((w1x * e1x + w1y * e1y) / (e1x * e1x + e1y * e1y));
  const pq1y = w1y - e1y * clamp01((w1x * e1x + w1y * e1y) / (e1x * e1x + e1y * e1y));
  const pq2x = w2x - e2x * clamp01((w2x * e2x + w2y * e2y) / (e2x * e2x + e2y * e2y));
  const pq2y = w2y - e2y * clamp01((w2x * e2x + w2y * e2y) / (e2x * e2x + e2y * e2y));
  const s = Math.sign(e0x * e2y - e0y * e2x) || 1;
  const dx = Math.min(pq0x * pq0x + pq0y * pq0y, pq1x * pq1x + pq1y * pq1y, pq2x * pq2x + pq2y * pq2y);
  const dy = Math.min(
    s * (w0x * e0y - w0y * e0x),
    s * (w1x * e1y - w1y * e1x),
    s * (w2x * e2y - w2y * e2x),
  );
  return -Math.sqrt(dx) * Math.sign(dy);
}

/** Rounded triangle: triangle SDF shrunk by `round`. */
function sdRoundedTriangle(px, py, v0, v1, v2, round) {
  return sdTriangle(px, py, v0, v1, v2) - round;
}

function smin(a, b, k) {
  const h = Math.min(1, Math.max(0, (0.5 + 0.5 * (b - a) / k)));
  return b + (a - b) * h - k * h * (1 - h);
}

/* ------------------------------ mark geometry ----------------------------- */

/*
 * App glyph: the PaySwap swap mark — two opposing exchange arrows arranged
 * with 180-degree rotational symmetry. Coordinates are normalized to the
 * tile: x,y in [-0.5, 0.5], y grows downward (image space).
 */
function sdSwapGlyph(px, py) {
  const shaftRadius = 0.062;
  const headRound = 0.022;
  // Top arrow: shaft runs left-to-right, head points RIGHT.
  const topShaft = sdCapsule(px, py, -0.315, -0.13, 0.155, -0.13, shaftRadius);
  const topHead = sdRoundedTriangle(
    px,
    py,
    [0.16, -0.245],
    [0.16, -0.015],
    [0.345, -0.13],
    headRound,
  );
  const top = smin(topShaft, topHead, 0.02);
  // Bottom arrow: mirror of the top arrow (points LEFT).
  const bottomShaft = sdCapsule(px, py, -0.155, 0.13, 0.315, 0.13, shaftRadius);
  const bottomHead = sdRoundedTriangle(
    px,
    py,
    [-0.16, 0.245],
    [-0.16, 0.015],
    [-0.345, 0.13],
    headRound,
  );
  const bottom = smin(bottomShaft, bottomHead, 0.02);
  return Math.min(top, bottom);
}

/*
 * Installer glyph: download-into-tray mark (same family: same capsule
 * weight and rounding language as the swap mark).
 */
function sdInstallerGlyph(px, py) {
  const tray = sdCapsule(px, py, -0.22, 0.185, 0.22, 0.185, 0.05);
  const shaft = sdCapsule(px, py, 0, -0.27, 0, -0.01, 0.058);
  const head = sdRoundedTriangle(
    px,
    py,
    [-0.145, -0.03],
    [0.145, -0.03],
    [0, 0.15],
    0.022,
  );
  return smin(smin(tray, shaft, 0.015), head, 0.015);
}

/* ------------------------------ color mixing ------------------------------ */

function mixColor(stopA, stopB, t) {
  return [
    stopA[0] + (stopB[0] - stopA[0]) * t,
    stopA[1] + (stopB[1] - stopA[1]) * t,
    stopA[2] + (stopB[2] - stopA[2]) * t,
  ];
}

/** Product gradient: mostly-vertical emerald ramp (tokens only). */
function tileGradient(nx, ny) {
  const t = Math.min(1, Math.max(0, 0.25 * nx + 0.75 * ny));
  if (t < 0.5) {
    return mixColor(COLOR.emerald400, COLOR.emerald500, t / 0.5);
  }
  return mixColor(COLOR.emerald500, COLOR.emerald700, (t - 0.5) / 0.5);
}

/* --------------------------- master tile renderer ------------------------- */

/**
 * Render the supersampled master tile (RGBA, premultiplied internally as
 * straight RGBA where fully-transparent pixels carry zeroed RGB).
 * `glyphSd` selects the variant glyph.
 */
function renderMasterTile(size, glyphSd) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = CORNER_RADIUS;
  for (let y = 0; y < size; y++) {
    const ny = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size;
      // Normalized coords in [-0.5, 0.5] with y downward.
      const px = nx - 0.5;
      const py = ny - 0.5;
      const tile = sdRoundRect(px, py, 0, 0, 0.5, 0.5, radius);
      const offset = (y * size + x) * 4;
      if (tile > 0.5 / size) {
        continue; // outside the tile (with AA slack): leave transparent
      }
      const insideTile = tile <= 0;
      const [r, g, b] = tileGradient(nx, ny);
      const glyph = glyphSd(px, py);
      const insideGlyph = glyph <= 0;
      if (insideGlyph) {
        rgba[offset] = COLOR.ink50[0];
        rgba[offset + 1] = COLOR.ink50[1];
        rgba[offset + 2] = COLOR.ink50[2];
        rgba[offset + 3] = insideTile ? 255 : 0;
      } else {
        rgba[offset] = insideTile ? Math.round(r) : 0;
        rgba[offset + 1] = insideTile ? Math.round(g) : 0;
        rgba[offset + 2] = insideTile ? Math.round(b) : 0;
        rgba[offset + 3] = insideTile ? 255 : 0;
      }
    }
  }
  return rgba;
}

/** Box-downsample a supersampled straight-RGBA buffer to `target` size. */
function downsample(source, sourceSize, target) {
  if (target === sourceSize) {
    return source;
  }
  const out = Buffer.alloc(target * target * 4);
  const scale = sourceSize / target;
  for (let ty = 0; ty < target; ty++) {
    const sy0 = Math.floor(ty * scale);
    const sy1 = Math.max(sy0 + 1, Math.floor((ty + 1) * scale));
    for (let tx = 0; tx < target; tx++) {
      const sx0 = Math.floor(tx * scale);
      const sx1 = Math.max(sx0 + 1, Math.floor((tx + 1) * scale));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1 && sy < sourceSize; sy++) {
        for (let sx = sx0; sx < sx1 && sx < sourceSize; sx++) {
          const o = (sy * sourceSize + sx) * 4;
          const alpha = source[o + 3];
          // Average premultiplied, then un-premultiply below.
          r += source[o] * alpha;
          g += source[o + 1] * alpha;
          b += source[o + 2] * alpha;
          a += alpha;
          count++;
        }
      }
      const outOffset = (ty * target + tx) * 4;
      if (a === 0 || count === 0) {
        continue;
      }
      out[outOffset] = Math.min(255, Math.round(r / a));
      out[outOffset + 1] = Math.min(255, Math.round(g / a));
      out[outOffset + 2] = Math.min(255, Math.round(b / a));
      out[outOffset + 3] = Math.min(255, Math.round(a / count));
    }
  }
  return out;
}

/* ------------------------------ containers -------------------------------- */

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Build a PNG-embedded ICO (Vista+ format). */
function buildIco(pngBySize) {
  const entries = ICO_SIZES.map((size) => ({ size, png: pngBySize.get(size) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(entries.length * 16);
  let offset = header.length + dir.length;
  entries.forEach((entry, index) => {
    const base = index * 16;
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base);
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1);
    dir.writeUInt8(0, base + 2); // palette
    dir.writeUInt8(0, base + 3); // reserved
    dir.writeUInt16LE(1, base + 4); // color planes
    dir.writeUInt16LE(32, base + 6); // bits per pixel
    dir.writeUInt32LE(entry.png.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += entry.png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((entry) => entry.png)]);
}

/** ICNS entry types -> PNG size (px). */
const ICNS_ENTRIES = [
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 128],
  ["ic14", 256],
];

/** Build a PNG-embedded ICNS. */
function buildIcns(pngBySize) {
  const chunks = [];
  let total = 8;
  for (const [type, size] of ICNS_ENTRIES) {
    const png = pngBySize.get(size);
    const entry = Buffer.alloc(8);
    entry.write(type, 0, "ascii");
    entry.writeUInt32BE(png.length + 8, 4);
    chunks.push({ entry, png });
    total += png.length + 8;
  }
  const header = Buffer.alloc(8);
  header.write("icns", 0, "ascii");
  header.writeUInt32BE(total, 4);
  return Buffer.concat([header, ...chunks.flatMap(({ entry, png }) => [entry, png])]);
}

/* ------------------------------ DMG background ---------------------------- */

function renderDmgBackground(width, height, supersample = 2) {
  const sw = width * supersample;
  const sh = height * supersample;
  const rgba = Buffer.alloc(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const ny = (y + 0.5) / sh;
    for (let x = 0; x < sw; x++) {
      const nx = (x + 0.5) / sw;
      const base = mixColor(COLOR.ink950, COLOR.ink900, ny);
      // Soft emerald glow, lower-right third, kept quiet (max ~14% tint).
      const gx = (nx - 0.72) / 0.38;
      const gy = (ny - 0.78) / 0.55;
      const glow = Math.exp(-(gx * gx + gy * gy));
      const r = base[0] + (COLOR.emerald700[0] - base[0]) * glow * 0.35;
      const g = base[1] + (COLOR.emerald700[1] - base[1]) * glow * 0.35;
      const b = base[2] + (COLOR.emerald700[2] - base[2]) * glow * 0.35;
      const offset = (y * sw + x) * 4;
      rgba[offset] = Math.round(r);
      rgba[offset + 1] = Math.round(g);
      rgba[offset + 2] = Math.round(b);
      rgba[offset + 3] = 255;
    }
  }
  return downsample(rgba, sw, width, height);
}

/* --------------------------------- driver --------------------------------- */

const HICOLOR_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

function pngFor(master, size) {
  const pixels = downsample(master, MASTER_RENDER_SIZE, size);
  return encodePng(size, size, pixels);
}

function writeIconSet(variantName, glyphSd) {
  console.log(`[payswap-icons] rendering ${variantName} master ${MASTER_RENDER_SIZE}px ...`);
  const master = renderMasterTile(MASTER_RENDER_SIZE, glyphSd);
  const pngBySize = new Map();
  for (const size of new Set([...HICOLOR_SIZES, ...ICO_SIZES])) {
    pngBySize.set(size, pngFor(master, size));
  }
  const outputs = [];
  if (variantName === "app") {
    outputs.push([join(buildDir, "icon.png"), pngBySize.get(1024)]);
    outputs.push([join(buildDir, "icon_windows.png"), pngBySize.get(1024)]);
    for (const size of HICOLOR_SIZES) {
      outputs.push([join(buildDir, "icons", `${size}x${size}.png`), pngBySize.get(size)]);
    }
    outputs.push([join(buildDir, "icon.ico"), buildIco(pngBySize)]);
    outputs.push([join(buildDir, "icon.icns"), buildIcns(pngBySize)]);
  } else {
    outputs.push([join(buildDir, "icon_installer.png"), pngBySize.get(1024)]);
    outputs.push([join(buildDir, "icon_installer.ico"), buildIco(pngBySize)]);
    outputs.push([join(buildDir, "icon_installer.icns"), buildIcns(pngBySize)]);
  }
  for (const [filePath, bytes] of outputs) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, bytes);
    console.log(`[payswap-icons] wrote ${filePath} (${bytes.length} bytes)`);
  }
}

mkdirSync(join(buildDir, "icons"), { recursive: true });
writeIconSet("app", sdSwapGlyph);
writeIconSet("installer", sdInstallerGlyph);

for (const [name, width, height] of [
  ["dmg_background.png", 540, 380],
  ["dmg_background@2x.png", 1080, 760],
]) {
  const png = encodePng(width, height, renderDmgBackground(width, height));
  writeFileSync(join(buildDir, name), png);
  console.log(`[payswap-icons] wrote ${join(buildDir, name)} (${png.length} bytes)`);
}

console.log("[payswap-icons] done");
