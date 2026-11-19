// Fixed scenes for screenshots.
//   ?shot=cover  — the poster alone, fullscreen, no controls. `photo` picks the
//                  sample (pier / boulevard / both), `caption` the title words,
//                  `layout` and `grade` override the defaults. The canvas is
//                  sized to the viewport, so the screenshot shows the poster at
//                  the window's own aspect ratio.
//   ?shot=editor — the full editor with a sample photo already loaded.
// window.__shotReady is set once the scene has painted (two animation frames).
export async function runShot(shot, query, load) {
  const photo = query.get('photo') ?? 'pier';
  const caption = query.get('caption') ?? 'Sunset Heist';
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const layout = query.get('layout');
  const grade = query.get('grade');
  if (layout) document.querySelector(`#layouts [data-layout="${layout}"]`)?.click();
  if (grade) document.querySelector(`#grades [data-grade="${grade}"]`)?.click();
  await load(photo, caption);
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
