// Wires the Vice Poster editor: photo slots, samples, layout/grade pickers,
// per-panel pan + zoom, caption editing and PNG export at three post sizes.
// A `?shot=` query sets up a fixed scene for a screenshot instead (./shots.js).
import { drawCover, LAYOUTS } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const status = document.getElementById('status');
const titleInput = document.getElementById('title');
const subtitleInput = document.getElementById('subtitle');
const captionPos = document.getElementById('captionPos');
const zoomInput = document.getElementById('zoom');
const panelHint = document.getElementById('panelHint');

const state = {
  title: titleInput.value,
  subtitle: subtitleInput.value,
  layout: 'strips',
  grade: 'sunset',
  captionPos: 'bottom',
  photos: [],          // loaded Image objects, index 0 = A, 1 = B
  panels: [],          // one transform per panel of the current layout
  selected: 0,
};

function panelCount() {
  const def = LAYOUTS[state.layout];
  return def.cols * def.rows;
}

function ensurePanels() {
  while (state.panels.length < panelCount()) {
    state.panels.push({ photo: state.panels.length % 2, dx: 0, dy: 0, zoom: 1 });
  }
  state.panels.length = panelCount();
  if (state.selected >= state.panels.length) state.selected = 0;
}

function redraw() {
  ensurePanels();
  if (document.body.classList.contains('shot-cover')) {
    drawCover(canvas, state, window.innerWidth, window.innerHeight);
  } else {
    drawCover(canvas, state, 1080, 1080);
  }
  const t = state.panels[state.selected];
  zoomInput.value = String(t.zoom);
  panelHint.textContent =
    `Panel ${state.selected + 1} of ${panelCount()} selected — drag the preview to pan it, use zoom below.`;
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function setPhoto(slot, source, label) {
  try {
    const img = typeof source === 'string' ? await loadImage(source) : source;
    state.photos[slot] = img;
    status.textContent = `${label} loaded — ${img.naturalWidth} x ${img.naturalHeight}px.`;
    redraw();
  } catch {
    status.textContent = `Could not load ${label}. Try another image file.`;
  }
}

function fileToPhoto(slot, file, label) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => setPhoto(slot, reader.result, label);
  reader.readAsDataURL(file);
}

document.getElementById('photoA').addEventListener('change', (e) => {
  fileToPhoto(0, e.target.files[0], 'Photo A');
});
document.getElementById('photoB').addEventListener('change', (e) => {
  fileToPhoto(1, e.target.files[0], 'Photo B');
});

// Drag & drop anywhere on the preview: first drop fills A, second fills B.
canvas.addEventListener('dragover', (e) => e.preventDefault());
canvas.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  const slot = state.photos[0] && !state.photos[1] ? 1 : 0;
  fileToPhoto(slot, file, slot === 0 ? 'Photo A' : 'Photo B');
});

// Sample photos shipped with the app.
document.getElementById('samples').addEventListener('click', async (e) => {
  const sample = e.target.dataset?.sample;
  if (!sample) return;
  if (sample === 'both') {
    await setPhoto(0, 'samples/pier.jpg', 'Sample: pier');
    await setPhoto(1, 'samples/boulevard.jpg', 'Sample: boulevard');
  } else {
    await setPhoto(0, `samples/${sample}.jpg`, `Sample: ${sample}`);
  }
});

// Layout + grade pickers.
document.getElementById('layouts').addEventListener('click', (e) => {
  const layout = e.target.dataset?.layout;
  if (!layout) return;
  state.layout = layout;
  document.querySelectorAll('#layouts button').forEach((b) => b.classList.toggle('on', b === e.target));
  redraw();
});
document.getElementById('grades').addEventListener('click', (e) => {
  const grade = e.target.dataset?.grade;
  if (!grade) return;
  state.grade = grade;
  document.querySelectorAll('#grades button').forEach((b) => b.classList.toggle('on', b === e.target));
  redraw();
});

// Caption inputs.
titleInput.addEventListener('input', () => { state.title = titleInput.value; redraw(); });
subtitleInput.addEventListener('input', () => { state.subtitle = subtitleInput.value; redraw(); });
captionPos.addEventListener('change', () => { state.captionPos = captionPos.value; redraw(); });
zoomInput.addEventListener('input', () => {
  ensurePanels();
  state.panels[state.selected].zoom = Number(zoomInput.value);
  redraw();
});

// Click a panel to select it; drag it to pan the photo inside.
let drag = null;
function panelAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const x = (clientX - r.left) / r.width * 1080;
  const y = (clientY - r.top) / r.height * 1080;
  const def = LAYOUTS[state.layout];
  const gap = Math.max(8, Math.round(1080 * 0.012));
  const frame = Math.max(10, Math.round(1080 * 0.016));
  const skyH = Math.round(1080 * 0.105);
  const cw = (1080 - frame * 2 - gap * (def.cols - 1)) / def.cols;
  const ch = (1080 - frame * 2 - skyH - gap * (def.rows - 1)) / def.rows;
  const c = Math.floor((x - frame) / (cw + gap));
  const rr = Math.floor((y - frame - skyH) / (ch + gap));
  if (c < 0 || c >= def.cols || rr < 0 || rr >= def.rows) return -1;
  return rr * def.cols + c;
}
canvas.addEventListener('pointerdown', (e) => {
  const i = panelAt(e.clientX, e.clientY);
  if (i < 0) return;
  state.selected = i;
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, dx: state.panels[i].dx, dy: state.panels[i].dy };
  redraw();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const r = canvas.getBoundingClientRect();
  const t = state.panels[state.selected];
  t.dx = drag.dx + (e.clientX - drag.x) / r.width;
  t.dy = drag.dy + (e.clientY - drag.y) / r.height;
  t.dx = Math.max(-0.6, Math.min(0.6, t.dx));
  t.dy = Math.max(-0.6, Math.min(0.6, t.dy));
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });

// Export: re-render at the exact post size on an offscreen canvas, then download.
function exportPNG(w, h, name) {
  const off = document.createElement('canvas');
  drawCover(off, state, w, h);
  off.toBlob((blob) => {
    if (!blob) { status.textContent = 'Export failed in this browser.'; return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status.textContent = `Saved ${name} (${w} x ${h}, ${(blob.size / 1024).toFixed(0)} KiB).`;
  }, 'image/png');
}
document.getElementById('expSquare').addEventListener('click', () => exportPNG(1080, 1080, 'vice-poster-1080x1080.png'));
document.getElementById('expPortrait').addEventListener('click', () => exportPNG(1080, 1350, 'vice-poster-1080x1350.png'));
document.getElementById('expWide').addEventListener('click', () => exportPNG(1920, 1080, 'vice-poster-1920x1080.png'));

// Headless verification hook: renders every export size and reports the real
// byte sizes into #selftest (used by ?selftest=1, never by normal users).
window.__renderExport = async (w, h) => {
  const off = document.createElement('canvas');
  drawCover(off, state, w, h);
  const blob = await new Promise((res) => off.toBlob(res, 'image/png'));
  return { w, h, bytes: blob.size, ok: blob.size > 0 && off.width === w && off.height === h };
};

// Boot: screenshot scene, self-test, or the plain editor with a sample photo.
const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  runShot(shot, query, async (sample, text) => {
    if (sample === 'both') {
      state.photos[0] = await loadImage('samples/pier.jpg');
      state.photos[1] = await loadImage('samples/boulevard.jpg');
    } else {
      state.photos[0] = await loadImage(`samples/${sample}.jpg`);
    }
    state.title = text;
    titleInput.value = text;
    redraw();
  });
} else if (query.get('selftest') === '1') {
  (async () => {
    state.photos[0] = await loadImage('samples/pier.jpg');
    state.photos[1] = await loadImage('samples/boulevard.jpg');
    redraw();
    const sizes = [[1080, 1080], [1080, 1350], [1920, 1080]];
    const lines = [];
    for (const [w, h] of sizes) {
      const r = await window.__renderExport(w, h);
      lines.push(`${w}x${h} ok=${r.ok} bytes=${r.bytes}`);
    }
    document.getElementById('selftest').hidden = false;
    document.getElementById('selftest').textContent = lines.join('\n');
    window.__shotReady = true;
  })();
} else {
  loadImage('samples/pier.jpg').then((img) => { state.photos[0] = img; redraw(); }).catch(() => redraw());
  redraw();
}
