// Paper-fiber overlay. Riffle used to ship a 229-plain-white-paper.webp
// asset for this, but the visual contribution is minimal and the asset
// dependency complicated bundling. The shader/2D fallback still bind a
// texture here — we just return a 1×1 white canvas so the math evaluates
// to a no-op (multiply by 1.0).

let neutralCanvas = null;

function get2dContext(canvas, options) {
  return canvas.getContext("2d", options);
}

function getNeutralCanvas() {
  if (neutralCanvas) return neutralCanvas;
  neutralCanvas = document.createElement("canvas");
  neutralCanvas.width = 1;
  neutralCanvas.height = 1;
  const ctx = get2dContext(neutralCanvas);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1, 1);
  return neutralCanvas;
}

export function getPaperTextureCanvasSync() {
  return getNeutralCanvas();
}

export async function loadPaperTextureCanvas() {
  return getNeutralCanvas();
}

export function drawPaperTextureOverlay() {
  // No-op: the asset that drove the multiply overlay has been removed.
}
