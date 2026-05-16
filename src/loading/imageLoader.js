function computeTargetSize(sourceWidth, sourceHeight, maxEdge) {
  const safeMaxEdge = Math.max(1, Math.round(maxEdge || 1));
  const sourceMaxEdge = Math.max(sourceWidth, sourceHeight);
  if (sourceMaxEdge <= safeMaxEdge) {
    return {
      width: Math.max(1, Math.round(sourceWidth)),
      height: Math.max(1, Math.round(sourceHeight)),
    };
  }
  const scale = safeMaxEdge / sourceMaxEdge;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

/**
 * Loads an image file as an ImageBitmap.
 *
 * @param {Blob} file Image file or blob.
 * @returns {Promise<ImageBitmap>} Loaded image bitmap.
 */
export async function loadImageFile(file) {
  return createImageBitmap(file);
}

/**
 * Loads a downscaled image preview.
 *
 * @param {Blob} file Image file or blob.
 * @param {number} maxEdge Maximum preview edge in pixels.
 * @returns {Promise<{canvas: ImageBitmap, width: number, height: number}>} Preview bitmap plus original dimensions.
 */
export async function loadImagePreview(file, maxEdge) {
  const bitmap = await createImageBitmap(file);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const { width, height } = computeTargetSize(originalWidth, originalHeight, maxEdge);
  if (width === originalWidth && height === originalHeight) {
    return { canvas: bitmap, width: originalWidth, height: originalHeight };
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return {
    canvas: canvas.transferToImageBitmap(),
    width: originalWidth,
    height: originalHeight,
  };
}
