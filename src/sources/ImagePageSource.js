import { PageSource } from "./PageSource.js";

// Callback-driven source for callers (like the margin app) that maintain
// their own page model and want to feed the viewer with bitmaps they've
// composed externally.
//
// Pass an options object with `getPageCount` and `getPageMetadata`. The
// metadata return value is opaque to the viewer beyond `{ aspectRatio,
// passthrough }`; the `passthrough` field becomes `viewerPage.metadata` for
// the renderer to read app-specific placement fields (crop, fitAxis, etc.)
// while Phase 3 is still pending.
//
// `getPagePreview` and `getPageHighRes` are optional for now — when the
// margin app's LazyPageLoader still drives bitmap loading directly into the
// passthrough page, the source isn't asked to materialize bitmaps. They
// become required once Phase 3 makes the viewer pull bitmaps through the
// source.
/**
 * Options for {@link ImagePageSource}.
 *
 * @typedef {Object} ImagePageSourceOptions
 * @property {function():number} getPageCount Returns viewer page count.
 * @property {function(number):PageMetadata|null} getPageMetadata Returns page metadata.
 * @property {function(number):Promise<CanvasImageSource|null>|null} [getPagePreview=null] Optional preview loader.
 * @property {function(number, number):Promise<CanvasImageSource|null>|null} [getPageHighRes=null] Optional high-resolution loader.
 * @property {Object|null} [internalBook=null] Optional mutable book object used directly by Riffle's lazy loader.
 */

/**
 * Callback-driven page source for host-owned page models.
 */
export class ImagePageSource extends PageSource {
  /**
   * @param {ImagePageSourceOptions} options Source callbacks.
   */
  constructor({
    getPageCount,
    getPageMetadata,
    getPagePreview = null,
    getPageHighRes = null,
    internalBook = null,
  }) {
    super();
    this._getPageCount = getPageCount;
    this._getPageMetadata = getPageMetadata;
    this._getPagePreview = getPagePreview;
    this._getPageHighRes = getPageHighRes;
    this._internalBook = internalBook;
  }

  // If the host owns the per-page mutable model that LazyPageLoader writes
  // to (margin's app.book is the canonical example), pass it via
  // `internalBook` — the viewer's lazy loader will operate directly on it.
  // When omitted, the source is bitmap-callback-driven and the viewer won't
  // try to write into a host-owned book.
  /**
   * Returns the optional host-owned mutable book.
   *
   * @returns {Object|null} Internal book, if supplied.
   */
  getInternalBook() { return this._internalBook; }

  /** @returns {number} Page count. */
  getPageCount() { return this._getPageCount(); }

  /**
   * @param {number} index Page index.
   * @returns {PageMetadata|null} Page metadata.
   */
  getPageMetadata(index) { return this._getPageMetadata(index); }

  /**
   * @param {number} index Page index.
   * @returns {Promise<CanvasImageSource|null>} Preview bitmap.
   */
  async getPagePreview(index) {
    return this._getPagePreview ? this._getPagePreview(index) : null;
  }

  /**
   * @param {number} index Page index.
   * @param {number} targetEdgePx Requested maximum edge in pixels.
   * @returns {Promise<CanvasImageSource|null>} High-resolution bitmap.
   */
  async getPageHighRes(index, targetEdgePx) {
    return this._getPageHighRes ? this._getPageHighRes(index, targetEdgePx) : null;
  }
}
