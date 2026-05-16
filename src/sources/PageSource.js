/**
 * Abstract bridge between a viewer and the underlying page provider.
 *
 * Subclasses provide page count, metadata, preview bitmaps, and high
 * resolution bitmaps. Sources emit `pagechanged` and `pagecountchanged`
 * when those values change.
 */
export class PageSource {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribes to a source event.
   *
   * @param {string} event Event name.
   * @param {Function} fn Listener callback.
   * @returns {Function} Unsubscribe function.
   */
  on(event, fn) {
    let arr = this.listeners.get(event);
    if (!arr) {
      arr = [];
      this.listeners.set(event, arr);
    }
    arr.push(fn);
    return () => this.off(event, fn);
  }

  /**
   * Removes a source event listener.
   *
   * @param {string} event Event name.
   * @param {Function} fn Listener callback.
   * @returns {void}
   */
  off(event, fn) {
    const arr = this.listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }

  /**
   * Emits a source event.
   *
   * @param {string} event Event name.
   * @param {...*} args Event arguments.
   * @returns {void}
   */
  emit(event, ...args) {
    const arr = this.listeners.get(event);
    if (!arr) return;
    for (const fn of arr.slice()) fn(...args);
  }

  /**
   * Emits `pagechanged` for a page index.
   *
   * @param {number} index Page index.
   * @returns {void}
   */
  notifyPageChanged(index) { this.emit("pagechanged", index); }

  /**
   * Emits `pagecountchanged`.
   *
   * @returns {void}
   */
  notifyPageCountChanged() { this.emit("pagecountchanged"); }

  /**
   * Returns the number of pages exposed by this source.
   *
   * @abstract
   * @returns {number} Page count.
   */
  getPageCount() { throw new Error("PageSource.getPageCount not implemented"); }

  /**
   * Returns metadata for a page.
   *
   * @abstract
   * @param {number} _index Page index.
   * @returns {PageMetadata|null} Page metadata.
   */
  getPageMetadata(_index) { throw new Error("PageSource.getPageMetadata not implemented"); }

  /**
   * Returns a preview bitmap for a page.
   *
   * @abstract
   * @param {number} _index Page index.
   * @returns {Promise<CanvasImageSource|null>} Preview bitmap.
   */
  async getPagePreview(_index) { throw new Error("PageSource.getPagePreview not implemented"); }

  /**
   * Returns a high-resolution bitmap for a page.
   *
   * @abstract
   * @param {number} _index Page index.
   * @param {number} _targetEdgePx Requested maximum edge in pixels.
   * @returns {Promise<CanvasImageSource|null>} High-resolution bitmap.
   */
  async getPageHighRes(_index, _targetEdgePx) { throw new Error("PageSource.getPageHighRes not implemented"); }

  /**
   * Releases source-owned resources.
   *
   * @returns {void}
   */
  dispose() {}
}
