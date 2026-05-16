let worker = null;
let workerPromise = null;
let nextRequestId = 1;
const pending = new Map();

// Main-thread dispatch queue. We send at most one request to the worker at a
// time so that newly-arriving high-priority requests (e.g. high-res renders
// for a destination spread the user just navigated to) can jump ahead of a
// long FIFO of low-priority preview renders.
const highPriorityQueue = [];
const lowPriorityQueue = [];
let inFlight = 0;
const MAX_IN_FLIGHT = 1;

async function createWorker() {
  const workerUrl = new URL("./pdfWorker.js", import.meta.url);
  let scriptUrl;
  if (workerUrl.origin === self.location.origin) {
    // Same origin (dev mode or self-hosted): load the worker file directly.
    // Cache-bust per page load — Firefox in particular caches module
    // workers aggressively and hard-reload doesn't always invalidate them.
    workerUrl.searchParams.set("v", String(Date.now()));
    scriptUrl = workerUrl.href;
  } else {
    // Cross-origin (CDN-hosted): browsers refuse to spawn a Worker from a
    // different origin even with permissive CORS. Fetch the worker source
    // and wrap it in a same-origin Blob URL.
    const response = await fetch(workerUrl, { mode: "cors" });
    if (!response.ok) throw new Error(`Failed to fetch pdfWorker.js: ${response.status}`);
    const source = await response.text();
    const blob = new Blob([source], { type: "application/javascript" });
    scriptUrl = URL.createObjectURL(blob);
  }
  const w = new Worker(scriptUrl, { type: "module" });
  w.addEventListener("message", event => {
    if (event.data?.debug) { console.log("[worker]", ...event.data.debug); return; }
    const { id, ok, result, error } = event.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    inFlight = Math.max(0, inFlight - 1);
    if (ok) entry.resolve(result);
    else entry.reject(new Error(error));
    dispatch();
  });
  w.addEventListener("error", event => {
    console.error("PDF worker error:", event.message || event);
  });
  return w;
}

function ensureWorker() {
  if (worker) return Promise.resolve(worker);
  if (workerPromise) return workerPromise;
  workerPromise = createWorker().then(w => {
    worker = w;
    return w;
  });
  return workerPromise;
}

function dispatch() {
  while (inFlight < MAX_IN_FLIGHT) {
    const entry = highPriorityQueue.shift() || lowPriorityQueue.shift();
    if (!entry) return;
    inFlight += 1;
    const id = nextRequestId++;
    pending.set(id, { resolve: entry.resolve, reject: entry.reject });
    ensureWorker().then(
      w => w.postMessage({ id, type: entry.type, payload: entry.payload }, entry.transfer),
      err => {
        pending.delete(id);
        inFlight = Math.max(0, inFlight - 1);
        entry.reject(err);
      },
    );
  }
}

function call(type, payload, { transfer = [], priority = false } = {}) {
  return new Promise((resolve, reject) => {
    const entry = { type, payload, transfer, resolve, reject };
    if (priority) highPriorityQueue.push(entry);
    else lowPriorityQueue.push(entry);
    dispatch();
  });
}

/**
 * Loads a PDF document in the worker.
 *
 * @param {ArrayBuffer} buffer PDF data.
 * @returns {Promise<Object>} Worker document handle.
 */
export async function loadPdfDocument(buffer) {
  const transferable = buffer instanceof ArrayBuffer ? [buffer] : [];
  return call("loadDocument", { buffer }, { transfer: transferable });
}

/**
 * Returns a PDF page aspect ratio.
 *
 * @param {Object} pdfDoc Worker document handle.
 * @param {number} pageNum One-based PDF page number.
 * @returns {Promise<number>} Page width divided by page height.
 */
export async function getPdfPageAspectRatio(pdfDoc, pageNum) {
  return call("getAspectRatio", { docId: pdfDoc.docId, pageNum });
}

/**
 * Returns raster source information for a PDF page.
 *
 * @param {Object} pdfDoc Worker document handle.
 * @param {number} pageNum One-based PDF page number.
 * @returns {Promise<Object>} Raster source information.
 */
export async function getPdfPageRasterSourceInfo(pdfDoc, pageNum) {
  return call("getRasterInfo", { docId: pdfDoc.docId, pageNum });
}

/**
 * Returns selectable text content for a PDF page.
 *
 * @param {Object} pdfDoc Worker document handle.
 * @param {number} pageNum One-based PDF page number.
 * @returns {Promise<Object>} Page viewport info and text items.
 */
export async function getPdfPageTextContent(pdfDoc, pageNum) {
  return call("getTextContent", { docId: pdfDoc.docId, pageNum });
}

/**
 * Returns link annotations for a PDF page.
 *
 * @param {Object} pdfDoc Worker document handle.
 * @param {number} pageNum One-based PDF page number.
 * @returns {Promise<Object>} Page viewport info and link annotations.
 */
export async function getPdfPageLinkAnnotations(pdfDoc, pageNum) {
  return call("getLinkAnnotations", { docId: pdfDoc.docId, pageNum });
}

/**
 * Renders a PDF page at a scale.
 *
 * @param {Object} pdfDoc Worker document handle.
 * @param {number} pageNum One-based PDF page number.
 * @param {number} scale Render scale.
 * @param {Object} [options={}] Render options.
 * @param {number} [options.downscaleTo=0] If positive, downscale to this maximum edge before transfer.
 * @param {boolean} [options.priority=false] If true, queue ahead of low-priority renders.
 * @returns {Promise<ImageBitmap>} Rendered page bitmap.
 */
export async function renderPdfPage(pdfDoc, pageNum, scale, { downscaleTo = 0, priority = false } = {}) {
  return call(
    "renderPage",
    { docId: pdfDoc.docId, pageNum, scale, downscaleTo },
    { priority },
  );
}

/**
 * Requests worker cleanup for a PDF document.
 *
 * @param {Object} pdfDoc Worker document handle.
 * @returns {void}
 */
export function requestPdfDocumentCleanup(pdfDoc) {
  if (!pdfDoc?.docId) return;
  call("requestCleanup", { docId: pdfDoc.docId }).catch(() => {});
}
