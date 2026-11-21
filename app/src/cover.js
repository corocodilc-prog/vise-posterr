// Vice Poster renderer: draws a multi-panel GTA-style sunset poster onto
// any 2D canvas. Everything is procedural — gradient skies, a striped retro
// sun, a blocky skyline, palm silhouettes and bold title type — so the app
// works fully offline with no assets at all. A user photo, when one is
// loaded, is painted into the hero panel with a warm sunset grade.
//
//   import { renderPoster, exportPng } from './cover.js';
//   renderPoster(canvas, { photo, caption, subtitle, shot, width, height });

export const PALETTES = {
  dusk: {
    sky: ['#180836', '#7a1c60', '#ff7a30'],
    sun: '#ffd65c',
    sunCore: '#fff0b4',
    sea: '#100a30',
    glint: '#ff7a30',
    ink: '#0c061c',
  },
  neon: {
    sky: ['#040c28', '#10446e', '#18bebe'],
    sun: '#ff50b4',
    sunCore: '#ffbee6',
    sea: '#040a22',
    glint: '#18bebe',
    ink: '#03081a',
  },
  dawn: {
    sky: ['#402060', '#e26054', '#ffc460'],
    sun: '#fff4c8',
    sunCore: '#fffff0',
    sea: '#281440',
    glint: '#ffc460',
    ink: '#1c0c30',
  },
};

/** A small deterministic generator so window lights never flicker between renders. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skyGradient(ctx, x, y, w, h, stops) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.55, stops[1]);
  g.addColorStop(1, stops[2]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** The retro sun: a disc whose lower half is cut by widening gaps. */
function retroSun(ctx, cx, cy, r, palette) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = palette.sun;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  // Stripe gaps, thin near the top of the cut and wider toward the bottom.
  // NB: destination-out erases in proportion to the source alpha, so the
  // fill must be opaque — a transparent fill (an earlier draft used
  // rgba(0,0,0,0)) erases nothing and the sun comes out stripe-less.
  let gapY = cy + r * 0.08;
  let gapH = r * 0.045;
  ctx.fillStyle = '#000';
  ctx.globalCompositeOperation = 'destination-out';
  while (gapY < cy + r) {
    ctx.fillRect(cx - r, gapY, r * 2, gapH);
    gapY += gapH + r * 0.1;
    gapH *= 1.35;
  }
  ctx.restore();
  // Bright core on top of the stripes.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = palette.sunCore;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

function skyline(ctx, x0, x1, baseY, maxH, palette, seed) {
  const rnd = seededRandom(seed);
  ctx.fillStyle = palette.ink;
  let x = x0;
  while (x < x1) {
    const w = 18 + rnd() * 44;
    const h = maxH * (0.35 + rnd() * 0.65);
    ctx.fillRect(x, baseY - h, w, h);
    const wins = 1 + Math.floor(rnd() * 3);
    ctx.fillStyle = palette.sunCore;
    for (let i = 0; i < wins; i++) {
      ctx.fillRect(x + 4 + rnd() * Math.max(1, w - 10), baseY - h + 5 + rnd() * Math.max(1, h - 12), 4, 5);
    }
    ctx.fillStyle = palette.ink;
    x += w + 3 + rnd() * 10;
  }
}

function palm(ctx, baseX, baseY, h, lean, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  const topX = baseX + lean;
  const topY = baseY - h;
  // Leaning trunk, drawn as a chain of thick segments.
  let px = baseX;
  let py = baseY;
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const nx = baseX + lean * t * t;
    const ny = baseY - h * t;
    ctx.lineWidth = Math.max(3, h * 0.045 * (1 - t * 0.5));
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    px = nx;
    py = ny;
  }
  // Seven fronds fanning out and drooping from the crown.
  const len = h * 0.52;
  ctx.lineWidth = Math.max(2, h * 0.02);
  for (let f = 0; f < 7; f++) {
    const ang = Math.PI * (0.08 + (f / 6) * 0.84);
    const reach = len * (f % 2 === 0 ? 1 : 0.86);
    const midX = topX + Math.cos(ang) * reach * 0.5;
    const midY = topY - len * 0.22;
    const tipX = topX + Math.cos(ang) * reach;
    const tipY = topY + Math.sin(ang) * len * 0.62 + len * 0.18;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(topX - 6, topY + 8, 5, 0, Math.PI * 2);
  ctx.arc(topX + 7, topY + 9, 5, 0, Math.PI * 2);
  ctx.fill();
}

/** One sunset scene inside a rectangle: sky, sun, sea, skyline. */
function scene(ctx, x, y, w, h, palette, seed) {
  const horizon = y + h * 0.62;
  skyGradient(ctx, x, y, w, horizon - y, palette.sky);
  const sunR = w * 0.17;
  retroSun(ctx, x + w * 0.5, horizon - sunR * 0.42, sunR, palette);
  ctx.fillStyle = palette.sea;
  ctx.fillRect(x, horizon, w, y + h - horizon);
  // Sun glints on the water.
  const rnd = seededRandom(seed + 7);
  ctx.fillStyle = palette.glint;
  for (let i = 0; i < 9; i++) {
    const sy = horizon + 6 + rnd() * (y + h - horizon - 12);
    const sw = w * (0.1 + rnd() * 0.3);
    ctx.fillRect(x + w * 0.5 - sw / 2, sy, sw, 2);
  }
  skyline(ctx, x + 4, x + w - 4, horizon + 2, h * 0.3, palette, seed);
}

/** Paints a photo cover-fit into a rectangle, with a warm sunset grade. */
function drawPhoto(ctx, photo, x, y, w, h) {
  const scale = Math.max(w / photo.width, h / photo.height);
  const dw = photo.width * scale;
  const dh = photo.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(photo, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  // Warm grade: a translucent orange wash plus a violet multiply.
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ff7a30';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 0.14;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#5c1668';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function fitFont(ctx, text, maxWidth, startPx, family) {
  let px = startPx;
  ctx.font = `900 ${px}px ${family}`;
  while (px > 24 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = `900 ${px}px ${family}`;
  }
  return px;
}

const DISPLAY = '"Arial Black", "Helvetica Neue", Arial, sans-serif';

/**
 * Renders the poster. `opts`:
 *   photo    — an HTMLImageElement/canvas or null (procedural scene instead)
 *   caption  — the big title line
 *   subtitle — the small line under the title
 *   shot     — a preset from shots.js ({ palette, panels, ... })
 *   width/height — export size in pixels (default 1080x1080)
 */
export function renderPoster(canvas, opts = {}) {
  const {
    photo = null,
    caption = 'VICE CITY',
    subtitle = 'WELCOME TO LEONIDA',
    shot = null,
    width = 1080,
    height = 1080,
  } = opts;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');

  const palette = PALETTES[shot?.palette ?? 'dusk'] ?? PALETTES.dusk;
  const panelPalettes = (shot?.panels ?? ['dusk', 'neon', 'dawn']).map(
    (name) => PALETTES[name] ?? PALETTES.dusk,
  );
  const panelTags = shot?.panelTags ?? ['BOULEVARD', 'NEON NIGHT', 'GOLDEN HOUR'];

  const W = width;
  const H = height;
  const paper = '#faf4e8';
  const black = '#0a0614';
  const margin = Math.round(W * 0.028);

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // Hero: photo when loaded, procedural sunset otherwise.
  const hero = { x: margin, y: margin, w: W - margin * 2, h: Math.round(H * 0.61) };
  if (photo) {
    drawPhoto(ctx, photo, hero.x, hero.y, hero.w, hero.h);
    // Keep the sunset mood over the photo: a soft sky tint at the top.
    const tint = ctx.createLinearGradient(0, hero.y, 0, hero.y + hero.h * 0.5);
    tint.addColorStop(0, 'rgba(122, 28, 96, 0.28)');
    tint.addColorStop(1, 'rgba(122, 28, 96, 0)');
    ctx.fillStyle = tint;
    ctx.fillRect(hero.x, hero.y, hero.w, hero.h * 0.5);
  } else {
    scene(ctx, hero.x, hero.y, hero.w, hero.h, palette, 11);
  }
  // Framing palms lean in from the hero's lower corners either way.
  palm(ctx, hero.x + hero.w * 0.06, hero.y + hero.h - 6, hero.h * 0.46, hero.w * 0.055, palette.ink);
  palm(ctx, hero.x + hero.w * 0.94, hero.y + hero.h - 6, hero.h * 0.4, -hero.w * 0.048, palette.ink);
  ctx.fillStyle = black;
  ctx.fillRect(hero.x, hero.y + hero.h, hero.w, 3);

  // Three panel thumbnails under the hero, one per mood.
  const gap = Math.round(W * 0.015);
  const pw = (hero.w - gap * 2) / 3;
  const ph = Math.round(H * 0.155);
  const py = hero.y + hero.h + Math.round(H * 0.017);
  for (let i = 0; i < 3; i++) {
    const px = hero.x + i * (pw + gap);
    scene(ctx, px, py, pw, ph, panelPalettes[i], 21 + i * 12);
    ctx.fillStyle = black;
    ctx.fillRect(px, py + ph, pw, Math.round(H * 0.024));
    ctx.fillStyle = paper;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tagPx = fitFont(ctx, panelTags[i], pw * 0.9, Math.round(H * 0.016), DISPLAY);
    ctx.font = `900 ${tagPx}px ${DISPLAY}`;
    ctx.fillText(panelTags[i], px + pw / 2, py + ph + Math.round(H * 0.012));
  }

  // Title band: big caption, pink underline sweep, subtitle.
  // Sizes are kept modest on purpose: at the old start size (0.10H) the
  // subtitle baseline landed past the bottom edge on 1080x1080 exports.
  const title = (caption || 'VICE CITY').toUpperCase();
  const titleY = py + ph + Math.round(H * 0.03);
  const titlePx = fitFont(ctx, title, W - margin * 2, Math.round(H * 0.075), DISPLAY);
  ctx.font = `900 ${titlePx}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = black;
  ctx.fillText(title, W / 2, titleY + titlePx);
  const titleW = Math.min(ctx.measureText(title).width, W - margin * 2);
  const underY = titleY + titlePx + Math.round(H * 0.008);
  ctx.fillStyle = '#ff2a6d';
  ctx.fillRect((W - titleW) / 2, underY, titleW, Math.round(H * 0.007));
  ctx.fillStyle = '#ffaa00';
  ctx.fillRect((W - titleW) / 2, underY + Math.round(H * 0.01), titleW * 0.62, Math.round(H * 0.004));

  const sub = (subtitle || '').toUpperCase();
  if (sub) {
    const subPx = fitFont(ctx, sub, W - margin * 4, Math.round(H * 0.026), DISPLAY);
    ctx.font = `900 ${subPx}px ${DISPLAY}`;
    ctx.fillStyle = '#5a285a';
    ctx.fillText(sub, W / 2, underY + Math.round(H * 0.008) + subPx * 1.5);
  }

  // Outer frame: bold black border.
  ctx.strokeStyle = black;
  ctx.lineWidth = Math.max(4, Math.round(W * 0.009));
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
  return canvas;
}

/** Downloads the canvas as a PNG file named after the caption. */
export function exportPng(canvas, caption = 'vice-poster') {
  const slug = (caption || 'vice-poster')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'vice-poster';
  const a = document.createElement('a');
  a.download = `${slug}-${canvas.width}x${canvas.height}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}
