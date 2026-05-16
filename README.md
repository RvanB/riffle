# Riffle

Riffle is a browser book viewer for page bitmaps and PDFs. It renders a two-page spread with animated page turns, paper lighting, translucency, show-through, WebGPU when available, and a 2D canvas fallback.

The library returns plain DOM elements and does not impose wrappers or app layout. You decide where the canvas lives, how it scrolls, and how the optional page strip is styled.

## Quick Start

```html
<div id="viewport"></div>
<div id="strip"></div>

<script type="module">
  import { Riffle, RifflePageStrip } from "https://cdn.jsdelivr.net/gh/RvanB/riffle.js@v0.1.8/dist/riffle.min.js";

  const viewer = Riffle({ paperPreset: "natural" });
  document.getElementById("viewport").appendChild(viewer);
  document.getElementById("strip").appendChild(RifflePageStrip(viewer));

  await viewer.openPdf(file);
  viewer.navigateTo(2);
  viewer.adjustZoom(1);
</script>
```

`dist/pdfWorker.js` must sit next to `dist/riffle.min.js` at runtime. The CDN build resolves it from the same URL path as the library bundle.

## Local Development

```bash
npm install
npm run build
python3 -m http.server 8000
```

Open `http://localhost:8000/` for the demo. While iterating locally, the demo imports `./src/index.js`; production consumers usually import `dist/riffle.min.js`.

## Documentation

Documentation is published at [rifflejs.readthedocs.io](https://rifflejs.readthedocs.io/). The API reference is auto-generated from JSDoc comments in `src/` by `npm run docs:api`, then rendered into a static site by [MkDocs](https://www.mkdocs.org/) (with the [Material](https://squidfunk.github.io/mkdocs-material/) theme).

To build the docs locally:

```bash
npm run docs:api
python3 -m venv .venv && source .venv/bin/activate
pip install -r docs/requirements.txt
mkdocs serve
```

## Build Output

```text
dist/
  riffle.min.js
  riffle.min.js.map
  pdfWorker.js
  pdfWorker.js.map
```

To publish through jsDelivr, commit the built `dist/` files, tag a release, and import from:

```js
import { Riffle } from "https://cdn.jsdelivr.net/gh/RvanB/riffle.js@vX.Y.Z/dist/riffle.min.js";
```
