// Vice Poster renderer: draws a multi-panel GTA-style sunset poster onto any
// canvas at any pixel size. Pure canvas 2D, no network, no fonts beyond the
// system stack. `state` is the editor state:
//   { title, subtitle, layout, grade, captionPos,
//     photos: [Image|null, ...],
//     panels: [{ photo: 0, dx: 0, dy: 0, zoom: 1 }, ...] }
// Panel transforms are in fractions of the panel size, so a crop survives a
// resize or an export at another aspect ratio.

export const LAYOUTS = {
  strips: { name: '3 strips', cols: 3, rows: 1 },
  grid4: { name: '2 x 2 grid', cols: 2, rows: 2 },
  comic6: { name: 'Comic 6', cols: 3, rows: 2 },
};

export const GRADES = {
  sunset: {
    name: 'Vice Sunset',
    sky: ['#2b1055', '#ff2e88', '#ff7a3d', '#ffc46b'],
    sun: '#fff3b0', sunGlow: 'rgba(255,122,61,0.85)',
    tint: ['rgba(255,46,136,0.16)', 'rgba(255,154,61,0.20)'],
    title: ['#ffffff', '#ffd166'], accent: '#ff2e88',
  },
  neon: {
    name: 'Neon Night',
    sky: ['#05001a', '#1b0f5e', '#c400ff', '#00e5ff'],
    sun: '#e8fbff', sunGlow: 'rgba(0,229,255,0.8)',
    tint: ['rgba(196,0,255,0.20)', 'rgba(0,229,255,0.18)'],
    title: ['#ffffff', '#7df9ff'], accent: '#00e5ff',
  },
  dusk: {
    name: 'Palm Dusk',
    sky: ['#062a2a', '#0d5c4d', '#d9a441', '#f4e3b2'],
    sun: '#fff8d6', sunGlow: 'rgba(217,164,65,0.85)',
    tint: ['rgba(13,92,77,0.20)', 'rgba(217,164,65,0.20)'],
    title: ['#ffffff', '#ffe9a8'], accent: '#d9a441',
  },
};

function lerp(a, b, t) { return a + (b - a) * t; }

/** Panel rectangles for a layout inside the poster frame, below the sky strip. */
export function panelRects(layout, w, h, bandH, skyH = 0) {
  const def = LAYOUTS[layout] ?? LAYOUTS.strips;
  const gap = Math.max(8, Math.round(w * 0.012));
  const frame = Math.max(10, Math.round(w * 0.016));
  const areaW = w - frame * 2;
  const areaH = h - frame * 2 - skyH;
  const cw = (areaW - gap * (def.cols - 1)) / def.cols;
  const ch = (areaH - gap * (def.rows - 1)) / def.rows;
  const rects = [];
  for (let r = 0; r < def.rows; r++) {
    for (let c = 0; c < def.cols; c++) {
      rects.push({
        x: frame + c * (cw + gap),
        y: frame + skyH + r * (ch + gap),
        w: cw, h: ch,
      });
    }
  }
  return { rects, gap, frame, bandH };
}

/** Draws one photo into a panel, cover-fit, with the panel's pan/zoom. */
function drawPhoto(ctx, img, rect, t) {
  if (!img) {
    // Empty panel: deep gradient + big "?" sun placeholder, never blank.
    const g = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    g.addColorStop(0, '#3a1c5e'); g.addColorStop(1, '#12081f');
    ctx.fillStyle = g; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `900 ${Math.round(rect.h * 0.35)}px 'Arial Black', Impact, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+', rect.x + rect.w / 2, rect.y + rect.h / 2);
    return;
  }
  const zoom = t.zoom || 1;
  const base = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * base;
  const dh = img.naturalHeight * base;
  const dx = rect.x + (rect.w - dw) / 2 + (t.dx || 0) * rect.w;
  const dy = rect.y + (rect.h - dh) / 2 + (t.dy || 0) * rect.h;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

/** Halftone comic dots fading in towards the bottom of a panel. */
function halftone(ctx, rect, step, colour) {
  const s = Math.max(6, step);
  ctx.fillStyle = colour;
  for (let y = rect.y + rect.h * 0.62; y < rect.y + rect.h; y += s) {
    const depth = (y - (rect.y + rect.h * 0.62)) / (rect.h * 0.38);
    for (let x = rect.x + s / 2; x < rect.x + rect.w; x += s) {
      const r = s * 0.15 * (0.5 + depth);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** A palm-tree silhouette: slim curved trunk + thin drooping fronds. */
function palm(ctx, x, y, size, lean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(lean, 1);
  ctx.fillStyle = '#0a0512';
  ctx.strokeStyle = '#0a0512';
  // Trunk: a slim tapering curve, leaning slightly.
  ctx.beginPath();
  ctx.moveTo(-size * 0.025, 0);
  ctx.quadraticCurveTo(size * 0.01, -size * 0.5, size * 0.07, -size * 0.9);
  ctx.lineTo(size * 0.11, -size * 0.9);
  ctx.quadraticCurveTo(size * 0.05, -size * 0.45, size * 0.035, 0);
  ctx.closePath(); ctx.fill();
  // Fronds: six thin arcs fanning from the crown, arcing up then drooping.
  const cx = size * 0.09, cy = -size * 0.9;
  ctx.lineWidth = Math.max(2, size * 0.022);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.06 + i * 0.176); // 11° .. 169°
    const len = size * (0.52 + (i % 2) * 0.08);
    const ex = cx + Math.cos(a) * len;
    const ey = cy - Math.sin(a) * len * 0.55 + len * 0.34;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, cy - Math.sin(a) * len * 0.62, ex, ey);
    ctx.stroke();
  }
  // Coconuts.
  ctx.beginPath(); ctx.arc(cx - size * 0.02, cy + size * 0.04, size * 0.03, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + size * 0.04, cy + size * 0.05, size * 0.026, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Big condensed title with outline, gradient fill and hard drop shadow. */
function drawTitle(ctx, text, sub, cx, cy, maxW, grade, size) {
  const font = `'Arial Black', Impact, 'Helvetica Neue', sans-serif`;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${Math.round(size * 0.02)}px`;
  let fs = size;
  ctx.font = `900 ${fs}px ${font}`;
  while (ctx.measureText(text).width > maxW && fs > size * 0.45) {
    fs -= 2; ctx.font = `900 ${fs}px ${font}`;
  }
  const grad = ctx.createLinearGradient(0, cy - fs * 0.6, 0, cy + fs * 0.6);
  grad.addColorStop(0, grade.title[0]); grad.addColorStop(1, grade.title[1]);
  ctx.lineJoin = 'round';
  ctx.shadowColor = grade.accent; ctx.shadowBlur = fs * 0.22; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(4, fs * 0.14);
  ctx.strokeText(text, cx, cy);
  ctx.shadowBlur = 0;
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);
  // Hard offset shadow pass for the comic-book punch.
  ctx.restore();
  if (sub) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ss = Math.max(14, Math.round(size * 0.24));
    ctx.font = `700 ${ss}px 'Arial Black', Impact, sans-serif`;
    ctx.letterSpacing = `${Math.round(ss * 0.18)}px`;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(3, ss * 0.16);
    ctx.strokeText(sub.toUpperCase(), cx, cy + fs * 0.62);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(sub.toUpperCase(), cx, cy + fs * 0.62);
    ctx.restore();
  }
}

/**
 * Renders the poster onto `canvas` at exactly (w, h) pixels.
 * `state` follows the shape described at the top of this file.
 */
export function drawCover(canvas, state, w, h) {
  const W = w ?? canvas.width;
  const H = h ?? canvas.height;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  const title = (state.title || 'SUNSET HEIST').toUpperCase();
  const subtitle = state.subtitle || '';
  const bandH = Math.round(H * (state.captionPos === 'top' ? 0.20 : 0.22));

  // 1. Sunset sky over the whole poster.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  grade.sky.forEach((c, i) => sky.addColorStop(i / (grade.sky.length - 1), c));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // 2. Sky strip across the top: the big striped retro sun dips behind the
  // panels, flanked by two palm silhouettes against the sky.
  const frame0 = Math.max(10, Math.round(W * 0.016));
  const skyH = Math.round(H * 0.105);
  const sunR = skyH * 1.05;
  const sunX = W * 0.5, sunY = frame0 + skyH * 0.5;
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 2.4);
  glow.addColorStop(0, grade.sunGlow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, frame0 + skyH * 2);
  ctx.fillStyle = grade.sun;
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
  // Sun stripes (retro sunset slats) across the lower half of the sun.
  ctx.save();
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = grade.sky[1];
  for (let i = 0; i < 3; i++) {
    const y = sunY + sunR * (0.08 + i * 0.28);
    ctx.fillRect(sunX - sunR, y, sunR * 2, sunR * (0.05 + i * 0.025));
  }
  ctx.restore();
  const palmSize = skyH * 0.85;
  palm(ctx, W * 0.045, frame0 + skyH, palmSize, 1);
  palm(ctx, W * 0.955, frame0 + skyH, palmSize * 0.9, -1);

  // 3. Panels: photos, grade tint, halftone, bold black frames.
  const { rects, frame } = panelRects(state.layout, W, H, bandH, skyH);
  const photos = state.photos || [];
  rects.forEach((rect, i) => {
    const t = (state.panels && state.panels[i]) || { photo: 0, dx: 0, dy: 0, zoom: 1 };
    const img = photos.length ? photos[t.photo % photos.length] : null;
    drawPhoto(ctx, img, rect, t);
    // Grade tint wash.
    ctx.save();
    ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
    const tint = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    tint.addColorStop(0, grade.tint[0]); tint.addColorStop(1, grade.tint[1]);
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = tint; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalCompositeOperation = 'source-over';
    halftone(ctx, rect, Math.max(7, W * 0.011), 'rgba(0,0,0,0.20)');
    // Vignette inside the panel.
    const vg = ctx.createRadialGradient(
      rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(rect.w, rect.h) * 0.35,
      rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(rect.w, rect.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    // Bold black frame + thin white inner line (the comic-book edge).
    ctx.lineWidth = Math.max(5, W * 0.007);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.lineWidth = Math.max(1.5, W * 0.0016);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeRect(rect.x + ctx.lineWidth * 3, rect.y + ctx.lineWidth * 3, rect.w - ctx.lineWidth * 6, rect.h - ctx.lineWidth * 6);
  });

  // 4. Caption band: solid black slab with a neon top edge.
  const bandY = state.captionPos === 'top' ? 0 : H - bandH;
  ctx.fillStyle = 'rgba(5,2,12,0.92)';
  ctx.fillRect(0, bandY, W, bandH);
  ctx.fillStyle = grade.accent;
  const edgeY = state.captionPos === 'top' ? bandY + bandH : bandY;
  ctx.fillRect(0, edgeY - Math.max(3, H * 0.004), W, Math.max(3, H * 0.008));
  const titleSize = Math.round(Math.min(W * 0.105, bandH * 0.52));
  drawTitle(ctx, title, subtitle, W / 2, bandY + bandH * 0.46, W * 0.94, grade, titleSize);

  // 5. Outer frame.
  ctx.lineWidth = Math.max(6, W * 0.008);
  ctx.strokeStyle = '#000';
  ctx.strokeRect(frame / 2, frame / 2, W - frame, H - frame);
  return canvas;
}
