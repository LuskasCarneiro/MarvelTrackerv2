import { fitText } from './backCover';

export type SpineTitle = { slug: string; label: string };

/** Pixel rectangle of one cell within the atlas, top-left origin (the ordinary raster
 *  convention — the caller converts to UV). */
export type SpineCell = { x: number; y: number; w: number; h: number };

export type SpineAtlas = {
  canvas: HTMLCanvasElement;
  cells: Record<string, SpineCell>; // keyed by slug
  width: number;
  height: number;
};

/** Smallest power of two >= n, minimum 1 (a height of 0 is never a valid texture size). */
function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

/**
 * Pure: where each cell lands, given how many there are. No canvas, no DOM.
 *
 * Grid layout, left to right then top to bottom. `width` is always `atlasWidth`; `height`
 * is rows * cellHeight rounded up to the next power of two (some drivers and all mipmap
 * chains still care). A count of 0 still returns a valid minimal atlas rather than a
 * degenerate zero-height one.
 */
export function packSpineCells(
  count: number,
  options: { atlasWidth?: number; cellWidth?: number; cellHeight?: number } = {}
): { cells: SpineCell[]; width: number; height: number } {
  const atlasWidth = options.atlasWidth ?? 2048;
  const cellHeight = options.cellHeight ?? 48;

  // A cell wider than the atlas can't tile at all — floor(atlasWidth / cellWidth) would be
  // 0 and either divide by zero or loop forever. Clamp it to the atlas width instead, so
  // there's always at least one column and every cell still obeys "never extends past
  // width" rather than the caller getting a cell it can never place.
  const cellWidth = Math.min(options.cellWidth ?? 512, atlasWidth);
  const columns = Math.max(1, Math.floor(atlasWidth / cellWidth));

  // At least one row even for count === 0, so the atlas below is always a valid non-zero
  // texture size rather than a degenerate 2048x0 (or, post-power-of-two, still 0) one.
  const rows = Math.max(1, Math.ceil(count / columns));
  const height = nextPowerOfTwo(rows * cellHeight);

  const cells: SpineCell[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    cells.push({ x: col * cellWidth, y: row * cellHeight, w: cellWidth, h: cellHeight });
  }

  return { cells, width: atlasWidth, height };
}

// Horizontal compression standing in for Archivo's wdth axis (see .spine-label in
// globals.css: font-variation-settings "wdth" 70). Raw canvas text has no access to
// variable-font width axes, so "condensed" is faked with a horizontal ctx.scale instead —
// same visual family, a graceful approximation rather than a default-width face that would
// look wrong for a reason nothing reports.
const CONDENSE = 0.78;

const LEFT_MARGIN = 14; // inset from the cell's left edge, so labels don't run into the seam
const VERTICAL_PAD = 6; // minimum transparent margin above/below the glyphs, for alpha-testing

/**
 * Draws every label and returns the atlas.
 *
 * Font stack is a plain generic (sans-serif) rather than next/font — this runs on a raw
 * canvas outside React's render tree and has no access to font loading, same constraint as
 * renderBackCover.
 */
export function buildSpineAtlas(titles: SpineTitle[]): SpineAtlas {
  const { cells, width, height } = packSpineCells(titles.length);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('buildSpineAtlas: 2D context unavailable');

  // Transparent background — only the letters are drawn. The scene applies this as an
  // alpha-tested texture over the case body, so the case's own material shows through
  // everywhere there is no ink. Deliberately no ctx.fillRect here.

  const cellMap: Record<string, SpineCell> = {};

  titles.forEach((title, i) => {
    const cell = cells[i];
    if (!cell) return; // packSpineCells always returns one cell per title; guard keeps TS happy
    cellMap[title.slug] = cell;

    const fontSize = Math.max(10, Math.min(cell.h - VERTICAL_PAD * 2, 22));
    ctx.font = `700 ${fontSize}px sans-serif`;
    ctx.fillStyle = '#f2ebe1'; // --color-label-bright, spine text on a dark case
    ctx.textBaseline = 'middle';
    // Supported in Chromium, not universally (e.g. older Firefox/Safari); assigning it is a
    // harmless no-op where it's ignored, so no feature-detect is needed — labels there just
    // draw without the extra tracking.
    ctx.letterSpacing = `${Math.round(fontSize * 0.08)}px`;

    // Text is drawn horizontally within its cell — the scene rotates the geometry, not us.
    // Available width is measured in pre-condense space since CONDENSE is applied after
    // fitText has already chosen what fits.
    const availableWidth = (cell.w - LEFT_MARGIN) / CONDENSE;
    const text = fitText(ctx, title.label.toUpperCase(), availableWidth);

    ctx.save();
    ctx.translate(cell.x + LEFT_MARGIN, cell.y + cell.h / 2);
    ctx.scale(CONDENSE, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  });

  return { canvas, cells: cellMap, width, height };
}
