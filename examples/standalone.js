// Standalone PDF viewer demo. Opens any PDF, lays it out at the PDF's own
// paper aspect, and lets the user flip pages with the same animation /
// show-through path as the margin app uses. No margins, crop, or content
// effects — those live in the host (margin) app's composer.

import { BookViewer, ImagePageSource, WebGPUSpreadRenderer, SpreadRenderer } from "../src/index.js";
import { computeMargins } from "../src/rendering/layout.js";
import { loadPdfDocument, getPdfPageAspectRatio } from "../src/loading/pdfLoader.js";
import { applyPaperPreset, DEFAULT_PAPER_PRESET_ID } from "../src/model/paper.js";

// `b` is the textblock-scale knob; with zero margins (mInner = mTop =
// mBottom = 0) the textblock fills the page, but the layout math requires
// `outer = pw - inner - tw > 0`, so the textblock width has to be slightly
// less than the page width. We set the textblock-to-page ratio to ~0.999 so
// the renderer's `margins.ok` check passes while leaving no visible margin.
const DEFAULT_LAYOUT = {
  pw: 5.5, ph: 8.5,
  ratio: 0, b: 1,
  mInner: 0, mTop: 0, mBottom: 0,
};

function ratioForAspect(aspect) {
  // tw / th = ratio. To get tw ≈ pw with th = ph, ratio ≈ pw/ph = aspect.
  // Trim slightly so outer = pw - tw > 0 (renderer guard).
  return aspect * 0.999;
}
// The paper preset fills in lightShadowColor / lightHighlightColor /
// shadowTintColor — the shader uses these to tint diffuse shading. Without
// them all three default to paperColor and the lighting looks flat.
const DEFAULT_DISPLAY = applyPaperPreset(
  {
    // PDFs are rendered with a white background. Multiply blend lets the
    // paper color show through where the PDF page is white (white × paper =
    // paper); ink reproduces as ink × paper. With source-over the white
    // would paint right over the paper.
    contentBlendMode: "multiply",
    paperThickness: 0.5,
    paperTextureStrength: 0.18,
  },
  DEFAULT_PAPER_PRESET_ID,
);

// A "Page" shaped like the margin app's Page so LazyPageLoader can read
// page.source and write page.srcCanvas. ViewerPage proxies through this via
// the metadata.passthrough field.
function makePage(pdfDoc, pageNum, aspectRatio) {
  return {
    source: { type: "pdf", pdfDoc, pageNum },
    aspectRatio,
    srcCanvas: null,
    previewCanvas: null,
    thumbnailSourceCanvas: null,
    displayCanvasOverride: null,
    placedPreviewCanvas: null,
    loading: false,
    loadedPdfRenderScale: 0,
    requestedPdfRenderScale: 0,
    crop: { top: 0, left: 0, right: 0, bottom: 0 },
    cropSourceWidth: 0,
    cropSourceHeight: 0,
    cover: true,        // fill the page; no margins in standalone
    spread: false,
    fitAxis: "inside",
    contentAlignX: null,
    contentAlignY: null,
    interactivePreviewCanvas: null,
    interactivePreviewSourceCanvas: null,
    interactivePreviewMaxEdge: 0,
    get displayCanvas() { return this.displayCanvasOverride || this.srcCanvas || this.previewCanvas || null; },
    get thumbnailCanvas() { return this.placedPreviewCanvas || this.thumbnailSourceCanvas || this.previewCanvas || this.srcCanvas || null; },
    getCropFor() { return { ...this.crop }; },
    setCropFor(_canvas, crop) { this.crop = { ...this.crop, ...crop }; },
  };
}

// The viewer's controllers reach back into an `app` reference for state,
// rendering, and loader plumbing. DemoApp is the smallest object that
// satisfies that surface for a read-only PDF viewer.
class DemoApp {
  constructor() {
    this.spreadCanvas = document.getElementById("spread-canvas");
    this.canvasArea = document.getElementById("canvas-area");
    this.canvasAreaInner = document.getElementById("canvas-area-inner");
    this.canvasStage = document.getElementById("canvas-stage");
    this.canvasWrap = document.getElementById("canvas-wrap");
    // Some controller code paths reach for an overlay canvas. Standalone has
    // no overlay UI, so feed them a throwaway element.
    this.overlayCanvas = document.createElement("canvas");

    // The viewer's LazyPageLoader walks the host book to enumerate
    // spread-aware page indexes, so we mirror Book's tiny surface.
    this.book = {
      layout: { ...DEFAULT_LAYOUT },
      display: { ...DEFAULT_DISPLAY },
      pages: [],
      numSpreads() { return Math.max(1, Math.ceil((this.pages.length + 1) / 2)); },
      spreadPages(spreadIndex) {
        const leftIndex = spreadIndex * 2 - 1;
        const rightIndex = spreadIndex * 2;
        return [
          leftIndex >= 0 ? this.pages[leftIndex] ?? null : null,
          this.pages[rightIndex] ?? null,
        ];
      },
      spreadPageEntries(spreadIndex) {
        const leftIndex = spreadIndex * 2 - 1;
        const rightIndex = spreadIndex * 2;
        return {
          left: {
            page: leftIndex >= 0 ? this.pages[leftIndex] ?? null : null,
            pageIndex: leftIndex,
            showThroughPage: leftIndex - 1 >= 0 ? this.pages[leftIndex - 1] ?? null : null,
          },
          right: {
            page: this.pages[rightIndex] ?? null,
            pageIndex: rightIndex,
            showThroughPage: this.pages[rightIndex + 1] ?? null,
          },
        };
      },
    };
    this.uiState = {
      appMode: "content",
      currentSpread: 0,
      effectiveSpread: 0,
      editingPageIdx: 0,
      selectedPageIdxs: new Set(),
      hoverHandle: null,
      showMarginArrows: false,
      showLayoutContent: true,
      showPageBorder: true,
      showVdG: false,
    };
    this.lastMargins = computeMargins(this.book.layout, 1);

    this.pageSource = new ImagePageSource({
      getPageCount: () => this.book.pages.length,
      getPageMetadata: (index) => {
        const page = this.book.pages[index] ?? null;
        if (!page) return null;
        return { aspectRatio: page.aspectRatio, passthrough: page };
      },
    });

    const rendererClass = "gpu" in navigator ? WebGPUSpreadRenderer : SpreadRenderer;
    this.bookViewer = new BookViewer({
      spreadCanvas: this.spreadCanvas,
      stripContainer: document.getElementById("page-strip"),
      rendererClass,
      app: this,
      source: this.pageSource,
      pageStripCallbacks: {
        onPageClick: (pageIndex) => this.handlePageStripClick(pageIndex),
        getEffectEntry: () => ({ pipeline: [], key: "" }),
        getDisplay: () => this.book.display,
        getLayout: () => this.book.layout,
      },
    });
    this.spreadRenderer = this.bookViewer.spreadRenderer;
    this.lazyPageLoader = this.bookViewer.lazyPageLoader;
    this.pageStrip = this.bookViewer.pageStrip;
    this.navigationController = this.bookViewer.navigationController;
    this.zoomController = this.bookViewer.zoomController;

    // Stubs for the host-side controllers the viewer expects. They're no-ops
    // because standalone has no margin editing, no placed-preview thumbs
    // beyond the raw preview, and no toolbar.
    this.placedPreviewManager = {
      markDirty() {},
      markPagesDirty() {},
      refresh() {},
      refreshAll() {},
      flushDirty() {},
      rememberLayoutKey() {},
      refreshIfLayoutChanged() { return false; },
      beginInteractive() {},
      endInteractive() {},
    };
    this.toolbarController = {
      syncPageUI() {},
      syncBookLayoutFromInputs() {},
      updateComputedRows() {},
      syncMenuState() {},
      restoreLayoutInputs() {},
    };
    this.canvasInteraction = { refreshDragCursor() {} };
    this.spreadComposer = {
      reset: () => {},
      getEffectEntry: () => ({ pipeline: [], key: "" }),
      shouldExposeSpreadRects: () => false,
      shouldShowPlaceholder: () => !this.book.pages.length,
      getRenderableSpreadPages: (spreadIndex) => {
        if (!this.viewerBook.pages.length) return null;
        const entries = this.viewerBook.spreadPageEntries(spreadIndex);
        return {
          left: { ...entries.left, showThroughEffectEntry: { pipeline: [], key: "" } },
          right: { ...entries.right, showThroughEffectEntry: { pipeline: [], key: "" } },
        };
      },
      createSpreadSnapshot: (spreadIndex) => {
        const margins = computeMargins(this.book.layout, this.zoomController.getRenderScale());
        const pages = this.spreadComposer.getRenderableSpreadPages(spreadIndex);
        const effectEntries = {
          left: { pipeline: [], key: "" },
          right: { pipeline: [], key: "" },
        };
        const { canvas } = this.spreadRenderer.snapshot(
          pages, margins, effectEntries, this.book.display,
          { previewZoom: this.renderZoom, showPageBorder: this.uiState.showPageBorder },
        );
        return canvas;
      },
    };
  }

  get viewerBook() { return this.bookViewer.book; }
  get contentZoom() { return this.zoomController.contentZoom; }
  get renderZoom() { return this.zoomController.renderZoom; }

  getEffectEntry() { return { pipeline: [], key: "" }; }
  getInteractionSpreadRects() { return null; }

  onPageReady(pageIndex) {
    const viewerPage = this.viewerBook.pages[pageIndex] ?? null;
    if (this.spreadRenderer.isAnimating) {
      if (viewerPage) this.spreadRenderer.refreshPageSource?.(viewerPage);
      return;
    }
    const { left, right } = this.viewerBook.spreadPageEntries(this.uiState.currentSpread);
    const isOnCurrent = pageIndex === left.pageIndex || pageIndex === right.pageIndex;
    if (isOnCurrent) {
      this.zoomController.applySafeRenderZoom();
      this.redraw();
    }
    this.pageStrip.updateThumbnail?.(pageIndex, viewerPage);
  }

  redraw() {
    const scale = this.zoomController.getRenderScale();
    const margins = computeMargins(this.book.layout, scale);
    this.lastMargins = margins;
    this.uiState.currentSpread = Math.min(this.uiState.currentSpread, this.viewerBook.numSpreads() - 1);
    this.uiState.effectiveSpread = this.navigationController.getEffectiveSpread();

    if (this.viewerBook.pages.length) {
      this.lazyPageLoader.ensureSpreadLoaded(this.uiState.currentSpread, 1, { allowHighRes: false });
    }

    const spreadPages = this.spreadComposer.getRenderableSpreadPages(this.uiState.currentSpread);
    this.bookViewer.render(
      spreadPages,
      margins,
      { left: { pipeline: [], key: "" }, right: { pipeline: [], key: "" } },
      this.book.display,
      { previewZoom: this.renderZoom, showPageBorder: this.uiState.showPageBorder },
    );
    this.zoomController.syncCanvasStage();
    this.pageStrip.update(this.viewerBook, {
      ...this.uiState,
      effectiveSpread: this.navigationController.getEffectiveSpread(),
    });
  }

  schedulePreviewRedraw() {
    if (this.spreadRenderer.isAnimating) return;
    const targetSpread = this.navigationController.getEffectiveSpread();
    if (this.viewerBook.pages.length) {
      this.lazyPageLoader.ensureSpreadLoaded(targetSpread, this.contentZoom, { allowHighRes: true });
    }
    if (this.zoomController.applySafeRenderZoom()) this.redraw();
  }

  handlePageStripClick(pageIndex) {
    const targetSpread = Math.floor((pageIndex + 1) / 2);
    if (Math.abs(targetSpread - this.navigationController.getEffectiveSpread()) > 1) {
      this.navigationController.queueSpreadTurnsTo(targetSpread, pageIndex);
    } else {
      this.navigationController.navigateTo(targetSpread, pageIndex);
    }
  }

  async openPdf(file) {
    setStatus(`Loading ${file.name}…`);
    const pdfDoc = await loadPdfDocument(await file.arrayBuffer());
    const pages = [];
    for (let i = 0; i < pdfDoc.numPages; i++) {
      const aspectRatio = await getPdfPageAspectRatio(pdfDoc, i + 1);
      pages.push(makePage(pdfDoc, i + 1, aspectRatio));
    }
    // Adapt the paper aspect to the first page so the renderer's pageRect
    // matches the PDF's intrinsic dimensions and content isn't stretched.
    const firstAspect = pages[0]?.aspectRatio ?? (DEFAULT_LAYOUT.pw / DEFAULT_LAYOUT.ph);
    this.book.layout = {
      ...DEFAULT_LAYOUT,
      pw: DEFAULT_LAYOUT.ph * firstAspect,
      ratio: ratioForAspect(firstAspect),
    };
    this.book.pages = pages;
    this.uiState.currentSpread = 0;
    this.uiState.effectiveSpread = 0;

    this.pageSource.notifyPageCountChanged();
    this.lazyPageLoader.reset();
    this.lazyPageLoader.ensureSpreadLoaded(0, 1, { allowHighRes: false });
    this.lazyPageLoader.warmAllPreviews();
    this.redraw();
    this.schedulePreviewRedraw();
    setStatus(`${pdfDoc.numPages} page${pdfDoc.numPages === 1 ? "" : "s"} loaded`);
  }
}

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

const app = new DemoApp();

document.getElementById("pdf-input").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    await app.openPdf(file);
  } catch (error) {
    console.error("Failed to open PDF:", error);
    setStatus(`Failed to open PDF: ${error.message}`);
  }
});

document.getElementById("zoom-in").addEventListener("click", () => {
  app.zoomController.adjustContentZoom(1);
});
document.getElementById("zoom-out").addEventListener("click", () => {
  app.zoomController.adjustContentZoom(-1);
});

window.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT") return;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    app.navigationController.navigateTo(app.uiState.currentSpread + 1);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    app.navigationController.navigateTo(app.uiState.currentSpread - 1);
  }
});

setStatus("Choose a PDF to begin.");
