import { LazyPageLoader } from "./loading/LazyPageLoader.js";
import { NavigationController } from "./controllers/NavigationController.js";
import { ZoomController } from "./controllers/ZoomController.js";
import { ViewerBook } from "./model/ViewerBook.js";
import { FlyleafPageSource } from "./sources/FlyleafPageSource.js";
import { computeMargins } from "./rendering/layout.js";
import { applyPaperPreset, DEFAULT_PAPER_PRESET_ID } from "./model/paper.js";

const DEFAULT_LAYOUT = {
  pw: 5.5, ph: 8.5,
  ratio: 0, b: 1,
  mInner: 0, mTop: 0, mBottom: 0,
};

// BookViewer is the renderer-facing entrypoint. Hosts (the Riffle factory,
// or a margin-style integrator) supply the canvas elements and a PageSource;
// BookViewer drives navigation, page-turn animation, show-through, the LRU
// bitmap cache, and broadcasts events the host can hook into.
//
// All state lives here — there's no longer a back-reference to a host app.
// Controllers (NavigationController, ZoomController) read this object's
// fields directly.
export class BookViewer {
  constructor({
    spreadCanvas,
    viewport = null,
    rendererClass,
    source = null,
    layout = null,
    display = null,
    paperPreset = DEFAULT_PAPER_PRESET_ID,
    contentBlendMode = "multiply",
    paperThickness = 0.5,
    paperTextureStrength = 0.18,
    showPageBorder = true,
    maxHighResPages = 8,
    flyleaves = true,
  } = {}) {
    if (!spreadCanvas) throw new Error("BookViewer: spreadCanvas is required");
    if (!rendererClass) throw new Error("BookViewer: rendererClass is required");

    // The renderer draws into `spreadCanvas`. CSS sizing for zoom is applied
    // to the canvas itself. `viewport` is a separate element used for zoom
    // math (its bounding rect is the visible area, its scrollLeft/Top is
    // adjusted on zoom). If not passed, ZoomController falls back to the
    // canvas's nearest scrollable ancestor.
    this.spreadCanvas = spreadCanvas;
    this.viewport = viewport;

    // Viewer state (replaces the app.uiState the controllers used to read).
    this.layout = layout ? { ...DEFAULT_LAYOUT, ...layout } : { ...DEFAULT_LAYOUT };
    this.display = applyPaperPreset({
      contentBlendMode,
      paperThickness,
      paperTextureStrength,
      ...display,
    }, paperPreset);
    this.showPageBorder = showPageBorder;
    this.flyleaves = flyleaves;
    this.currentSpread = 0;
    this.effectiveSpread = 0;
    this.lastMargins = computeMargins(this.layout, 1);

    // Public reactive surface.
    this.listeners = new Map();
    this.latestGeometry = null;
    this.source = null;
    this.rawSource = null;
    this.book = new ViewerBook({ getPageCount: () => 0, getPageMetadata: () => null, on: () => () => {} });

    // Renderer + loaders.
    this.spreadRenderer = new rendererClass(spreadCanvas);
    this.lazyPageLoader = new LazyPageLoader(this.#loaderBook(), pageIndex => this.#onPageReady(pageIndex), { maxHighResPages });

    // Controllers — they read fields off `this` (the viewer).
    this.navigationController = new NavigationController(this);
    this.zoomController = new ZoomController(this);

    if (source) this.setSource(source);
  }

  // ---- public API ----

  get backendName() { return this.spreadRenderer.backendName; }
  get contentZoom() { return this.zoomController.contentZoom; }
  get renderZoom() { return this.zoomController.renderZoom; }
  get isAnimating() { return this.spreadRenderer.isAnimating; }
  get numSpreads() { return this.book.numSpreads(); }
  get viewerBook() { return this.book; }   // alias for legacy host code

  setSource(source) {
    this.rawSource = source;
    const viewerSource = this.flyleaves
      ? new FlyleafPageSource(source, typeof this.flyleaves === "object" ? this.flyleaves : undefined)
      : source;
    this.source = viewerSource;
    this.book = new ViewerBook(viewerSource);
    // LazyPageLoader operates on a book-shaped object whose pages are mutable
    // (it writes srcCanvas/previewCanvas onto them). We give it the source's
    // own internal book if available, else fall back to a derived passthrough.
    this.lazyPageLoader.book = viewerSource.getInternalBook?.() ?? this.#loaderBook();
    this.currentSpread = 0;
    this.effectiveSpread = 0;
    this.lazyPageLoader.reset();
    if (this.book.pages.length) {
      this.lazyPageLoader.ensureSpreadLoaded(0, 1, { allowHighRes: false });
      this.lazyPageLoader.warmAllPreviews();
    }
    this.redraw();
    this.schedulePreviewRedraw();
    this.emit("sourcechange", { source });
  }

  setLayout(layout) {
    this.layout = { ...this.layout, ...layout };
    this.redraw();
  }

  setDisplay(display) {
    this.display = { ...this.display, ...display };
    this.redraw();
  }

  setFlyleaves(flyleaves) {
    this.flyleaves = flyleaves;
    if (this.rawSource) {
      this.setSource(this.rawSource);
    } else {
      this.redraw();
      this.emit("sourcechange", { source: null });
    }
  }

  setShowPageBorder(show) {
    this.showPageBorder = !!show;
    this.zoomController.syncCanvasStage();
    this.redraw();
  }

  setViewport(viewport) {
    this.viewport = viewport;
    this.redraw();
  }

  navigateTo(spreadIndex, preferredPageIndex = null) {
    const target = Math.max(0, Math.min(spreadIndex, this.numSpreads - 1));
    const distance = Math.abs(target - this.navigationController.getEffectiveSpread());
    if (distance > 1) {
      this.navigationController.queueSpreadTurnsTo(target, preferredPageIndex);
    } else {
      this.navigationController.navigateTo(target, preferredPageIndex);
    }
  }

  adjustZoom(direction) { this.zoomController.adjustContentZoom(direction); }
  resetZoom() { this.zoomController.resetContentZoom(); }

  on(event, fn) {
    let arr = this.listeners.get(event);
    if (!arr) { arr = []; this.listeners.set(event, arr); }
    arr.push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const arr = this.listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }

  getSpreadGeometry() { return this.latestGeometry; }

  // ---- internal ----

  redraw() {
    if (!this.spreadRenderer || !this.book) return;
    const scale = this.zoomController.getRenderScale();
    const margins = computeMargins(this.layout, scale);
    this.lastMargins = margins;
    this.currentSpread = Math.min(this.currentSpread, Math.max(0, this.numSpreads - 1));
    this.effectiveSpread = this.navigationController.getEffectiveSpread();

    if (this.book.pages.length) {
      this.lazyPageLoader.ensureSpreadLoaded(this.currentSpread, 1, { allowHighRes: false });
    }

    const spreadPages = this.#renderableSpreadPages(this.currentSpread);
    const result = this.spreadRenderer.render(
      spreadPages,
      margins,
      { left: { pipeline: [], key: "" }, right: { pipeline: [], key: "" } },
      this.display,
      {
        showPlaceholder: !this.book.pages.length,
        previewZoom: this.renderZoom,
        showPageBorder: this.showPageBorder,
      }
    );
    this.latestGeometry = {
      spreadRects: result?.spreadRects ?? null,
      sideStates: result?.sideStates ?? null,
      margins,
    };
    this.zoomController.syncCanvasStage();
    this.emit("geometrychange", this.latestGeometry);
  }

  schedulePreviewRedraw() {
    if (this.spreadRenderer.isAnimating) return;
    const targetSpread = this.navigationController.getEffectiveSpread();
    if (this.book.pages.length) {
      this.lazyPageLoader.ensureSpreadLoaded(targetSpread, this.contentZoom, { allowHighRes: true });
      this.#prefetchAdjacentHighRes(targetSpread);
    }
    if (this.zoomController.applySafeRenderZoom()) this.redraw();
  }

  // Build a renderable-spread payload for the renderer's render() call.
  #renderableSpreadPages(spreadIndex) {
    if (!this.book.pages.length) return null;
    const entries = this.book.spreadPageEntries(spreadIndex);
    return {
      left: { ...entries.left, showThroughEffectEntry: { pipeline: [], key: "" } },
      right: { ...entries.right, showThroughEffectEntry: { pipeline: [], key: "" } },
    };
  }

  #prefetchAdjacentHighRes(targetSpread) {
    const numSpreads = this.numSpreads;
    for (const adj of [targetSpread - 1, targetSpread + 1]) {
      if (adj < 0 || adj >= numSpreads) continue;
      const { left, right } = this.book.spreadPageEntries(adj);
      for (const pageIndex of [left.pageIndex, right.pageIndex]) {
        if (pageIndex < 0) continue;
        if (this.lazyPageLoader.isPageHighResReady(pageIndex, this.contentZoom)) continue;
        this.lazyPageLoader.ensurePageHighRes(pageIndex, this.contentZoom, { priority: false });
      }
    }
  }

  // Snapshot a spread to a canvas for queued multi-spread animations.
  createSpreadSnapshot(spreadIndex) {
    const margins = computeMargins(this.layout, this.zoomController.getRenderScale());
    const pages = this.#renderableSpreadPages(spreadIndex);
    const { canvas } = this.spreadRenderer.snapshot(
      pages,
      margins,
      { left: { pipeline: [], key: "" }, right: { pipeline: [], key: "" } },
      this.display,
      { previewZoom: this.renderZoom, showPageBorder: this.showPageBorder },
    );
    return canvas;
  }

  #onPageReady(pageIndex) {
    const viewerPage = this.book.pages[pageIndex] ?? null;
    if (this.spreadRenderer.isAnimating) {
      // Let host code (composition pipelines, thumbnail managers) react to
      // the fresh bitmap before the renderer reads through ViewerPage's
      // getter chain.
      this.emit("pageready", { pageIndex, animating: true });
      if (viewerPage) this.spreadRenderer.refreshPageSource?.(viewerPage);
      return;
    }
    // Emit first so host listeners can populate composed canvases / placed
    // previews before the redraw samples ViewerPage.displayCanvas.
    this.emit("pageready", { pageIndex, animating: false });
    const { left, right } = this.book.spreadPageEntries(this.currentSpread);
    const isOnCurrent = pageIndex === left.pageIndex || pageIndex === right.pageIndex;
    if (isOnCurrent) {
      this.zoomController.applySafeRenderZoom();
      this.redraw();
    }
  }

  #loaderBook() {
    // LazyPageLoader expects book.numSpreads() / book.spreadPageEntries() /
    // book.pages — and writes srcCanvas etc. onto the page objects. Our
    // ViewerBook returns ViewerPage instances whose bitmap fields are
    // getters delegating to metadata. If the source provides its own
    // internal book (via getInternalBook), prefer that; otherwise build a
    // minimal proxy that walks the source's passthrough pages.
    if (this.source?.getInternalBook) return this.source.getInternalBook();
    return {
      get pages() { return []; },
      numSpreads() { return 1; },
      spreadPageEntries() { return { left: { page: null, pageIndex: -1, showThroughPage: null }, right: { page: null, pageIndex: -1, showThroughPage: null } }; },
    };
  }

  emit(event, ...args) {
    const arr = this.listeners.get(event);
    if (!arr) return;
    for (const fn of arr.slice()) fn(...args);
  }
}
