import { PageSource } from "./PageSource.js";

function makeBlankCanvas() {
  const canvas = typeof document !== "undefined"
    ? document.createElement("canvas")
    : new OffscreenCanvas(1, 1);
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1, 1);
  return canvas;
}

function makeBlankPage(canvas, role) {
  return {
    source: { type: "flyleaf", role },
    aspectRatio: 1,
    srcCanvas: canvas,
    previewCanvas: canvas,
    thumbnailSourceCanvas: canvas,
    displayCanvasOverride: null,
    placedPreviewCanvas: null,
    loading: false,
    crop: { top: 0, left: 0, right: 0, bottom: 0 },
    cropSourceWidth: 0,
    cropSourceHeight: 0,
    cover: false,
    spread: false,
    fitAxis: "inside",
    contentAlignX: "center",
    contentAlignY: "center",
    get displayCanvas() { return this.displayCanvasOverride || this.srcCanvas || this.previewCanvas || null; },
    get thumbnailCanvas() { return this.placedPreviewCanvas || this.thumbnailSourceCanvas || this.previewCanvas || this.srcCanvas || null; },
    get rawDisplayCanvas() { return this.srcCanvas || this.previewCanvas || null; },
    get rawPreviewCanvas() { return this.previewCanvas || this.thumbnailSourceCanvas || null; },
    getCropFor() { return { ...this.crop }; },
    setCropFor(_canvas, crop) { this.crop = { ...this.crop, ...crop }; },
  };
}


function linearSpreadEntries(pageCount, spreadIndex) {
  const leftIndex = spreadIndex * 2;
  const rightIndex = leftIndex + 1;
  return {
    left: {
      pageIndex: leftIndex < pageCount ? leftIndex : -1,
      showThroughPageIndex: leftIndex - 1 >= 0 ? leftIndex - 1 : -1,
    },
    right: {
      pageIndex: rightIndex < pageCount ? rightIndex : -1,
      showThroughPageIndex: rightIndex + 1 < pageCount ? rightIndex + 1 : -1,
    },
  };
}

function makeBookProxy(source, frontPages, backPages) {
  const internalBook = source.getInternalBook?.() ?? null;
  if (!internalBook) return null;
  const getPages = () => [
    ...frontPages,
    ...internalBook.pages,
    ...backPages,
  ];
  return {
    get pages() { return getPages(); },
    numSpreads() { return Math.max(1, Math.ceil(getPages().length / 2)); },
    spreadPages(spreadIndex) {
      const pages = getPages();
      const entries = linearSpreadEntries(pages.length, spreadIndex);
      return [
        entries.left.pageIndex >= 0 ? pages[entries.left.pageIndex] ?? null : null,
        entries.right.pageIndex >= 0 ? pages[entries.right.pageIndex] ?? null : null,
      ];
    },
    spreadPageEntries(spreadIndex) {
      const pages = getPages();
      const entries = linearSpreadEntries(pages.length, spreadIndex);
      return {
        left: {
          ...entries.left,
          page: entries.left.pageIndex >= 0 ? pages[entries.left.pageIndex] ?? null : null,
          showThroughPage: entries.left.showThroughPageIndex >= 0 ? pages[entries.left.showThroughPageIndex] ?? null : null,
        },
        right: {
          ...entries.right,
          page: entries.right.pageIndex >= 0 ? pages[entries.right.pageIndex] ?? null : null,
          showThroughPage: entries.right.showThroughPageIndex >= 0 ? pages[entries.right.showThroughPageIndex] ?? null : null,
        },
      };
    },
  };
}

export class FlyleafPageSource extends PageSource {
  constructor(source, { front = 0, back = 1 } = {}) {
    super();
    this.source = source;
    const canvas = makeBlankCanvas();
    this.frontPages = Array.from({ length: Math.max(0, front) }, (_, index) => makeBlankPage(canvas, index === 0 ? "front" : "front-extra"));
    this.backPages = Array.from({ length: Math.max(0, back) }, (_, index) => makeBlankPage(canvas, index === 0 ? "back" : "back-extra"));
    this.book = makeBookProxy(source, this.frontPages, this.backPages);
    source.on?.("pagecountchanged", () => this.notifyPageCountChanged());
    source.on?.("pagechanged", index => this.notifyPageChanged(index + this.frontPages.length));
  }

  getInternalBook() { return this.book; }
  getPageCount() { return this.frontPages.length + this.source.getPageCount() + this.backPages.length; }
  getSourcePageCount() { return this.source.getSourcePageCount?.() ?? this.source.getPageCount(); }
  sourcePageIndexToPageIndex(sourcePageIndex) {
    const pageIndex = this.source.sourcePageIndexToPageIndex?.(sourcePageIndex) ?? sourcePageIndex;
    return pageIndex >= 0 ? pageIndex + this.frontPages.length : -1;
  }
  pageIndexToSourcePageIndex(pageIndex) {
    const sourcePageIndex = pageIndex - this.frontPages.length;
    if (sourcePageIndex < 0 || sourcePageIndex >= this.source.getPageCount()) return -1;
    return this.source.pageIndexToSourcePageIndex?.(sourcePageIndex) ?? sourcePageIndex;
  }
  numSpreads() { return Math.max(1, Math.ceil(this.getPageCount() / 2)); }
  spreadPages(spreadIndex) {
    const entries = this.spreadPageEntries(spreadIndex);
    return [
      entries.left.pageIndex >= 0 ? this.getPageMetadata(entries.left.pageIndex)?.passthrough ?? null : null,
      entries.right.pageIndex >= 0 ? this.getPageMetadata(entries.right.pageIndex)?.passthrough ?? null : null,
    ];
  }
  spreadPageEntries(spreadIndex) { return linearSpreadEntries(this.getPageCount(), spreadIndex); }

  getPageMetadata(index) {
    if (index < this.frontPages.length) {
      const page = this.frontPages[index];
      return { aspectRatio: page.aspectRatio, passthrough: page };
    }
    const sourceIndex = index - this.frontPages.length;
    if (sourceIndex < this.source.getPageCount()) return this.source.getPageMetadata(sourceIndex);
    const page = this.backPages[sourceIndex - this.source.getPageCount()] ?? null;
    return page ? { aspectRatio: page.aspectRatio, passthrough: page } : null;
  }

  async getPagePreview(index) {
    const blank = this.#getBlankPage(index);
    if (blank) return blank.previewCanvas;
    return this.source.getPagePreview(index - this.frontPages.length);
  }

  async getPageHighRes(index, targetEdgePx) {
    const blank = this.#getBlankPage(index);
    if (blank) return blank.displayCanvas;
    return this.source.getPageHighRes(index - this.frontPages.length, targetEdgePx);
  }

  #getBlankPage(index) {
    if (index < this.frontPages.length) return this.frontPages[index] ?? null;
    const sourceIndex = index - this.frontPages.length;
    if (sourceIndex >= this.source.getPageCount()) return this.backPages[sourceIndex - this.source.getPageCount()] ?? null;
    return null;
  }
}
