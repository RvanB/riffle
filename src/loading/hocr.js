function hasClass(element, className) {
  return element?.classList?.contains(className);
}

function parseBBox(title = "") {
  const match = /\bbbox\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/.exec(title);
  if (!match) return null;
  const [, left, top, right, bottom] = match.map(Number);
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function getText(element) {
  return (element?.textContent || "").replace(/\s+/g, " ").trim();
}

function getWordElements(pageElement) {
  const words = Array.from(pageElement.querySelectorAll(".ocrx_word"));
  if (words.length) return words;
  return Array.from(pageElement.querySelectorAll(".ocr_word, .ocr_line"))
    .filter(element => getText(element));
}

function pageFromElement(pageElement) {
  const pageBox = parseBBox(pageElement.getAttribute("title") || "");
  const wordElements = getWordElements(pageElement);
  const wordBoxes = wordElements
    .map(element => ({ element, box: parseBBox(element.getAttribute("title") || "") }))
    .filter(({ box }) => box);
  const fallbackBox = pageBox || wordBoxes.reduce((box, word) => {
    if (!box) return { ...word.box };
    box.left = Math.min(box.left, word.box.left);
    box.top = Math.min(box.top, word.box.top);
    box.right = Math.max(box.right, word.box.right);
    box.bottom = Math.max(box.bottom, word.box.bottom);
    box.width = box.right - box.left;
    box.height = box.bottom - box.top;
    return box;
  }, null);
  if (!fallbackBox) return null;

  const items = [];
  for (const { element, box } of wordBoxes) {
    const str = getText(element);
    if (!str) continue;
    const fontHeight = Math.max(1, box.height);
    items.push({
      str,
      dir: element.dir || "ltr",
      fontName: "hocr",
      width: box.width,
      height: fontHeight,
      transform: [fontHeight, 0, 0, fontHeight, box.left, box.top + fontHeight],
    });
  }

  return {
    width: fallbackBox.width,
    height: fallbackBox.height,
    transform: [1, 0, 0, 1, -fallbackBox.left, -fallbackBox.top],
    styles: { hocr: { fontFamily: "", ascent: 1, descent: 0, vertical: false } },
    items,
  };
}

/**
 * Parses hOCR markup into Riffle text-layer pages.
 *
 * @param {string|Document} hocr hOCR markup or a parsed document.
 * @returns {Object[]} Text content pages compatible with Riffle's text layer.
 */
export function parseHocr(hocr) {
  const documentRef = typeof hocr === "string"
    ? new DOMParser().parseFromString(hocr, "text/html")
    : hocr;
  if (!documentRef) return [];
  const pageElements = Array.from(documentRef.querySelectorAll(".ocr_page"));
  const pages = (pageElements.length ? pageElements : [documentRef.body || documentRef.documentElement])
    .filter(element => element && (hasClass(element, "ocr_page") || element.querySelector?.(".ocrx_word, .ocr_word, .ocr_line")))
    .map(pageFromElement)
    .filter(page => page && page.items.length);
  return pages;
}

async function readHocr(input) {
  if (typeof input === "string") return input;
  if (typeof Document !== "undefined" && input instanceof Document) return input;
  if (typeof Blob !== "undefined" && input instanceof Blob) return input.text();
  throw new TypeError("hOCR input must be a string, Document, File, or Blob");
}

/**
 * Reads and parses hOCR markup.
 *
 * @param {string|Document|Blob} input hOCR markup, parsed document, File, or Blob.
 * @returns {Promise<Object[]>} Parsed text content pages.
 */
export async function loadHocr(input) {
  return parseHocr(await readHocr(input));
}
