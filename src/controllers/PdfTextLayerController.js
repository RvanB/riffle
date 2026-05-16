import { getPdfPageLinkAnnotations, getPdfPageTextContent } from "../loading/pdfLoader.js";

const STYLE_ID = "riffle-pdf-text-layer-style";

function injectTextLayerStyle(documentRef) {
  if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.riffle-pdf-text-layer {
  position: absolute;
  inset: auto;
  z-index: 1;
  overflow: hidden;
  cursor: text;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  transform-origin: 0 0;
  touch-action: none;
}
.riffle-pdf-text-layer[hidden] {
  display: none;
}
.riffle-pdf-text-layer span {
  display: inline-block;
  position: absolute;
  color: transparent;
  cursor: text;
  pointer-events: none;
  line-height: 1;
  white-space: pre;
  user-select: none;
  -webkit-user-select: none;
  transform-origin: 0 0;
}
.riffle-pdf-text-layer.text-visible span {
  color: CanvasText;
}
.riffle-pdf-text-layer span.custom-selected {
  background: linear-gradient(
    to right,
    transparent 0%,
    transparent var(--riffle-selection-left, 0%),
    rgba(82, 142, 255, 0.32) var(--riffle-selection-left, 0%),
    rgba(82, 142, 255, 0.32) var(--riffle-selection-right, 100%),
    transparent var(--riffle-selection-right, 100%),
    transparent 100%
  );
}
.riffle-pdf-link {
  position: absolute;
  display: block;
  cursor: pointer;
  pointer-events: auto;
  background: transparent;
}
.riffle-pdf-link:hover {
  background: rgba(82, 142, 255, 0.12);
}
`;
  documentRef.head.appendChild(style);
}

function multiplyTransform(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function getDisplayScale(canvas) {
  const computedStyle = canvas.ownerDocument?.defaultView?.getComputedStyle(canvas);
  const cssWidth = canvas.clientWidth || parseFloat(canvas.style.width) || parseFloat(computedStyle?.width) || canvas.width || 1;
  const cssHeight = canvas.clientHeight || parseFloat(canvas.style.height) || parseFloat(computedStyle?.height) || canvas.height || 1;
  return {
    x: cssWidth / Math.max(1, canvas.width || cssWidth),
    y: cssHeight / Math.max(1, canvas.height || cssHeight),
    cssWidth,
    cssHeight,
  };
}

function isPdfPage(page) {
  return page?.metadata?.source?.type === "pdf" || page?.source?.type === "pdf";
}

function getPdfSource(page) {
  return page?.metadata?.source ?? page?.source ?? null;
}

function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function normalizeRect(a, b) {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function compareCarets(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.index - b.index;
}

function transformPoint(transform, x, y) {
  return {
    x: transform[0] * x + transform[2] * y + transform[4],
    y: transform[1] * x + transform[3] * y + transform[5],
  };
}

/**
 * DOM text overlay for PDF-backed pages.
 *
 * This is deliberately active only on settled spreads. During animation the
 * canvas is the source of truth, and trying to morph real DOM text with the
 * page turn would make selection unreliable.
 */
export class PdfTextLayerController {
  constructor(viewer) {
    this.viewer = viewer;
    this.layer = null;
    this.renderToken = 0;
    this.resizeObserver = null;
    this.mutationObserver = null;
    this.dragStart = null;
    this.updateDeferred = false;
    this.selectionOptions = { add: false, subtract: false };
    this.selectedSpans = [];
    this.selectedRanges = [];
    this.selectedText = "";
    this.boundUpdate = () => this.update();
    this.boundHide = () => this.hide();
    this.boundPointerDown = event => this.#onPointerDown(event);
    this.boundPointerMove = event => this.#onPointerMove(event);
    this.boundPointerUp = event => this.#onPointerUp(event);
    this.boundCopy = event => this.#onCopy(event);
    this.boundContextMenu = event => this.#onContextMenu(event);
    this.boundLinkClick = event => this.#onLinkClick(event);

    viewer.on("sourcechange", this.boundUpdate);
    viewer.on("geometrychange", this.boundUpdate);
    viewer.on("spreadchange", this.boundUpdate);
    viewer.on("pageready", this.boundUpdate);
    viewer.on("animationstart", this.boundHide);
    viewer.on("animationend", this.boundUpdate);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.boundUpdate);
      this.resizeObserver.observe(viewer.spreadCanvas);
    }
    if (typeof MutationObserver !== "undefined") {
      this.mutationObserver = new MutationObserver(this.boundUpdate);
      this.mutationObserver.observe(viewer.spreadCanvas, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }
  }

  hide() {
    this.renderToken += 1;
    if (this.layer) {
      this.layer.hidden = true;
      this.layer.replaceChildren();
    }
    this.#clearSelection();
  }

  setSelectionOptions(options = {}) {
    this.selectionOptions = {
      ...this.selectionOptions,
      ...options,
    };
  }

  update() {
    if (this.dragStart) {
      this.updateDeferred = true;
      return;
    }
    const { spreadCanvas } = this.viewer;
    if (!spreadCanvas?.ownerDocument || !spreadCanvas.parentElement) return;
    this.#ensureLayer();
    this.#positionLayer();

    if (this.viewer.isAnimating || !this.viewer.book?.pages?.length) {
      this.hide();
      return;
    }

    const geometry = this.viewer.getSpreadGeometry?.();
    const sideStates = geometry?.sideStates;
    if (!sideStates) {
      this.hide();
      return;
    }

    const sides = ["left", "right"]
      .map(sideName => sideStates[sideName])
      .filter(sideState => sideState?.page && sideState?.drawnRect && isPdfPage(sideState.page));
    if (!sides.length) {
      this.hide();
      return;
    }

    const token = ++this.renderToken;
    this.#render(sides, token).catch(error => {
      if (token === this.renderToken) {
        console.warn("[Riffle] Could not render PDF text layer:", error);
        this.hide();
      }
    });
  }

  async #render(sides, token) {
    const fragments = [];
    const order = { value: 0 };
    for (const sideState of sides) {
      const source = getPdfSource(sideState.page);
      if (!source?.pdfDoc || !source.pageNum) continue;
      const [textContent, linkAnnotations] = await Promise.all([
        getPdfPageTextContent(source.pdfDoc, source.pageNum),
        getPdfPageLinkAnnotations(source.pdfDoc, source.pageNum),
      ]);
      if (token !== this.renderToken) return;
      fragments.push(this.#buildPageFragment(sideState, textContent, order));
      fragments.push(this.#buildLinkFragment(sideState, linkAnnotations));
    }
    if (token !== this.renderToken || !this.layer) return;
    const selectionSnapshot = this.#snapshotSelection();
    this.layer.replaceChildren(...fragments);
    this.layer.hidden = fragments.length === 0;
    this.#positionLayer();
    this.#fitTextRuns();
    this.#restoreSelectionSnapshot(selectionSnapshot);
    this.layer.ownerDocument.fonts?.ready?.then(() => {
      if (token === this.renderToken) {
        this.#fitTextRuns();
        this.#restoreSelectionSnapshot(selectionSnapshot);
      }
    });
  }

  #buildPageFragment(sideState, textContent, order) {
    const fragment = this.viewer.spreadCanvas.ownerDocument.createDocumentFragment();
    const viewportTransform = textContent?.transform || [1, 0, 0, -1, 0, textContent?.height || 0];
    const viewportWidth = Math.max(1, textContent?.width || sideState.drawnRect.sw || 1);
    const viewportHeight = Math.max(1, textContent?.height || sideState.drawnRect.sh || 1);
    const scaleX = sideState.drawnRect.w / viewportWidth;
    const scaleY = sideState.drawnRect.h / viewportHeight;
    const styles = textContent?.styles || {};

    for (const item of textContent?.items || []) {
      const style = styles[item.fontName] || null;
      const tx = multiplyTransform(viewportTransform, item.transform);
      const fontHeight = Math.max(1, Math.hypot(tx[2], tx[3]));
      const angle = Math.atan2(tx[1], tx[0]);
      const left = sideState.drawnRect.x + tx[4] * scaleX;
      const top = sideState.drawnRect.y + (tx[5] - fontHeight) * scaleY;
      const fontSize = fontHeight * scaleY;
      const targetWidth = Math.max(0, item.width * scaleX);
      const span = this.viewer.spreadCanvas.ownerDocument.createElement("span");
      span.textContent = item.str;
      span.dir = item.dir || "ltr";
      span.style.left = `${left}px`;
      span.style.top = `${top}px`;
      span.style.fontSize = `${fontSize}px`;
      span.style.height = `${fontSize}px`;
      if (style?.fontFamily) span.style.fontFamily = style.fontFamily;
      const baseScaleX = Math.max(0.01, scaleX / Math.max(scaleY, 0.01));
      span.dataset.angle = String(angle);
      span.dataset.baseScaleX = String(baseScaleX);
      span.dataset.targetWidth = String(targetWidth);
      span.dataset.order = String(order.value);
      order.value += 1;
      span.style.transform = `rotate(${angle}rad) scaleX(${baseScaleX})`;
      fragment.appendChild(span);
    }

    return fragment;
  }

  #buildLinkFragment(sideState, annotations) {
    const fragment = this.viewer.spreadCanvas.ownerDocument.createDocumentFragment();
    const viewportTransform = annotations?.transform || [1, 0, 0, -1, 0, annotations?.height || 0];
    const viewportWidth = Math.max(1, annotations?.width || sideState.drawnRect.sw || 1);
    const viewportHeight = Math.max(1, annotations?.height || sideState.drawnRect.sh || 1);
    const scaleX = sideState.drawnRect.w / viewportWidth;
    const scaleY = sideState.drawnRect.h / viewportHeight;

    for (const link of annotations?.links || []) {
      const [x1, y1, x2, y2] = link.rect || [];
      if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
      const p1 = transformPoint(viewportTransform, x1, y1);
      const p2 = transformPoint(viewportTransform, x2, y2);
      const left = sideState.drawnRect.x + Math.min(p1.x, p2.x) * scaleX;
      const top = sideState.drawnRect.y + Math.min(p1.y, p2.y) * scaleY;
      const width = Math.abs(p2.x - p1.x) * scaleX;
      const height = Math.abs(p2.y - p1.y) * scaleY;
      if (width <= 0 || height <= 0) continue;

      const anchor = this.viewer.spreadCanvas.ownerDocument.createElement("a");
      anchor.className = "riffle-pdf-link";
      anchor.style.left = `${left}px`;
      anchor.style.top = `${top}px`;
      anchor.style.width = `${width}px`;
      anchor.style.height = `${height}px`;
      anchor.setAttribute("aria-label", link.title || link.url || "PDF link");
      if (link.url) {
        anchor.href = link.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
      } else if (link.destPageNum) {
        anchor.href = "#";
        anchor.dataset.destPageNum = String(link.destPageNum);
      } else {
        continue;
      }
      fragment.appendChild(anchor);
    }

    return fragment;
  }

  #fitTextRuns() {
    if (!this.layer || this.layer.hidden) return;
    for (const span of this.layer.querySelectorAll("span")) {
      const targetWidth = Number(span.dataset.targetWidth) || 0;
      const baseScaleX = Number(span.dataset.baseScaleX) || 1;
      const angle = Number(span.dataset.angle) || 0;
      const naturalWidth = span.offsetWidth || 0;
      const fittedScaleX = targetWidth > 0 && naturalWidth > 0
        ? baseScaleX * targetWidth / naturalWidth
        : baseScaleX;
      span.style.transform = `rotate(${angle}rad) scaleX(${Math.max(0.01, fittedScaleX)})`;
    }
  }

  #ensureLayer() {
    if (this.layer) return;
    const { spreadCanvas } = this.viewer;
    const documentRef = spreadCanvas.ownerDocument;
    injectTextLayerStyle(documentRef);
    if (documentRef.defaultView?.getComputedStyle(spreadCanvas.parentElement).position === "static") {
      spreadCanvas.parentElement.style.position = "relative";
    }
    this.layer = documentRef.createElement("div");
    this.layer.className = "riffle-pdf-text-layer";
    this.layer.hidden = true;
    this.layer.addEventListener("pointerdown", this.boundPointerDown);
    this.layer.addEventListener("pointermove", this.boundPointerMove);
    this.layer.addEventListener("pointerup", this.boundPointerUp);
    this.layer.addEventListener("pointercancel", this.boundPointerUp);
    this.layer.addEventListener("contextmenu", this.boundContextMenu);
    this.layer.addEventListener("click", this.boundLinkClick);
    documentRef.addEventListener("contextmenu", this.boundContextMenu, true);
    documentRef.addEventListener("copy", this.boundCopy);
    spreadCanvas.parentElement.appendChild(this.layer);
  }

  #onPointerDown(event) {
    if (!this.layer || this.layer.hidden || (event.button !== 0 && event.button !== 2)) return;
    if (event.button === 0 && event.target.closest?.(".riffle-pdf-link")) return;
    event.preventDefault();
    this.layer.ownerDocument.getSelection?.()?.removeAllRanges();
    this.renderToken += 1;
    const caret = this.#getCaretAtPoint(event.clientX, event.clientY);
    this.dragStart = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      caret,
      mode: event.button === 2 ? "rect" : "stream",
      add: !!this.selectionOptions.add,
      subtract: !!this.selectionOptions.subtract,
      baseRanges: (this.selectionOptions.add || this.selectionOptions.subtract) ? this.selectedRanges.slice() : [],
    };
    this.layer.setPointerCapture?.(event.pointerId);
    if (!this.dragStart.add && !this.dragStart.subtract) this.#clearSelection();
  }

  #onPointerMove(event) {
    if (!this.dragStart || event.pointerId !== this.dragStart.pointerId) return;
    event.preventDefault();
    const selectionRect = normalizeRect(this.dragStart, { x: event.clientX, y: event.clientY });
    const options = {
      add: this.dragStart.add,
      subtract: this.dragStart.subtract,
      baseRanges: this.dragStart.baseRanges,
    };
    if (this.dragStart.mode === "rect") {
      this.#selectWithinRect(selectionRect, options);
      return;
    }
    this.#selectBetweenCarets(
      this.dragStart.caret,
      this.#getCaretAtPoint(event.clientX, event.clientY),
      options,
    );
  }

  #onPointerUp(event) {
    if (!this.dragStart || event.pointerId !== this.dragStart.pointerId) return;
    event.preventDefault();
    this.layer?.releasePointerCapture?.(event.pointerId);
    this.dragStart = null;
    if (this.updateDeferred) {
      this.updateDeferred = false;
      if (!this.selectedRanges.length) this.update();
    }
  }

  #onContextMenu(event) {
    if (!this.layer || this.layer.hidden) return;
    const rect = this.layer.getBoundingClientRect();
    if (
      event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom
    ) return;
    event.preventDefault();
    event.stopPropagation();
  }

  #onLinkClick(event) {
    const link = event.target.closest?.(".riffle-pdf-link");
    if (!link || !this.layer?.contains(link)) return;
    const destPageNum = Number(link.dataset.destPageNum) || 0;
    if (!destPageNum) return;
    event.preventDefault();
    const sourcePageIndex = destPageNum - 1;
    const spreadIndex = this.viewer.book.spreadIndexForSourcePage(sourcePageIndex);
    const pageIndex = this.viewer.book.sourcePageIndexToPageIndex(sourcePageIndex);
    if (spreadIndex >= 0) this.viewer.navigateTo(spreadIndex, pageIndex);
  }

  #getOrderedSpans() {
    if (!this.layer) return [];
    return Array.from(this.layer.querySelectorAll("span"))
      .sort((a, b) => (Number(a.dataset.order) || 0) - (Number(b.dataset.order) || 0));
  }

  #getCaretAtPoint(x, y) {
    const spans = this.#getOrderedSpans();
    if (!spans.length) return null;

    let best = null;
    for (const span of spans) {
      const rect = span.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const ySlack = Math.max(2, rect.height * 0.45);
      const withinY = y >= rect.top - ySlack && y <= rect.bottom + ySlack;
      const yDistance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      const xDistance = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      const score = (withinY ? 0 : 100000) + yDistance * 32 + xDistance;
      if (!best || score < best.score) best = { span, rect, score };
    }

    if (!best) return null;
    const chars = Array.from(best.span.textContent || "");
    const fraction = best.rect.width > 0
      ? clamp((x - best.rect.left) / best.rect.width, 0, 1)
      : 0;
    return {
      span: best.span,
      order: Number(best.span.dataset.order) || 0,
      index: clamp(Math.round(fraction * chars.length), 0, chars.length),
    };
  }

  #selectBetweenCarets(anchor, focus, options = {}, selectionRect) {
    if (!this.layer || !anchor || !focus) return;
    const [start, end] = compareCarets(anchor, focus) <= 0
      ? [anchor, focus]
      : [focus, anchor];
    const selectedRanges = [];
    for (const span of this.#getOrderedSpans()) {
      const selection = this.#getSpanSelection(span, start, end, selectionRect);
      if (selection) selectedRanges.push(selection);
    }
    this.#setSelectedRanges(selectedRanges, options);
  }

  #selectWithinRect(selectionRect, options = {}) {
    if (!this.layer) return;
    const selectedRanges = [];
    for (const span of this.#getOrderedSpans()) {
      const selection = this.#getSpanSelectionForRect(span, selectionRect);
      if (selection) selectedRanges.push(selection);
    }
    this.#setSelectedRanges(selectedRanges, options);
  }

  #setSelectedRanges(ranges, options = {}) {
    const selectedRanges = options.subtract
      ? this.#subtractRanges(options.baseRanges || [], ranges)
      : options.add
        ? this.#mergeRanges([...(options.baseRanges || []), ...ranges])
        : this.#mergeRanges(ranges);
    this.#applySelectedRanges(selectedRanges);
  }

  #applySelectedRanges(selectedRanges) {
    for (const span of this.#getOrderedSpans()) {
      const selection = selectedRanges.find(range => range.span === span) || null;
      span.classList.toggle("custom-selected", !!selection);
      if (selection) {
        span.style.setProperty("--riffle-selection-left", `${selection.leftPercent}%`);
        span.style.setProperty("--riffle-selection-right", `${selection.rightPercent}%`);
      } else {
        span.style.removeProperty("--riffle-selection-left");
        span.style.removeProperty("--riffle-selection-right");
      }
    }
    this.selectedSpans = selectedRanges.map(range => range.span);
    this.selectedRanges = selectedRanges;
    this.selectedText = this.#buildSelectedText(selectedRanges);
  }

  #mergeRanges(ranges) {
    const bySpan = new Map();
    for (const range of ranges) {
      const chars = Array.from(range.span.textContent || "");
      if (!chars.length) continue;
      const current = bySpan.get(range.span);
      const startIndex = range.startIndex ?? clamp(Math.floor((range.leftPercent / 100) * chars.length), 0, chars.length);
      const endIndex = range.endIndex ?? clamp(Math.ceil((range.rightPercent / 100) * chars.length), 0, chars.length);
      if (!current) {
        bySpan.set(range.span, { startIndex, endIndex, rect: range.rect || range.span.getBoundingClientRect() });
        continue;
      }
      current.startIndex = Math.min(current.startIndex, startIndex);
      current.endIndex = Math.max(current.endIndex, endIndex);
    }

    return Array.from(bySpan.entries())
      .map(([span, range]) => {
        const chars = Array.from(span.textContent || "");
        return {
          span,
          text: chars.slice(range.startIndex, range.endIndex).join(""),
          rect: range.rect,
          startIndex: range.startIndex,
          endIndex: range.endIndex,
          leftPercent: chars.length ? (range.startIndex / chars.length) * 100 : 0,
          rightPercent: chars.length ? (range.endIndex / chars.length) * 100 : 0,
        };
      })
      .sort((a, b) => (Number(a.span.dataset.order) || 0) - (Number(b.span.dataset.order) || 0));
  }

  #subtractRanges(baseRanges, subtractRanges) {
    const subtractBySpan = new Map();
    for (const range of subtractRanges) {
      const spanRanges = subtractBySpan.get(range.span) || [];
      spanRanges.push(this.#getRangeIndices(range));
      subtractBySpan.set(range.span, spanRanges);
    }

    const remainingRanges = [];
    for (const baseRange of baseRanges) {
      const span = baseRange.span;
      const chars = Array.from(span.textContent || "");
      if (!chars.length) continue;

      let segments = [this.#getRangeIndices(baseRange)];
      for (const cut of subtractBySpan.get(span) || []) {
        const nextSegments = [];
        for (const segment of segments) {
          if (cut.endIndex <= segment.startIndex || cut.startIndex >= segment.endIndex) {
            nextSegments.push(segment);
            continue;
          }
          if (cut.startIndex > segment.startIndex) {
            nextSegments.push({ startIndex: segment.startIndex, endIndex: cut.startIndex });
          }
          if (cut.endIndex < segment.endIndex) {
            nextSegments.push({ startIndex: cut.endIndex, endIndex: segment.endIndex });
          }
        }
        segments = nextSegments;
      }

      for (const segment of segments) {
        if (segment.endIndex <= segment.startIndex) continue;
        remainingRanges.push({
          span,
          text: chars.slice(segment.startIndex, segment.endIndex).join(""),
          rect: span.getBoundingClientRect(),
          startIndex: segment.startIndex,
          endIndex: segment.endIndex,
          leftPercent: (segment.startIndex / chars.length) * 100,
          rightPercent: (segment.endIndex / chars.length) * 100,
        });
      }
    }

    return remainingRanges
      .sort((a, b) => (Number(a.span.dataset.order) || 0) - (Number(b.span.dataset.order) || 0));
  }

  #getRangeIndices(range) {
    const chars = Array.from(range.span.textContent || "");
    return {
      startIndex: range.startIndex ?? clamp(Math.floor((range.leftPercent / 100) * chars.length), 0, chars.length),
      endIndex: range.endIndex ?? clamp(Math.ceil((range.rightPercent / 100) * chars.length), 0, chars.length),
    };
  }

  #getSpanSelection(span, start, end, selectionRect) {
    const rect = span.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (selectionRect && !rectsIntersect(rect, selectionRect)) return null;

    const chars = Array.from(span.textContent || "");
    if (!chars.length) return null;

    const order = Number(span.dataset.order) || 0;
    if (order < start.order || order > end.order) return null;
    const startIndex = order === start.order ? start.index : 0;
    const endIndex = order === end.order ? end.index : chars.length;
    if (endIndex <= startIndex) return null;
    const leftFraction = startIndex / chars.length;
    const rightFraction = endIndex / chars.length;

    return {
      span,
      text: chars.slice(startIndex, endIndex).join(""),
      rect,
      startIndex,
      endIndex,
      leftPercent: leftFraction * 100,
      rightPercent: rightFraction * 100,
    };
  }

  #getSpanSelectionForRect(span, selectionRect) {
    const rect = span.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !rectsIntersect(rect, selectionRect)) return null;

    const chars = Array.from(span.textContent || "");
    if (!chars.length) return null;

    const leftFraction = clamp((selectionRect.left - rect.left) / rect.width, 0, 1);
    const rightFraction = clamp((selectionRect.right - rect.left) / rect.width, 0, 1);
    if (rightFraction <= leftFraction) return null;

    const startIndex = clamp(Math.floor(leftFraction * chars.length), 0, chars.length);
    const endIndex = clamp(Math.ceil(rightFraction * chars.length), 0, chars.length);
    if (endIndex <= startIndex) return null;

    return {
      span,
      text: chars.slice(startIndex, endIndex).join(""),
      rect,
      startIndex,
      endIndex,
      leftPercent: leftFraction * 100,
      rightPercent: rightFraction * 100,
    };
  }

  #clearSelection() {
    for (const span of this.selectedSpans) {
      span.classList.remove("custom-selected");
      span.style.removeProperty("--riffle-selection-left");
      span.style.removeProperty("--riffle-selection-right");
    }
    this.selectedSpans = [];
    this.selectedRanges = [];
    this.selectedText = "";
  }

  #snapshotSelection() {
    return this.selectedRanges.map(range => ({
      order: Number(range.span.dataset.order) || 0,
      startIndex: range.startIndex ?? 0,
      endIndex: range.endIndex ?? Array.from(range.span.textContent || "").length,
    }));
  }

  #restoreSelectionSnapshot(snapshot) {
    if (!snapshot.length) {
      this.#clearSelection();
      return;
    }

    const spansByOrder = new Map(this.#getOrderedSpans().map(span => [Number(span.dataset.order) || 0, span]));
    const restoredRanges = [];
    for (const item of snapshot) {
      const span = spansByOrder.get(item.order);
      if (!span) continue;
      const chars = Array.from(span.textContent || "");
      if (!chars.length) continue;
      const startIndex = clamp(item.startIndex, 0, chars.length);
      const endIndex = clamp(item.endIndex, 0, chars.length);
      if (endIndex <= startIndex) continue;
      restoredRanges.push({
        span,
        text: chars.slice(startIndex, endIndex).join(""),
        rect: span.getBoundingClientRect(),
        startIndex,
        endIndex,
        leftPercent: (startIndex / chars.length) * 100,
        rightPercent: (endIndex / chars.length) * 100,
      });
    }
    this.#applySelectedRanges(restoredRanges);
  }

  #buildSelectedText(ranges) {
    let text = "";
    let previousRect = null;
    for (const range of ranges) {
      const rect = range.rect;
      if (previousRect && Math.abs(rect.top - previousRect.top) > Math.max(6, previousRect.height * 0.7)) {
        text = text.replace(/[ \t]+$/u, "");
        if (text && !text.endsWith("\n")) text += "\n";
      }
      text += range.text;
      previousRect = rect;
    }
    return text;
  }

  #onCopy(event) {
    if (!this.selectedText) return;
    event.clipboardData?.setData("text/plain", this.selectedText);
    event.preventDefault();
  }

  #positionLayer() {
    if (!this.layer) return;
    const { spreadCanvas } = this.viewer;
    const computedStyle = spreadCanvas.ownerDocument.defaultView?.getComputedStyle(spreadCanvas);
    const canvasHidden = computedStyle?.display === "none";
    const scale = getDisplayScale(spreadCanvas);
    this.layer.classList.toggle("text-visible", canvasHidden);

    if (canvasHidden) {
      this.layer.style.position = "relative";
      this.layer.style.left = "";
      this.layer.style.top = "";
      this.layer.style.width = `${Math.max(1, spreadCanvas.width)}px`;
      this.layer.style.height = `${Math.max(1, spreadCanvas.height)}px`;
      this.layer.style.transform = `scale(${scale.x}, ${scale.y})`;
      return;
    }

    this.layer.style.position = "absolute";
    this.layer.style.left = `${spreadCanvas.offsetLeft}px`;
    this.layer.style.top = `${spreadCanvas.offsetTop}px`;
    this.layer.style.width = `${Math.max(1, spreadCanvas.width)}px`;
    this.layer.style.height = `${Math.max(1, spreadCanvas.height)}px`;
    this.layer.style.transform = `scale(${scale.x}, ${scale.y})`;
  }
}
