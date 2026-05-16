/**
 * Page and margin layout values.
 *
 * @typedef {Object} Layout
 * @property {number} pw Page width in arbitrary layout units.
 * @property {number} ph Page height in arbitrary layout units.
 * @property {number} ratio Text block width divided by text block height.
 * @property {number} b Base margin unit.
 * @property {number} mInner Inner margin multiplier.
 * @property {number} mTop Top margin multiplier.
 * @property {number} mBottom Bottom margin multiplier.
 */

/**
 * Paper and content rendering options.
 *
 * @typedef {Object} Display
 * @property {string} [paperPreset] Named paper preset.
 * @property {string} [paperColor] CSS hex color for the paper.
 * @property {string} [lightShadowColor] CSS hex color used by paper lighting.
 * @property {string} [lightHighlightColor] CSS hex color used by paper highlights.
 * @property {string} [shadowTintColor] CSS hex color used by shadow tinting.
 * @property {string} [contentBlendMode="multiply"] Blend mode for page content.
 * @property {number} [paperThickness=0.5] Paper edge and turn-lighting strength from 0 to 1.
 * @property {number} [paperTextureStrength=0.18] Paper texture/normal strength from 0 to 1.
 */

/**
 * Rectangle in canvas coordinates.
 *
 * @typedef {Object} Rect
 * @property {number} x Left coordinate.
 * @property {number} y Top coordinate.
 * @property {number} w Width.
 * @property {number} h Height.
 */

/**
 * Metadata returned by a {@link PageSource}.
 *
 * @typedef {Object} PageMetadata
 * @property {number} aspectRatio Page width divided by page height.
 * @property {Object} [passthrough] Host-owned page object. When present, {@link ViewerPage} reads bitmap and placement fields from this object.
 */

/**
 * Most recent spread geometry emitted after rendering.
 *
 * @typedef {Object} SpreadGeometry
 * @property {Object|null} spreadRects Renderer-specific spread rectangles.
 * @property {Object|null} sideStates Renderer-specific left/right side state.
 * @property {Object} margins Scaled margin values returned by {@link computeMargins}.
 */

/**
 * Public API mixed into the canvas returned by {@link Riffle}.
 *
 * @typedef {HTMLCanvasElement} RiffleCanvas
 * @property {BookViewer} bookViewer Underlying viewer instance.
 * @property {string} backendName Renderer backend name.
 * @property {number} contentZoom Current user zoom multiplier.
 * @property {number} renderZoom Internal render zoom.
 * @property {number} currentSpread Settled spread index.
 * @property {number} effectiveSpread Target or in-flight spread index.
 * @property {number} numSpreads Total spread count.
 * @property {boolean} isAnimating Whether a page turn is animating.
 * @property {function(number):void} navigateBy Navigate relative to the effective spread.
 * @property {function(PageSource):void} setSource Replace the page source.
 * @property {function(Object):void} setLayout Merge layout fields and redraw.
 * @property {function(Object):void} setDisplay Merge display fields and redraw.
 * @property {Function} setViewport Set the zoom viewport.
 * @property {function(boolean):void} setShowPageBorder Toggle page edge rendering.
 * @property {function(number, number=):void} navigateTo Navigate to a spread.
 * @property {function(number):number} spreadIndexForPage Return the spread containing a viewer page.
 * @property {function(number):number} primaryPageIndexForSpread Return the first real viewer page in a spread.
 * @property {function():number} sourcePageCount Return source page count.
 * @property {function(number):number} sourcePageIndexToPageIndex Map a source page index to a viewer page index.
 * @property {function(number):number} pageIndexToSourcePageIndex Map a viewer page index to a source page index.
 * @property {function(number):number} spreadIndexForSourcePage Return the spread containing a source page.
 * @property {function(number):number} primarySourcePageIndexForSpread Return the first real source page in a spread.
 * @property {function(number):void} adjustZoom Zoom in for positive values and out for negative values.
 * @property {function():void} resetZoom Reset content zoom to 1.
 * @property {function():void} redraw Force a viewer redraw.
 * @property {function():SpreadGeometry|null} getSpreadGeometry Return the latest spread geometry.
 * @property {function(string, Function):Function} on Subscribe to a viewer event and return an unsubscribe function.
 * @property {function(string, Function):void} off Remove a viewer event listener.
 * @property {Function} openPdf Load a PDF file or ArrayBuffer.
 */
