import { ViewerPage } from "./ViewerPage.js";

// The viewer's view of the book. Mirrors page count + per-page metadata from
// a PageSource. `pages[i]` is a stable ViewerPage whose `metadata` field is
// re-pointed when the source's notifyPageChanged / notifyPageCountChanged
// events fire.
export class ViewerBook {
  constructor(source) {
    this.source = source;
    this.pages = [];
    this.syncAll();
    source.on("pagecountchanged", () => this.syncAll());
    source.on("pagechanged", index => this.syncPage(index));
  }

  syncAll() {
    const count = this.source.getPageCount();
    while (this.pages.length < count) this.pages.push(new ViewerPage());
    if (this.pages.length > count) this.pages.length = count;
    for (let i = 0; i < count; i++) this.syncPage(i);
  }

  syncPage(index) {
    if (index < 0 || index >= this.pages.length) return;
    const meta = this.source.getPageMetadata(index);
    const page = this.pages[index];
    page.aspectRatio = meta?.aspectRatio ?? 1;
    page.metadata = meta?.passthrough ?? meta ?? null;
  }

  numSpreads() {
    if (typeof this.source.numSpreads === "function") return this.source.numSpreads();
    return Math.max(1, Math.ceil((this.pages.length + 1) / 2));
  }

  spreadPages(spreadIndex) {
    const entries = this.spreadPageEntries(spreadIndex);
    return [entries.left.page, entries.right.page];
  }

  sourcePageCount() {
    return this.source.getSourcePageCount?.() ?? this.pages.length;
  }

  sourcePageIndexToPageIndex(sourcePageIndex) {
    if (sourcePageIndex < 0 || sourcePageIndex >= this.sourcePageCount()) return -1;
    return this.source.sourcePageIndexToPageIndex?.(sourcePageIndex) ?? sourcePageIndex;
  }

  pageIndexToSourcePageIndex(pageIndex) {
    if (pageIndex < 0 || pageIndex >= this.pages.length) return -1;
    return this.source.pageIndexToSourcePageIndex?.(pageIndex) ?? pageIndex;
  }

  spreadIndexForSourcePage(sourcePageIndex) {
    return this.spreadIndexForPage(this.sourcePageIndexToPageIndex(sourcePageIndex));
  }

  spreadIndexForPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= this.pages.length) return -1;
    const spreadCount = this.numSpreads();
    for (let spreadIndex = 0; spreadIndex < spreadCount; spreadIndex += 1) {
      const entries = this.spreadPageEntries(spreadIndex);
      if (entries.left.pageIndex === pageIndex || entries.right.pageIndex === pageIndex) return spreadIndex;
    }
    return -1;
  }

  primaryPageIndexForSpread(spreadIndex) {
    const entries = this.spreadPageEntries(spreadIndex);
    if (entries.left.pageIndex >= 0) return entries.left.pageIndex;
    if (entries.right.pageIndex >= 0) return entries.right.pageIndex;
    return -1;
  }

  primarySourcePageIndexForSpread(spreadIndex) {
    const entries = this.spreadPageEntries(spreadIndex);
    for (const pageIndex of [entries.left.pageIndex, entries.right.pageIndex]) {
      const sourcePageIndex = this.pageIndexToSourcePageIndex(pageIndex);
      if (sourcePageIndex >= 0) return sourcePageIndex;
    }
    return -1;
  }

  spreadPageEntries(spreadIndex) {
    if (typeof this.source.spreadPageEntries === "function") {
      return this.#hydrateSpreadEntries(this.source.spreadPageEntries(spreadIndex));
    }
    const leftIndex = spreadIndex * 2 - 1;
    const rightIndex = spreadIndex * 2;
    const leftShowThroughIndex = leftIndex - 1;
    const rightShowThroughIndex = rightIndex + 1;
    return {
      left: {
        page: leftIndex >= 0 ? this.pages[leftIndex] ?? null : null,
        pageIndex: leftIndex,
        showThroughPage: leftShowThroughIndex >= 0
          ? this.pages[leftShowThroughIndex] ?? null
          : null,
      },
      right: {
        page: this.pages[rightIndex] ?? null,
        pageIndex: rightIndex,
        showThroughPage: this.pages[rightShowThroughIndex] ?? null,
      },
    };
  }

  #hydrateSpreadEntries(entries) {
    const hydrate = entry => {
      const pageIndex = entry?.pageIndex ?? -1;
      const showThroughPageIndex = entry?.showThroughPageIndex ?? -1;
      return {
        ...entry,
        page: pageIndex >= 0 ? this.pages[pageIndex] ?? null : null,
        showThroughPage: showThroughPageIndex >= 0 ? this.pages[showThroughPageIndex] ?? null : null,
      };
    };
    return {
      left: hydrate(entries?.left),
      right: hydrate(entries?.right),
    };
  }
}
