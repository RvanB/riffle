# riffle

A page-turning book viewer for the web. Renders a sequence of page bitmaps with realistic paper-flip animation, translucency, and show-through. WebGPU when available, 2D canvas fallback.

Riffle is a library — it returns plain DOM elements with no imposed wrappers or styling. The consumer decides layout, padding, scroll behavior, and decoration.

## Install

### From a CDN (no build step)

```html
<script type="module">
  import { Riffle, RifflePageStrip } from "https://cdn.jsdelivr.net/gh/RvanB/riffle@v0.1.1/dist/riffle.min.js";

  const viewer = Riffle({ paperPreset: "natural" });
  document.getElementById("viewport").appendChild(viewer);
  document.getElementById("strip").appendChild(RifflePageStrip(viewer));

  document.getElementById("file").addEventListener("change", e => viewer.openPdf(e.target.files[0]));
</script>
```

`pdfWorker.js` is fetched from the same path next to `riffle.min.js`; the loader wraps it in a same-origin Blob URL so cross-origin worker spawning is allowed. pdf.js itself loads from unpkg inside the worker, no extra setup required.

### From a local clone

```bash
git clone https://github.com/RvanB/riffle.git
cd riffle && npm install && npm run build
```

Then import from `./dist/riffle.min.js` or, while iterating, directly from `./src/index.js`.

## Quick start

```js
import { Riffle, RifflePageStrip } from "riffle";

const viewer = Riffle({ paperPreset: "natural" });
viewport.appendChild(viewer);              // viewer is a <canvas>
stripContainer.appendChild(RifflePageStrip(viewer));

await viewer.openPdf(file);
viewer.navigateTo(3);
viewer.adjustZoom(1);

viewer.on("spreadchange", ({ spreadIndex }) => { /* … */ });
```

## Public API

### `Riffle(options) → HTMLCanvasElement`

Returns a `<canvas>` with viewer methods stamped on it. Options:

- `paperPreset` — `"natural" | "ivory" | "bright-white"` (default `"natural"`). Or pass an explicit `display.paperColor`.
- `contentBlendMode` — `"multiply"` (default), `"source-over"`, `"screen"`, `"overlay"`. Multiply lets paper color show through white PDF backgrounds.
- `paperThickness`, `paperTextureStrength` — 0–1 lighting knobs.
- `showPageBorder` — display the page-edge shadow effect (consumer CSS controls the actual `box-shadow`).
- `viewport` — element used for zoom math (visible rect + scroll position). Defaults to the canvas's nearest scrollable ancestor.
- `renderer` — `"auto"` (default), `"webgpu"`, `"2d"`, or a renderer class.
- `source` — initial `PageSource`. Omit and call `viewer.openPdf(...)` or `viewer.setSource(...)` later.
- `maxHighResPages` — LRU capacity for high-resolution bitmaps (default 8).

Methods on the returned element:

| | |
|---|---|
| `openPdf(file)` | Load a PDF (File or ArrayBuffer). Auto-adapts paper aspect to the first page. |
| `setSource(source)` | Swap to a different `PageSource`. |
| `setLayout(layout)` | Update paper dimensions / textblock ratio. |
| `setDisplay(display)` | Update paper color, blend mode, etc. |
| `setViewport(el)` | Override the element used for zoom math. |
| `setShowPageBorder(bool)` | Toggle the page-shadow class. |
| `navigateTo(spreadIndex, preferredPageIndex?)` | Jump to a spread. Long jumps animate through intermediates. |
| `adjustZoom(direction)` / `resetZoom()` | Step zoom in/out or reset to 1. |
| `getSpreadGeometry()` | `{ spreadRects, sideStates, margins }` for the latest render. |
| `on(event, fn)` / `off(event, fn)` | Subscribe / unsubscribe. |

Events:

- `sourcechange` — new `PageSource` set, page count may have changed.
- `spreadchange` — `{ spreadIndex }` after a turn settles.
- `geometrychange` — `{ spreadRects, sideStates, margins }` after every render.
- `pageready` — `{ pageIndex, animating }` when a bitmap for a page lands.
- `zoomchange` — `{ contentZoom }` after a zoom step.
- `animationstart` / `animationend` — page-turn lifecycle.

### `RifflePageStrip(viewer) → HTMLDivElement`

A page-strip element bound to a viewer. Click navigates. No styling imposed — apply your own CSS to the `.strip-thumb` / `.strip-thumb.in-spread` classes.

## Custom sources

For non-PDF use cases (or to provide pre-composed bitmaps from your own pipeline), implement a `PageSource`:

```js
import { ImagePageSource } from "riffle";

const source = new ImagePageSource({
  getPageCount: () => myPages.length,
  getPageMetadata: (i) => ({
    aspectRatio: myPages[i].aspectRatio,
    passthrough: myPages[i],
  }),
});
viewer.setSource(source);
```

The `passthrough` is opaque to the viewer; the renderer reads bitmap fields from it (`srcCanvas`, `previewCanvas`, `composedDisplayCanvas`, `composedPreviewCanvas`). Update those externally and emit `source.notifyPageChanged(i)` when content changes.

## Demo

`examples/index.html` is a standalone PDF viewer built on Riffle. Serve the repo root and open `/examples/`:

```bash
python3 -m http.server 8000
# open http://localhost:8000/examples/
```

## Build & publish

```bash
npm install
npm run build
```

Produces:

```
dist/
  riffle.min.js         # bundled + minified library
  riffle.min.js.map
  pdfWorker.js          # the PDF worker; needs to sit next to riffle.min.js at runtime
  pdfWorker.js.map
```

To ship via jsDelivr from GitHub: commit the `dist/` directory, tag a release, push the tag.

```bash
git add dist && git commit -m "Build x.y.z"
git tag vX.Y.Z && git push --tags
```

Consumers import from `https://cdn.jsdelivr.net/gh/<user>/riffle@vX.Y.Z/dist/riffle.min.js`.

## Repo layout

- `src/Riffle.js`, `src/RifflePageStrip.js` — public factories.
- `src/BookViewer.js` — viewer class (state + render orchestration + event bus).
- `src/rendering/` — WebGPU + 2D fallback renderers, layout geometry, paper preset.
- `src/loading/` — PDF rasterization worker, LRU bitmap loader.
- `src/controllers/` — page strip, navigation, zoom.
- `src/sources/` — `PageSource`, `ImagePageSource`, `PdfPageSource`.
- `src/model/` — `ViewerBook`, `ViewerPage`, paper appearance helpers.
- `examples/` — standalone PDF viewer demo.
- `dist/` — built bundle (after `npm run build`).
