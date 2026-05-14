import { PageSource } from "./PageSource.js";
import { loadPdfDocument, getPdfPageAspectRatio } from "../loading/pdfLoader.js";

// A "Page" shaped to match what LazyPageLoader writes to (mutable
// srcCanvas/previewCanvas fields, a `source` describing the backing
// rasterization). The viewer's ViewerPage proxies these via `metadata`.
function makePdfPage(pdfDoc, pageNum, aspectRatio) {
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
    cover: true,
    spread: false,
    fitAxis: "inside",
    contentAlignX: null,
    contentAlignY: null,
    get displayCanvas() { return this.displayCanvasOverride || this.srcCanvas || this.previewCanvas || null; },
    get thumbnailCanvas() { return this.placedPreviewCanvas || this.thumbnailSourceCanvas || this.previewCanvas || this.srcCanvas || null; },
    getCropFor() { return { ...this.crop }; },
    setCropFor(_canvas, crop) { this.crop = { ...this.crop, ...crop }; },
  };
}

// Backs a viewer with a PDF document. The PDF is rasterized lazily by the
// viewer's LazyPageLoader; this source just describes the page set and
// exposes the internal book the loader operates on.
export class PdfPageSource extends PageSource {
  constructor() {
    super();
    this.pdfDoc = null;
    this.pages = [];
    const source = this;
    this.book = {
      get pages() { return source.pages; },
      numSpreads() { return Math.max(1, Math.ceil((source.pages.length + 1) / 2)); },
      spreadPages(spreadIndex) {
        const leftIndex = spreadIndex * 2 - 1;
        const rightIndex = spreadIndex * 2;
        return [
          leftIndex >= 0 ? source.pages[leftIndex] ?? null : null,
          source.pages[rightIndex] ?? null,
        ];
      },
      spreadPageEntries(spreadIndex) {
        const leftIndex = spreadIndex * 2 - 1;
        const rightIndex = spreadIndex * 2;
        return {
          left: {
            page: leftIndex >= 0 ? source.pages[leftIndex] ?? null : null,
            pageIndex: leftIndex,
            showThroughPage: leftIndex - 1 >= 0 ? source.pages[leftIndex - 1] ?? null : null,
          },
          right: {
            page: source.pages[rightIndex] ?? null,
            pageIndex: rightIndex,
            showThroughPage: source.pages[rightIndex + 1] ?? null,
          },
        };
      },
    };
  }

  async openPdf(file) {
    const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const pdfDoc = await loadPdfDocument(buffer);
    this.pdfDoc = pdfDoc;
    const pages = [];
    for (let i = 0; i < pdfDoc.numPages; i++) {
      const aspectRatio = await getPdfPageAspectRatio(pdfDoc, i + 1);
      pages.push(makePdfPage(pdfDoc, i + 1, aspectRatio));
    }
    this.pages = pages;
    this.notifyPageCountChanged();
  }

  getInternalBook() { return this.book; }
  getPageCount() { return this.pages.length; }
  getPageMetadata(index) {
    const page = this.pages[index] ?? null;
    if (!page) return null;
    return { aspectRatio: page.aspectRatio, passthrough: page };
  }
}
