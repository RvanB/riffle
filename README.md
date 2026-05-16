# Riffle

Riffle is a browser book viewer for page bitmaps and PDFs. It renders a two-page spread with animated page turns with paper lighting and translucency.

The library returns plain DOM elements and does not impose wrappers or app layout. You decide where the canvas lives, how it scrolls, and how the optional page strip is styled.

- [Live demo](https://rvanb.github.io/riffle.js/)
- [API reference](https://rvanb.github.io/riffle.js/docs/)

![Riffle viewer screenshot](https://media.githubusercontent.com/media/RvanB/riffle.js/refs/heads/main/artifacts/riffle.png)

*A screenshot of [the demo](https://rvanbronkhorst.com/riffle.js/) — view its [source](https://github.com/RvanB/riffle.js/blob/main/index.html).*

## Quick Start

A minimal, paste-and-run HTML file:

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


