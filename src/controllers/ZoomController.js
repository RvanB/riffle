import { computeMargins, computeScale } from "../rendering/layout.js";

const CONTENT_ZOOM_MIN = 0.5;
const CONTENT_ZOOM_MAX = 6;
const CONTENT_ZOOM_STEP = 1.25;
const MAX_RENDER_CANVAS_EDGE = 8192;

function findScrollableAncestor(node) {
  let el = node?.parentElement ?? null;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return node?.parentElement ?? null;
}

// Owns content/render zoom. Reads viewer.spreadCanvas + viewer.viewport for
// sizing math, sets CSS dimensions directly on the canvas to display it at
// the current zoom level. No DOM wrappers required.
export class ZoomController {
  constructor(viewer) {
    this.viewer = viewer;
    this.contentZoom = 1;
    this.renderZoom = 1;
  }

  #resolveViewport() {
    return this.viewer.viewport ?? findScrollableAncestor(this.viewer.spreadCanvas);
  }

  getCanvasViewportSize() {
    const viewport = this.#resolveViewport();
    const rect = viewport?.getBoundingClientRect();
    return {
      width: Math.max(1, rect?.width ?? 1),
      height: Math.max(1, rect?.height ?? 1),
    };
  }

  getRenderScale() {
    const viewport = this.getCanvasViewportSize();
    const containerWidth = Math.max(1, viewport.width - 64);
    const containerHeight = Math.max(1, viewport.height - 64);
    const baseScale = computeScale(this.viewer.layout, containerWidth, containerHeight);
    return baseScale * this.renderZoom;
  }

  getSafeRenderZoom(targetZoom = this.contentZoom) {
    const viewport = this.getCanvasViewportSize();
    const containerWidth = Math.max(1, viewport.width - 64);
    const containerHeight = Math.max(1, viewport.height - 64);
    const baseScale = computeScale(this.viewer.layout, containerWidth, containerHeight);
    const baseMargins = computeMargins(this.viewer.layout, baseScale);
    const maxWidthZoom = (2 * baseMargins.pagePxW) > 0
      ? MAX_RENDER_CANVAS_EDGE / (2 * baseMargins.pagePxW)
      : targetZoom;
    const maxHeightZoom = baseMargins.pagePxH > 0
      ? MAX_RENDER_CANVAS_EDGE / baseMargins.pagePxH
      : targetZoom;
    return Math.max(CONTENT_ZOOM_MIN, Math.min(targetZoom, maxWidthZoom, maxHeightZoom));
  }

  // Sets CSS width/height on the spread canvas so it displays at the
  // requested content zoom (the canvas's pixel buffer is sized for the
  // current renderZoom; the CSS scaling adjusts the displayed size).
  syncCanvasStage() {
    const { spreadCanvas } = this.viewer;
    if (!spreadCanvas) return;
    const displayScale = this.renderZoom > 0 ? this.contentZoom / this.renderZoom : this.contentZoom;
    const cssW = `${Math.max(1, Math.round(spreadCanvas.width * displayScale))}px`;
    const cssH = `${Math.max(1, Math.round(spreadCanvas.height * displayScale))}px`;
    if (spreadCanvas.style.width !== cssW) spreadCanvas.style.width = cssW;
    if (spreadCanvas.style.height !== cssH) spreadCanvas.style.height = cssH;
  }

  #zoomTo(nextZoom) {
    if (Math.abs(nextZoom - this.contentZoom) < 0.0001) return;
    const viewport = this.#resolveViewport();
    const viewportWidth = viewport?.clientWidth ?? 0;
    const viewportHeight = viewport?.clientHeight ?? 0;
    const centerX = (viewport?.scrollLeft ?? 0) + viewportWidth / 2;
    const centerY = (viewport?.scrollTop ?? 0) + viewportHeight / 2;
    const zoomRatio = nextZoom / this.contentZoom;

    this.contentZoom = nextZoom;
    this.syncCanvasStage();
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollLeft = Math.max(0, centerX * zoomRatio - viewportWidth / 2);
        viewport.scrollTop = Math.max(0, centerY * zoomRatio - viewportHeight / 2);
      });
    }
    this.#requestHighResAtCurrentZoom();
    this.viewer.emit("zoomchange", { contentZoom: this.contentZoom });
  }

  #requestHighResAtCurrentZoom() {
    const v = this.viewer;
    const targetSpread = v.navigationController.getEffectiveSpread();
    if (targetSpread < 0 || targetSpread >= v.book.numSpreads()) return;
    const { left, right } = v.book.spreadPageEntries(targetSpread);
    for (const pageIndex of [left.pageIndex, right.pageIndex]) {
      if (pageIndex < 0) continue;
      if (v.lazyPageLoader.isPageHighResReady(pageIndex, this.contentZoom)) continue;
      v.lazyPageLoader.ensurePageHighRes(pageIndex, this.contentZoom);
    }
  }

  adjustContentZoom(direction) {
    const multiplier = direction > 0 ? CONTENT_ZOOM_STEP : 1 / CONTENT_ZOOM_STEP;
    const nextZoom = Math.max(CONTENT_ZOOM_MIN, Math.min(CONTENT_ZOOM_MAX, this.contentZoom * multiplier));
    this.#zoomTo(nextZoom);
  }

  resetContentZoom() {
    this.#zoomTo(1);
  }

  applySafeRenderZoom() {
    const next = this.getSafeRenderZoom(this.contentZoom);
    if (Math.abs(this.renderZoom - next) < 0.0001) return false;
    this.renderZoom = next;
    return true;
  }

  isSpreadHighResReady(spreadIndex, previewZoom = this.contentZoom) {
    const v = this.viewer;
    if (spreadIndex < 0 || spreadIndex >= v.book.numSpreads()) return true;
    const { left, right } = v.book.spreadPageEntries(spreadIndex);
    return [left.pageIndex, right.pageIndex]
      .filter(index => index >= 0)
      .every(index => v.lazyPageLoader.isPageHighResReady(index, previewZoom));
  }
}
