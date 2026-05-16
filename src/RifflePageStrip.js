import { PageStrip } from "./controllers/PageStrip.js";

/**
 * Creates a thumbnail page strip bound to a Riffle viewer.
 *
 * The returned element is an empty `div` populated with one thumbnail per
 * page as the source loads. The strip emits class names only; consumers own
 * all layout and styling.
 *
 * @param {RiffleCanvas|BookViewer} viewer Viewer canvas returned by {@link Riffle}, or a {@link BookViewer}.
 * @returns {HTMLDivElement} Page strip element. It also has `pageStrip` and `refresh` properties.
 */
export function RifflePageStrip(viewer) {
  const container = document.createElement("div");
  const bookViewer = viewer.bookViewer ?? viewer;
  const pageStrip = new PageStrip(container, {
    onPageClick: (pageIndex) => {
      bookViewer.navigateTo(bookViewer.book.spreadIndexForPage(pageIndex), pageIndex);
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
  // Scroll-track the in-flight target so the strip moves WITH the page
  // turn instead of waiting for it to settle.
  bookViewer.on("effectivespreadchange", refresh);
  bookViewer.on("pageready", ({ pageIndex }) => {
    const page = bookViewer.book.pages[pageIndex];
    if (page) pageStrip.updateThumbnail(pageIndex, page);
  });

  container.pageStrip = pageStrip;
  container.refresh = refresh;
  return container;
}
