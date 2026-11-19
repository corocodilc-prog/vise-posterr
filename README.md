# Vice Poster — GTA-style Cover Maker

[![make.fun](https://img.shields.io/badge/make.fun-gta6--cover--art--01-ff2e88)](https://make.fun/competitions/gta6-cover-art-01)
[![owner](https://img.shields.io/badge/owner-corocodilc--prog-blue)](https://github.com/corocodilc-prog/vise-posterr)
[![repo](https://img.shields.io/badge/repo-vise--posterr-green)](https://github.com/corocodilc-prog/vise-posterr)

Turn your photo and a caption into a multi-panel GTA 6-poster-style cover —
a Vice City sunset (or neon night) with bold comic lettering — and export it
as a PNG ready to post. Fully offline: no uploads, no network requests, no
external fonts. All art is drawn in code on canvas.

## Use it

Serve the app and open it in desktop Chrome:

```sh
node serve.ts
# app/ is on http://localhost:8080
```

1. **Photos** — pick Photo A and/or Photo B from your machine, drag & drop
   onto the preview, or use the built-in samples (Pier / Boulevard / Both).
   One photo fills every panel; two photos alternate across panels.
2. **Layout** — 3 vertical strips, a 2 × 2 grid, or a 6-panel comic grid.
   Click a panel in the preview to select it, drag to pan the photo inside
   it, and use the zoom slider.
3. **Colour grade** — Vice Sunset (orange/pink/purple), Neon Night
   (cyan/magenta), or Palm Dusk (teal/gold).
4. **Caption** — edit the title and subtitle; choose the caption band at the
   bottom or the top. Lettering is bold condensed type with a black outline
   and neon glow.
5. **Export PNG** — 1080 × 1080, 1080 × 1350, or 1920 × 1080. The file is
   rendered on your machine and downloaded; nothing is uploaded.

## How the poster is drawn

`app/src/cover.js` is the renderer. For every export it paints, in code:

- a gradient sunset sky with a big striped retro sun and glow;
- the photos cover-fit into bold black-framed panels, washed with the
  chosen colour grade, with halftone comic-dot shading and a vignette;
- palm-tree silhouettes climbing in from the bottom corners;
- a black caption band with a neon edge and big outlined title lettering.

No Rockstar logo, artwork, character, or font is used. Lettering uses the
system stack (`Arial Black`, Impact, sans-serif) only.

## Files

| File | What it is |
| --- | --- |
| `app/index.html` | Editor page: controls + live preview canvas |
| `app/style.css` | Dark editor chrome; cover scene hides the controls |
| `app/src/cover.js` | The poster renderer (layouts, grades, palms, halftone, title) |
| `app/src/main.js` | Editor wiring: uploads, drag & drop, pan/zoom, export |
| `app/src/shots.js` | `?shot=cover` / `?shot=editor` screenshot scenes |
| `app/samples/` | Two sample photos shipped with the app, free to use |
| `main.ts` | Entry program: copies `app/` + `screenshots/` to `/output`, writes `dossier.json` |
| `shots.json` | Screenshot definitions (4 shots) |
| `screenshots/` | The 4 entry screenshots; the first by name is the cover |

## Screenshots

1. `1-cover.png` — exported 1920 × 1080-style cover, "Sunset Heist", pier photo.
2. `2-editor.png` — the editor with a photo loaded, "Boulevard Queen".
3. `3-cover-square.png` — 1080 × 1080 cover, comic-6 layout, both samples.
4. `4-cover-portrait.png` — 1080 × 1350-style cover, Palm Dusk grade.

## Verify locally

```sh
node serve.ts
# then in a browser open http://localhost:8080/?selftest=1
# (renders all three export sizes and reports their byte sizes)

mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# exits 0, writes out/dossier.json; run twice into two dirs and diff -r
# to confirm the output is deterministic.
```

## License

MIT — see `LICENSE`.
