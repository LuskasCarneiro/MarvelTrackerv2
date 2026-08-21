import { fitText } from './backCover';
import { tintToHsl } from '@/lib/tint';
import type { Medium } from '@/lib/catalogue';

export type SpineTitle = {
  slug: string;
  label: string;
  /** The title's own colour, taken from its artwork. Printed as a band at the head of the
   *  spine — the only colour most of these objects get to show while shelved. */
  tint: string;
  medium: Medium;
};

/**
 * The format mark: docs/05-3d-shelf.md §12 Q7 and Q19, and the amendment in CLAUDE.md.
 *
 * A studio-style coloured band across the foot of the spine — the thing a real distributor
 * prints so you can tell a DVD from a Blu-ray across a room. **A band, not a word**: the rule
 * that survived the owner's override is that era is read, never announced, so no release ever
 * gets its format spelled out.
 *
 * Blu-ray's blue is the real convention rather than an invention, which is what makes the set
 * legible without a key. The rest sit either side of it: warm and papery for the tape era,
 * neutral for DVD, bright metal for a steelbook, and — for a title that never had a physical
 * release at all — a near-black that reads as an absence next to the others.
 */
const FORMAT_MARK: Record<Medium, string> = {
  vhs: '#b98a48',
  amaray: '#8d8578',
  bluray: '#2f6fc4',
  steel: '#c3c8d0',
  none: '#2a2630',
};

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
 * Which end of a cell is which, once the geometry has finished with it.
 *
 * `spineGeometryFor()` remaps the plane's UVs to `(1 - v, u)`, so texture-U runs *down* the
 * spine: U = 0 is the top of the case and U = 1 is where it stands on the board. Everything
 * below is written in those terms, because getting it backwards prints the format mark on the
 * ceiling-facing edge where nobody can see it — and it would look like a texture bug rather
 * than an orientation one.
 */
const HEAD_BAND = 0.055; // the tint, at the top of the spine
const FOOT_BAND = 0.075; // the format mark, at the foot — slightly deeper, so it reads as a base

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

    // The two bands first, so the title can be drawn over them if it ever overruns.
    // Full cell height: the band crosses the whole thickness of the spine, as printing does.
    const headWidth = Math.round(cell.w * HEAD_BAND);
    const footWidth = Math.round(cell.w * FOOT_BAND);

    // The title's own colour, at the head. Darkened and desaturated from the artwork value:
    // these are printed bands on a dark case in a dim room, and the raw tint at full
    // lightness reads as a row of glowing tabs rather than as ink.
    const { h, s, l } = tintToHsl(title.tint);
    ctx.fillStyle = `hsl(${h * 360} ${Math.min(s, 0.5) * 100}% ${Math.min(l, 0.44) * 100}%)`;
    ctx.fillRect(cell.x, cell.y, headWidth, cell.h);

    // The format mark, at the foot. See FORMAT_MARK.
    ctx.fillStyle = FORMAT_MARK[title.medium];
    ctx.fillRect(cell.x + cell.w - footWidth, cell.y, footWidth, cell.h);

    // A title that never had a physical release gets the bands and nothing else: it is a 3mm
    // card, the title would be unreadable on it anyway, and printing one would claim an
    // object that does not exist. See SPINE_FORMS in ShelfScene.tsx.
    if (title.medium === 'none') return;

    const fontSize = Math.max(10, Math.min(cell.h - VERTICAL_PAD * 2, 22));
    ctx.font = `700 ${fontSize}px sans-serif`;
    // --color-label-mid. This used to be the *material's* colour, which multiplied the whole
    // texture; now that the texture also carries the tint and the format mark, tinting it in
    // the material would mute Blu-ray's blue into the same warm grey as everything else. The
    // ink colour belongs to the ink.
    ctx.fillStyle = '#c8bcac';
    ctx.textBaseline = 'middle';
    // Supported in Chromium, not universally (e.g. older Firefox/Safari); assigning it is a
    // harmless no-op where it's ignored, so no feature-detect is needed — labels there just
    // draw without the extra tracking.
    ctx.letterSpacing = `${Math.round(fontSize * 0.08)}px`;

    // Text is drawn horizontally within its cell — the scene rotates the geometry, not us.
    // Available width is measured in pre-condense space since CONDENSE is applied after
    // fitText has already chosen what fits.
    // The title lives between the two bands, not across them: it starts below the tint and
    // stops above the format mark, so a long title is truncated by fitText rather than
    // running over the printing either side of it.
    const textStart = headWidth + LEFT_MARGIN;
    const availableWidth = (cell.w - textStart - footWidth - LEFT_MARGIN) / CONDENSE;
    const text = fitText(ctx, title.label.toUpperCase(), availableWidth);

    ctx.save();
    ctx.translate(cell.x + textStart, cell.y + cell.h / 2);
    ctx.scale(CONDENSE, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  });

  return { canvas, cells: cellMap, width, height };
}
