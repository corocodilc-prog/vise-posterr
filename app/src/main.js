// Wires the Vice Poster editor: photo upload, sample photos, caption and
// subtitle inputs, shot presets, export-size picker, live preview and PNG
// export. The page renders once on load (boulevard sample) and re-renders
// on every change; a render is cheap canvas work, so no debouncing is
// needed. A broken or unreadable photo falls back to the procedural scene.

import { renderPoster, exportPng } from './cover.js';
import { SHOTS, DEFAULT_SHOT_ID, shotById } from './shots.js';

const canvas = document.getElementById('poster');
const photoInput = document.getElementById('photo');
const captionInput = document.getElementById('caption');
const subtitleInput = document.getElementById('subtitle');
const shotsBox = document.getElementById('shots');
const exportBtn = document.getElementById('export');
const sampleButtons = [...document.querySelectorAll('.sample')];

let photo = null; // HTMLImageElement once a photo (upload or sample) loads
let shot = shotById(DEFAULT_SHOT_ID);
let size = '1080x1080';

function currentSize() {
  const picked = document.querySelector('input[name="size"]:checked');
  return picked ? picked.value : size;
}

function render() {
  const [w, h] = currentSize().split('x').map(Number);
  try {
    renderPoster(canvas, {
      photo,
      caption: captionInput.value,
      subtitle: subtitleInput.value,
      shot,
      width: w,
      height: h,
    });
  } catch (err) {
    console.error('render failed, retrying without photo', err);
    photo = null;
    renderPoster(canvas, {
      photo: null,
      caption: captionInput.value,
      subtitle: subtitleInput.value,
      shot,
      width: w,
      height: h,
    });
  }
}

/** Loads an image URL into `photo` (or clears it on failure) and re-renders. */
function loadPhoto(src, fromSample) {
  const img = new Image();
  img.onload = () => {
    photo = img;
    if (fromSample) {
      sampleButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sample === src)));
    }
    render();
  };
  img.onerror = () => {
    photo = null;
    render();
  };
  img.src = src;
}

// Shot preset buttons.
for (const preset of SHOTS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = preset.label;
  btn.setAttribute('aria-pressed', String(preset.id === shot.id));
  btn.addEventListener('click', () => {
    shot = preset;
    shotsBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    captionInput.value = preset.caption;
    subtitleInput.value = preset.subtitle;
    render();
  });
  shotsBox.appendChild(btn);
}

photoInput.addEventListener('change', () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    photo = img;
    URL.revokeObjectURL(url);
    sampleButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    render();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    photo = null;
    render();
  };
  img.src = url;
});

sampleButtons.forEach((btn) => {
  btn.addEventListener('click', () => loadPhoto(btn.dataset.sample, true));
});

captionInput.addEventListener('input', render);
subtitleInput.addEventListener('input', render);
document.querySelectorAll('input[name="size"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    size = currentSize();
    render();
  });
});

exportBtn.addEventListener('click', () => {
  render();
  exportPng(canvas, captionInput.value);
});

// First paint: the boulevard sample, so the page never opens empty.
loadPhoto('samples/boulevard.jpg', true);
