import { PageStrip } from "./controllers/PageStrip.js";

// Factory: create a page-strip element bound to a Riffle viewer.
//
//   const viewer = Riffle();
//   const strip = RifflePageStrip(viewer);
//   document.body.append(viewer, strip);
//
// The returned element is an empty <div> populated with one thumb-per-page
// as the source loads. Riffle imposes no styling — apply your own CSS to
// position and decorate it.
//
// On thumb click, the strip calls `viewer.navigateTo(spread, pageIndex)`.
// Default thumb shape uses class names `strip-thumb`, `strip-thumb canvas`,
// and `strip-thumb.in-spread` for the active spread.
export function RifflePageStrip(viewer) {
  const container = document.createElement("div");
  const bookViewer = viewer.bookViewer ?? viewer;
  const pageStrip = new PageStrip(container, {
    onPageClick: (pageIndex) => {
      const targetSpread = Math.floor((pageIndex + 1) / 2);
      bookViewer.navigateTo(targetSpread, pageIndex);
    },
    getEffectEntry: () => ({ pipeline: [], key: "" }),
    getDisplay: () => bookViewer.display,
    getLayout: () => bookViewer.layout,
  });

  const refresh = () => {
    pageStrip.update(bookViewer.book, {
      appMode: "content",
      effectiveSpread: bookViewer.navigationController.getEffectiveSpread(),
      editingPageIdx: -1,
      selectedPageIdxs: new Set(),
    });
  };

  bookViewer.on("sourcechange", refresh);
  bookViewer.on("spreadchange", refresh);
  bookViewer.on("pageready", ({ pageIndex }) => {
    const page = bookViewer.book.pages[pageIndex];
    if (page) pageStrip.updateThumbnail(pageIndex, page);
  });

  container.pageStrip = pageStrip;
  container.refresh = refresh;
  return container;
}
