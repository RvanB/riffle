import { BookViewer } from "./BookViewer.js";
import { WebGPUSpreadRenderer } from "./rendering/WebGPUSpreadRenderer.js";
import { SpreadRenderer } from "./rendering/SpreadRenderer.js";

function pickRendererClass(option) {
  if (option === "2d") return SpreadRenderer;
  if (option === "webgpu") return WebGPUSpreadRenderer;
  if (option && typeof option === "function") return option;
  return "gpu" in navigator ? WebGPUSpreadRenderer : SpreadRenderer;
}

// Factory: create a Riffle viewer canvas.
//
//   const viewer = Riffle({ paperPreset: "natural" });
//   document.body.appendChild(viewer);     // it's just a <canvas>
//   await viewer.openPdf(file);
//
// The returned value is the <canvas> element itself with viewer methods
// stamped on it (`.openPdf`, `.navigateTo`, `.adjustZoom`, `.on`, etc.).
// Riffle imposes no DOM wrappers or styling — the consumer decides how to
// position, scroll, and style the canvas.
//
// Zoom math reads the canvas's scrollable ancestor for viewport size and
// uses it for scroll positioning. Pass an explicit `viewport` if you want
// a different element (e.g. a non-ancestor) to drive zoom.
export function Riffle({
  renderer = "auto",
  source = null,
  layout = null,
  display = null,
  paperPreset,
  contentBlendMode = "multiply",
  paperThickness,
  paperTextureStrength,
  showPageBorder = true,
  maxHighResPages = 8,
  flyleaves = true,
  viewport = null,
} = {}) {
  const spreadCanvas = document.createElement("canvas");
  spreadCanvas.width = 0;
  spreadCanvas.height = 0;
  spreadCanvas.style.display = "block";

  const rendererClass = pickRendererClass(renderer);
  const bookViewer = new BookViewer({
    spreadCanvas,
    viewport,          // BookViewer falls back to spreadCanvas.parentElement
    rendererClass,
    source,
    layout,
    display,
    paperPreset,
    contentBlendMode,
    paperThickness,
    paperTextureStrength,
    showPageBorder,
    maxHighResPages,
    flyleaves,
  });

  const api = {
    bookViewer,
    get backendName() { return bookViewer.backendName; },
    get contentZoom() { return bookViewer.contentZoom; },
    get renderZoom() { return bookViewer.renderZoom; },
    get currentSpread() { return bookViewer.currentSpread; },
    // The currently-targeted spread including any in-flight animation. Use
    // this for "where are we heading" reads (e.g., relative navigation).
    get effectiveSpread() { return bookViewer.navigationController.getEffectiveSpread(); },
    get numSpreads() { return bookViewer.numSpreads; },
    get isAnimating() { return bookViewer.isAnimating; },
    navigateBy: (delta) => bookViewer.navigateTo(bookViewer.navigationController.getEffectiveSpread() + delta),
    setSource: (s) => bookViewer.setSource(s),
    setLayout: (l) => bookViewer.setLayout(l),
    setDisplay: (d) => bookViewer.setDisplay(d),
    setFlyleaves: (f) => bookViewer.setFlyleaves(f),
    setViewport: (el) => bookViewer.setViewport(el),
    setShowPageBorder: (b) => bookViewer.setShowPageBorder(b),
    navigateTo: (s, p) => bookViewer.navigateTo(s, p),
    spreadIndexForPage: (pageIndex) => bookViewer.book.spreadIndexForPage(pageIndex),
    primaryPageIndexForSpread: (spreadIndex) => bookViewer.book.primaryPageIndexForSpread(spreadIndex),
    sourcePageCount: () => bookViewer.book.sourcePageCount(),
    sourcePageIndexToPageIndex: (sourcePageIndex) => bookViewer.book.sourcePageIndexToPageIndex(sourcePageIndex),
    pageIndexToSourcePageIndex: (pageIndex) => bookViewer.book.pageIndexToSourcePageIndex(pageIndex),
    spreadIndexForSourcePage: (sourcePageIndex) => bookViewer.book.spreadIndexForSourcePage(sourcePageIndex),
    primarySourcePageIndexForSpread: (spreadIndex) => bookViewer.book.primarySourcePageIndexForSpread(spreadIndex),
    adjustZoom: (d) => bookViewer.adjustZoom(d),
    resetZoom: () => bookViewer.resetZoom(),
    redraw: () => bookViewer.redraw(),
    getSpreadGeometry: () => bookViewer.getSpreadGeometry(),
    on: (event, fn) => bookViewer.on(event, fn),
    off: (event, fn) => bookViewer.off(event, fn),
    openPdf: async (file) => {
      const { PdfPageSource } = await import("./sources/PdfPageSource.js");
      const src = new PdfPageSource();
      await src.openPdf(file);
      bookViewer.setSource(src);
      const firstAspect = src.getPageMetadata(0)?.aspectRatio ?? 0.647;
      bookViewer.setLayout({
        pw: bookViewer.layout.ph * firstAspect,
        ratio: firstAspect * 0.999,
      });
    },
  };
  // Use defineProperties so getters stay live — Object.assign would
  // invoke each getter once at copy time and stamp the resulting value,
  // freezing `numSpreads`/`currentSpread`/etc. at construction-time
  // values (back when the book was empty).
  Object.defineProperties(spreadCanvas, Object.getOwnPropertyDescriptors(api));
  return spreadCanvas;
}
