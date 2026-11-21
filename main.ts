// Vice Poster — grader entrypoint.
//
// Renders a sample multi-panel GTA 6-poster-style cover and writes it as a
// PNG into MAKEFUN_OUTPUT_DIR (default "out").
//
// Everything is drawn in code with the Node standard library only: a small
// software rasterizer paints the poster into a pixel buffer and a hand-rolled
// PNG encoder (zlib deflate + CRC32) writes it out. No network, no fonts on
// disk, no native modules. The sample photos in app/samples/ are JPEGs and
// the standard library has no JPEG decoder, and the vendor library
// (vendor/makefun-app.ts) only builds dossiers, so the sample render is a
// fully procedural poster — the same artwork the browser app draws on canvas.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Also writes out/dossier.json on a best-effort basis (a failure there never
// fails the render; the PNG is the deliverable).

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// ------------------------------------------------------------------ color

type RGB = [number, number, number];

const rgb = (r: number, g: number, b: number): RGB => [r, g, b];

/** Linear blend of two colors; t = 0 gives `a`, t = 1 gives `b`. */
function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

// ------------------------------------------------------------------ raster

class Raster {
  readonly width: number;
  readonly height: number;
  readonly px: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.px = new Uint8ClampedArray(width * height * 3);
  }

  set(x: number, y: number, c: RGB): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const o = (iy * this.width + ix) * 3;
    this.px[o] = c[0];
    this.px[o + 1] = c[1];
    this.px[o + 2] = c[2];
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const o = (yy * this.width + xx) * 3;
        this.px[o] = c[0];
        this.px[o + 1] = c[1];
        this.px[o + 2] = c[2];
      }
    }
  }

  /** Vertical gradient between color stops: [position 0..1, color]. */
  vgrad(y0: number, y1: number, stops: Array<[number, RGB]>): void {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      let c = stops[stops.length - 1]![1];
      for (let s = 0; s < stops.length - 1; s++) {
        const [t0, c0] = stops[s]!;
        const [t1, c1] = stops[s + 1]!;
        if (t >= t0 && t <= t1) {
          c = mix(c0, c1, (t - t0) / Math.max(0.0001, t1 - t0));
          break;
        }
      }
      this.fillRect(0, y, this.width, 1, c);
    }
  }

  /** Filled disc, optionally with horizontal gaps (retro sun stripes). */
  disc(cx: number, cy: number, r: number, c: RGB, stripes?: { from: number; step: number }): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const dy = y - cy;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        if (stripes && y > cy + stripes.from) {
          const band = Math.floor((y - cy - stripes.from) / stripes.step);
          if (band % 2 === 1) continue;
        }
        this.set(x, y, c);
      }
    }
  }

  /** A thick line drawn as a chain of small discs (Bresenham walk). */
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      this.disc(x, y, w / 2, c);
    }
  }
}

/** Deterministic pseudo-random numbers (fixed seed, so runs are identical). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ 5x7 font

// Blocky capitals, digits and a little punctuation, drawn from a 5-wide,
// 7-tall grid. '#' is a set pixel, '.' is empty. Legibility over fidelity.
const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  ':': ['.....', '..#..', '.....', '..#..', '.....', '..#..', '.....'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

/** Width of a string at a given pixel scale (1 column gap between glyphs). */
function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return (text.length * (GLYPH_W + 1) - 1) * scale;
}

/** Draws one line of text; returns the x just past the last glyph. */
function drawText(r: Raster, text: string, x: number, y: number, scale: number, c: RGB): number {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS['?']!;
    for (let gy = 0; gy < GLYPH_H; gy++) {
      const row = glyph[gy]!;
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (row[gx] === '#') {
          r.fillRect(cx + gx * scale, y + gy * scale, scale, scale, c);
        }
      }
    }
    cx += (GLYPH_W + 1) * scale;
  }
  return cx;
}

// ------------------------------------------------------------------ poster art

interface Palette {
  skyTop: RGB;
  skyMid: RGB;
  skyBot: RGB;
  sun: RGB;
  sunCore: RGB;
  sea: RGB;
  seaLight: RGB;
  ink: RGB;
}

const DUSK: Palette = {
  skyTop: rgb(24, 8, 54),
  skyMid: rgb(122, 28, 96),
  skyBot: rgb(255, 122, 48),
  sun: rgb(255, 214, 92),
  sunCore: rgb(255, 240, 180),
  sea: rgb(16, 10, 48),
  seaLight: rgb(255, 122, 48),
  ink: rgb(12, 6, 28),
};

const NEON: Palette = {
  skyTop: rgb(4, 12, 40),
  skyMid: rgb(16, 68, 110),
  skyBot: rgb(24, 190, 190),
  sun: rgb(255, 80, 180),
  sunCore: rgb(255, 190, 230),
  sea: rgb(4, 10, 34),
  seaLight: rgb(24, 190, 190),
  ink: rgb(3, 8, 26),
};

const DAWN: Palette = {
  skyTop: rgb(64, 32, 96),
  skyMid: rgb(226, 96, 84),
  skyBot: rgb(255, 196, 96),
  sun: rgb(255, 244, 200),
  sunCore: rgb(255, 255, 240),
  sea: rgb(40, 20, 64),
  seaLight: rgb(255, 196, 96),
  ink: rgb(28, 12, 48),
};

/** A palm silhouette: a leaning trunk and seven drooping fronds. */
function palm(r: Raster, baseX: number, baseY: number, h: number, lean: number, c: RGB): void {
  const topX = baseX + lean;
  const topY = baseY - h;
  // Trunk: a slightly curved chain of thick segments.
  const segs = 8;
  let px = baseX;
  let py = baseY;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const nx = baseX + lean * t * t;
    const ny = baseY - h * t;
    r.line(px, py, nx, ny, Math.max(3, h * 0.045 * (1 - t * 0.5)), c);
    px = nx;
    py = ny;
  }
  // Fronds: seven arcs fanning out from the crown.
  const frondLen = h * 0.52;
  for (let f = 0; f < 7; f++) {
    const ang = Math.PI * (0.08 + (f / 6) * 0.84);
    const tipX = topX + Math.cos(ang) * frondLen * (f % 2 === 0 ? 1 : 0.86);
    const tipY = topY + Math.sin(ang) * frondLen * 0.62 + frondLen * 0.18;
    const midX = topX + Math.cos(ang) * frondLen * 0.5;
    const midY = topY - frondLen * 0.22;
    r.line(topX, topY, midX, midY, Math.max(2, h * 0.02), c);
    r.line(midX, midY, tipX, tipY, Math.max(2, h * 0.02), c);
  }
  // Coconuts: two small dots under the crown.
  r.disc(topX - 6, topY + 8, 5, c);
  r.disc(topX + 7, topY + 9, 5, c);
}

/** A blocky skyline with a few lit windows, along the bottom of a region. */
function skyline(r: Raster, x0: number, x1: number, baseY: number, maxH: number, c: RGB, lit: RGB, seed: number): void {
  const rnd = mulberry32(seed);
  let x = x0;
  while (x < x1) {
    const w = 18 + rnd() * 42;
    const h = maxH * (0.35 + rnd() * 0.65);
    r.fillRect(x, baseY - h, w, h, c);
    // A couple of lit windows per building.
    const wins = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < wins; i++) {
      const wx = x + 4 + rnd() * Math.max(1, w - 10);
      const wy = baseY - h + 5 + rnd() * Math.max(1, h - 12);
      r.fillRect(wx, wy, 4, 5, lit);
    }
    x += w + 3 + rnd() * 10;
  }
}

/** One sunset scene inside a rectangle (used for the hero and the panels). */
function scene(r: Raster, x: number, y: number, w: number, h: number, p: Palette, seed: number): void {
  const horizon = y + h * 0.62;
  // Sky: paint a small gradient raster, then copy it into place.
  const sky = new Raster(w, Math.ceil(horizon - y));
  sky.vgrad(0, horizon - y, [
    [0, p.skyTop],
    [0.55, p.skyMid],
    [1, p.skyBot],
  ]);
  for (let yy = 0; yy < sky.height; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const o = (yy * w + xx) * 3;
      r.set(x + xx, y + yy, [sky.px[o]!, sky.px[o + 1]!, sky.px[o + 2]!]);
    }
  }
  // Retro sun, half-sunk, with stripe gaps low down.
  const sunR = w * 0.17;
  const sunCx = x + w * 0.5;
  const sunCy = horizon - sunR * 0.42;
  r.disc(sunCx, sunCy, sunR, p.sun, { from: sunR * 0.1, step: Math.max(4, sunR * 0.09) });
  r.disc(sunCx, sunCy, sunR * 0.62, p.sunCore);
  // Sea: dark water with a few light streaks catching the sun.
  r.fillRect(x, horizon, w, h - (horizon - y), p.sea);
  const rnd = mulberry32(seed + 7);
  for (let i = 0; i < 9; i++) {
    const sy = horizon + 6 + rnd() * (h - (horizon - y) - 12);
    const sw = w * (0.1 + rnd() * 0.3);
    r.fillRect(sunCx - sw / 2, sy, sw, 2, p.seaLight);
  }
  // Skyline sits on the horizon line.
  skyline(r, x + 4, x + w - 4, horizon + 2, h * 0.3, p.ink, p.sunCore, seed);
}

/** The whole poster: hero scene, three panel thumbnails, title band, frame. */
function poster(): Raster {
  const W = 1080;
  const H = 1080;
  const r = new Raster(W, H);
  const white = rgb(250, 244, 232);
  const black = rgb(10, 6, 20);

  r.fillRect(0, 0, W, H, white);

  // Hero scene.
  const heroX = 30;
  const heroY = 30;
  const heroW = W - 60;
  const heroH = 660;
  scene(r, heroX, heroY, heroW, heroH, DUSK, 11);
  // Framing palms leaning in from the corners of the hero.
  palm(r, heroX + 66, heroY + heroH - 8, 300, 60, DUSK.ink);
  palm(r, heroX + heroW - 66, heroY + heroH - 8, 260, -52, DUSK.ink);
  // Thin inner rule under the hero.
  r.fillRect(heroX, heroY + heroH, heroW, 3, black);

  // Three panel thumbnails: the same sunset in three moods.
  const panels: Array<{ p: Palette; seed: number; tag: string }> = [
    { p: DUSK, seed: 21, tag: 'BOULEVARD' },
    { p: NEON, seed: 33, tag: 'NEON NIGHT' },
    { p: DAWN, seed: 47, tag: 'GOLDEN HOUR' },
  ];
  const gap = 16;
  const pw = (heroW - gap * 2) / 3;
  const ph = 168;
  const py = heroY + heroH + 18;
  panels.forEach((panel, i) => {
    const px = heroX + i * (pw + gap);
    scene(r, px, py, pw, ph, panel.p, panel.seed);
    // Tag strip under each panel.
    r.fillRect(px, py + ph, pw, 26, black);
    const tw = textWidth(panel.tag, 2);
    drawText(r, panel.tag, px + (pw - tw) / 2, py + ph + 6, 2, white);
  });

  // Title band. Scale 11 (not 12): at 12 the subtitle's last row landed on
  // the outer frame's bottom border; 11 leaves a clean margin.
  const titleY = py + ph + 26 + 22;
  const title = 'VICE CITY';
  const tScale = 11;
  const tw = textWidth(title, tScale);
  drawText(r, title, (W - tw) / 2, titleY, tScale, black);
  // Pink underline sweep under the title.
  const underY = titleY + GLYPH_H * tScale + 12;
  r.fillRect((W - tw) / 2, underY, tw, 8, rgb(255, 42, 109));
  r.fillRect((W - tw) / 2, underY + 10, tw * 0.62, 4, rgb(255, 170, 0));
  // Subtitle.
  const sub = 'WELCOME TO LEONIDA';
  const sScale = 3;
  const sw = textWidth(sub, sScale);
  drawText(r, sub, (W - sw) / 2, underY + 30, sScale, rgb(90, 40, 90));

  // Outer frame: a bold black border with a white keyline.
  for (let i = 0; i < 10; i++) {
    const inset = i;
    r.fillRect(inset, inset, W - inset * 2, 1, black);
    r.fillRect(inset, H - 1 - inset, W - inset * 2, 1, black);
    r.fillRect(inset, inset, 1, H - inset * 2, black);
    r.fillRect(W - 1 - inset, inset, 1, H - inset * 2, black);
  }
  return r;
}

// ------------------------------------------------------------------ PNG

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encodes an RGB raster as a PNG (8-bit, color type 2, filter 0 rows). */
function encodePng(r: Raster): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(r.width, 0);
  ihdr.writeUInt32BE(r.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2: truecolor RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = r.width * 3 + 1;
  const raw = Buffer.alloc(stride * r.height);
  for (let y = 0; y < r.height; y++) {
    raw[y * stride] = 0; // filter type 0 (none)
    // NB: px is a Uint8ClampedArray, which has no .copy() — Buffer.set does
    // the row copy (an earlier draft used px.copy() and threw at runtime).
    raw.set(r.px.subarray(y * r.width * 3, (y + 1) * r.width * 3), y * stride + 1);
  }
  const idat = deflateSync(raw, { level: 9 });

  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([magic, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ------------------------------------------------------------------ main

function main(): void {
  const outDir = resolve(process.cwd(), process.env.MAKEFUN_OUTPUT_DIR ?? 'out');
  mkdirSync(outDir, { recursive: true });

  const art = poster();
  const png = encodePng(art);
  const pngPath = join(outDir, 'vice-poster.png');
  writeFileSync(pngPath, png);
  console.log(`wrote ${pngPath} (${art.width}x${art.height}, ${png.length} bytes)`);

  // Best effort: the entry dossier beside the render. A dossier failure
  // (for example screenshots over their cap) must never fail the render.
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const dossier = buildDossier(here, {
      text_max_bytes: 163840,
      screenshots: { max: 4, max_bytes: 262144 },
      app_max_files: 993,
      app_max_bytes: 50331648,
    });
    const dossierPath = join(outDir, 'dossier.json');
    writeFileSync(dossierPath, dossier);
    console.log(`wrote ${dossierPath} (${dossier.length} bytes)`);
  } catch (err) {
    console.error(`dossier skipped: ${(err as Error).message}`);
  }
}

main();
