# Riffle

Riffle is a browser book viewer for page bitmaps and PDFs. It renders a two-page spread with animated page turns, paper lighting, translucency, show-through, WebGPU when available, and a 2D canvas fallback.

The library returns plain DOM elements and does not impose wrappers or app layout. You decide where the canvas lives, how it scrolls, and how the optional page strip is styled.

## Quick Start

A complete, paste-and-run HTML file:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      /* The viewer sizes itself to its scrollable container. */
      #viewport {
        width: 800px;
        height: 600px;
        overflow: auto;
      }
      /* RifflePageStrip is an empty div that fills with thumbnail children;
         give it a flex row so the thumbnails lay out horizontally. */
      #strip > div {
        display: flex;
        flex-direction: row;
      }
    </style>
  </head>
  <body>
    <input id="file-picker" type="file" accept="application/pdf" />
    <div id="viewport"></div>
    <div id="strip"></div>

    <script type="module">
      import { Riffle, RifflePageStrip } from "https://cdn.jsdelivr.net/gh/RvanB/riffle.js@v0.1.8/dist/riffle.min.js";

      const viewer = Riffle();
      document.getElementById("viewport").appendChild(viewer);
      document.getElementById("strip").appendChild(RifflePageStrip(viewer));

      document.getElementById("file-picker").addEventListener("change", async (e) => {
        await viewer.openPdf(e.target.files[0]);
      });
    </script>
  </body>
</html>
```

Two things the library leaves to you:

- **Size the viewport.** The canvas reads its parent (or nearest scrollable ancestor) to compute its dimensions; give that element an explicit width/height. Pass `Riffle({ viewport: el })` to override the lookup.
- **Lay out the page strip.** `RifflePageStrip` returns an empty `<div>` that fills with one child per page — apply your own flex/grid styling to it.

`dist/pdfWorker.js` must sit next to `dist/riffle.min.js` at runtime. The CDN build resolves it from the same URL path as the library bundle.

## Local Development

```bash
npm install
npm run build
python3 -m http.server 8000
```

Open `http://localhost:8000/` for the demo. While iterating locally, the demo imports `./src/index.js`; production consumers usually import `dist/riffle.min.js`.

## Documentation

Documentation lives alongside the demo on GitHub Pages: [rvanb.github.io/riffle.js/docs](https://rvanb.github.io/riffle.js/docs/). The API reference is generated from JSDoc comments in `src/` by [JSDoc](https://jsdoc.app/) with the [docdash](https://github.com/clenemt/docdash) template, then committed to `docs/` so GitHub Pages can serve it directly.

To rebuild locally:

```bash
npm run docs
```

Releases are cut with `./scripts/release.sh vX.Y.Z`, which rebuilds `dist/` and `docs/`, commits, tags, and pushes.

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
