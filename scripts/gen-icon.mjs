// GoFetch app icon generator (GF-119).
//
// Renders the retriever sprite (with its red root collar) carrying a square
// coral "AI buddy" in its mouth — a friendly nod to the assistant it monitors,
// deliberately NOT the actual Claude mascot (PC-3): just a plain rounded
// square with two eyes.
//
// Pure node (zlib PNG encoder, no deps). Output: app-icon-1024.png at repo
// root — feed it to `npm run tauri icon app-icon-1024.png` to regenerate
// src-tauri/icons/*.
//
// Usage: node scripts/gen-icon.mjs

import zlib from "node:zlib";
import { writeFileSync } from "node:fs";
import dog from "../src/sprites/dog.js";

// ---------------------------------------------------------------------------
// Compose the scene: a front-facing retriever FACE close-up (24×22) carrying
// the square coral AI buddy in its mouth.
// ---------------------------------------------------------------------------

// Palette reuse: coat / ear / cream / dark from the live sprite sheet, so the
// icon always matches the in-app character.
const P = {
  g: dog.palette.g,
  e: dog.palette.e,
  c: dog.palette.c,
  N: dog.palette.N,
};

// Front face: floppy ears at the sides, 2px eyes, cream muzzle, big nose.
const FACE = [
  "......gggggggggggg......",
  "....gggggggggggggggg....",
  "...gggggggggggggggggg...",
  ".eeeggggggggggggggggeee.",
  ".eeeggggggggggggggggeee.",
  ".eeeggggggggggggggggeee.",
  ".eeegggNNggggggNNgggeee.",
  ".eeegggNNggggggNNgggeee.",
  ".eeeggggggggggggggggeee.",
  ".eeeggggccccccccggggeee.",
  ".eeeggggccNNNNccggggeee.",
  "..eegggcccNNNNcccgggee..",
  "..eegggccccccccccgggee..",
  "...ggggccccccccccgggg...",
  "...gggggccccccccggggg...",
  "....ggggccccccccgggg....",
  ".....gggggggggggggg.....",
  "......gggggggggggg......",
  "........................",
  "........................",
  "........................",
  "........................",
];

const GRID_W = 24;
const GRID_H = 22;

function dogPixel(x, y) {
  const ch = FACE[y]?.[x];
  if (!ch || ch === ".") return null;
  return P[ch] || null;
}

// Square coral AI buddy, 8×8, hanging from the mouth at the bottom center.
// Corners trimmed one pixel; slim eyes and a tiny mouth — friendly and
// abstract, distinct from any mascot.
const BUDDY = { x: 8, y: 14, w: 8, h: 8 };
const CORAL = "#d97757"; // the Claude-ish coral
const CORAL_SHADE = "#bc5f41"; // bottom edge shading
const EYE = "#1c1c22";

function buddyPixel(x, y) {
  const bx = x - BUDDY.x;
  const by = y - BUDDY.y;
  if (bx < 0 || by < 0 || bx >= BUDDY.w || by >= BUDDY.h) return null;
  // trim corners → soft square
  const corner =
    (bx === 0 || bx === BUDDY.w - 1) && (by === 0 || by === BUDDY.h - 1);
  if (corner) return null;
  // slim eyes (1×2 each) + a 2px smile
  if (by >= 2 && by <= 3 && (bx === 2 || bx === 5)) return EYE;
  if (by === 5 && (bx === 3 || bx === 4)) return EYE;
  if (by === BUDDY.h - 1) return CORAL_SHADE;
  return CORAL;
}

/** final scene pixel: buddy draws over the face (held in front of the mouth) */
function scenePixel(x, y) {
  return buddyPixel(x, y) || dogPixel(x, y);
}

// ---------------------------------------------------------------------------
// Rasterize to 1024×1024 RGBA
// ---------------------------------------------------------------------------

const SIZE = 1024;
const MARGIN = 64; // transparent border (macOS icon grid)
const RADIUS = 200; // background corner radius
const BG = [250, 242, 215, 255]; // cream (#FAF2D7)
const SCALE = 36; // 24×22 → 864×792
const OFF_X = (SIZE - GRID_W * SCALE) / 2; // 64
const OFF_Y = (SIZE - GRID_H * SCALE) / 2; // 148

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  255,
];

function insideRoundedRect(px, py) {
  const lo = MARGIN;
  const hi = SIZE - MARGIN;
  if (px < lo || px >= hi || py < lo || py >= hi) return false;
  const r = RADIUS;
  const cx = px < lo + r ? lo + r : px >= hi - r ? hi - r - 1 : null;
  const cy = py < lo + r ? lo + r : py >= hi - r ? hi - r - 1 : null;
  if (cx === null || cy === null) return true;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

const img = new Uint8Array(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let rgba = [0, 0, 0, 0];
    if (insideRoundedRect(px, py)) {
      rgba = BG;
      const gx = Math.floor((px - OFF_X) / SCALE);
      const gy = Math.floor((py - OFF_Y) / SCALE);
      if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
        const c = scenePixel(gx, gy);
        if (c) rgba = hex(c);
      }
    }
    const o = (py * SIZE + px) * 4;
    img[o] = rgba[0];
    img[o + 1] = rgba[1];
    img[o + 2] = rgba[2];
    img[o + 3] = rgba[3];
  }
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGBA, filter 0)
// ---------------------------------------------------------------------------

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// raw scanlines with filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0;
  Buffer.from(img.buffer, y * SIZE * 4, SIZE * 4).copy(raw, rowStart + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(new URL("../app-icon-1024.png", import.meta.url), png);
console.log("wrote app-icon-1024.png (1024×1024)");
