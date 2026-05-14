# riffle

A page-turning book viewer for the web. Renders a sequence of page bitmaps with realistic paper-flip animation, translucency, and show-through. WebGPU when available, 2D canvas fallback.

Riffle is a library — it returns plain DOM elements with no imposed wrappers or styling. The consumer decides layout, padding, scroll behavior, and decoration.

## Quick start

```js
import { Riffle, RifflePageStrip } from "riffle";

const viewer = Riffle({ paperPreset: "natural" });
viewport.appendChild(viewer);             // viewer is a <canvas>
stripContainer.appendChild(RifflePageStrip(viewer));

await viewer.openPdf(file);
viewer.navigateTo(3);
viewer.adjustZoom(1);

viewer.on("spreadchange", ({ spreadIndex }) => { ... });
```

## Public API

### `Riffle(options) → HTMLCanvasElement`

Returns a `<canvas>` with viewer methods stamped on it. Options:

- `paperPreset` — `"natural" | "ivory" | "bright-white"` (or pass an explicit `display.paperColor`).
- `contentBlendMode` — `"multiply"` (default for PDFs with white backgrounds), `"source-over"`, `"screen"`, `"overlay"`.
- `paperThickness`, `paperTextureStrength` — 0–1 lighting knobs.
- `showPageBorder` — toggles a `.show-page-shadow` class on the canvas for consumer CSS.
- `viewport` — element used for zoom math (visible rect + scroll). Defaults to the canvas's nearest scrollable ancestor.
- `renderer` — `"auto"` (default), `"webgpu"`, `"2d"`, or a renderer class.
- `source` — initial `PageSource`. If omitted, call `viewer.setSource(...)` or `viewer.openPdf(...)`.
- `maxHighResPages` — LRU capacity for high-resolution bitmaps (default 8).

Methods on the returned element:

- `openPdf(file)` — load a PDF (File or ArrayBuffer). Adapts paper aspect to the first page.
- `setSource(source)`, `setLayout(layout)`, `setDisplay(display)`, `setShowPageBorder(bool)`, `setViewport(el)`.
- `navigateTo(spreadIndex, preferredPageIndex?)`.
- `adjustZoom(direction)`, `resetZoom()`.
- `on(event, fn)`, `off(event, fn)`.
- `getSpreadGeometry()` — `{ spreadRects, sideStates, margins }`.

Events: `sourcechange`, `spreadchange`, `geometrychange`, `pageready`, `zoomchange`, `animationstart`, `animationend`.

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

The `passthrough` is opaque to the viewer; the renderer looks for bitmap fields on it (`srcCanvas`, `previewCanvas`, `composedDisplayCanvas`, `composedPreviewCanvas`). Update those externally and emit `notifyPageChanged(i)` when content changes.

## Demo

`examples/index.html` is a standalone PDF viewer built on Riffle. Serve the repo root and open `/examples/`.

## Layout

- `src/Riffle.js`, `src/RifflePageStrip.js` — public factories.
- `src/BookViewer.js` — viewer class (state + render orchestration).
- `src/rendering/` — WebGPU + 2D fallback renderers, layout geometry, paper texture.
- `src/loading/` — PDF rasterization worker, LRU bitmap loader.
- `src/controllers/` — page strip, navigation, zoom.
- `src/sources/` — `PageSource`, `ImagePageSource`, `PdfPageSource`.
- `src/model/` — `ViewerBook`, `ViewerPage`, paper presets.
