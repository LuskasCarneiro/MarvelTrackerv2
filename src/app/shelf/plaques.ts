import { fitText } from './backCover';

export type PlaqueLabel = { key: string; label: string };

/** Pixel rectangle of one cell within the atlas, top-left origin (the ordinary raster
 *  convention — the caller converts to UV). */
export type PlaqueCell = { x: number; y: number; w: number; h: number };

export type PlaqueAtlas = {
  canvas: HTMLCanvasElement;
  cells: Record<string, PlaqueCell>; // keyed by `key`
  width: number;
  height: number;
};

/** Smallest power of two >= n, minimum 1 (a height of 0 is never a valid texture size).
 *  Identical to spineAtlas.ts's own helper of the same name; duplicated rather than
 *  imported because that module exports nothing below buildSpineAtlas and this task must
 *  not edit it — the same call roomSurfaces.ts makes about substrate.ts's hashLattice. */
function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

/**
 * Pure: where each cell lands, given how many labels there are. No canvas, no DOM — same
 * split as packSpineCells/buildSpineAtlas, so the geometry is unit-testable without ever
 * touching document.createElement.
 *
 * Grid layout, left to right then top to bottom. `width` is always `atlasWidth`; `height`
 * is rows * cellHeight rounded up to the next power of two (some drivers and all mipmap
 * chains still care). A count of 0 still returns a valid minimal atlas rather than a
 * degenerate zero-height one.
 */
export function packPlaqueCells(
  count: number,
  options?: { atlasWidth?: number; cellWidth?: number; cellHeight?: number }
): { cells: PlaqueCell[]; width: number; height: number } {
  const atlasWidth = options?.atlasWidth ?? 2048;
  const cellHeight = options?.cellHeight ?? 128;

  // A cell wider than the atlas can't tile at all — floor(atlasWidth / cellWidth) would be
  // 0 and either divide by zero or loop forever. Clamp it to the atlas width instead, so
  // there's always at least one column and every cell still obeys "never extends past
  // width" rather than the caller getting a cell it can never place.
  const cellWidth = Math.min(options?.cellWidth ?? 512, atlasWidth);
  const columns = Math.max(1, Math.floor(atlasWidth / cellWidth));

  // At least one row even for count === 0, so the atlas below is always a valid non-zero
  // texture size rather than a degenerate 2048x0 (or, post-power-of-two, still 0) one.
  const rows = Math.max(1, Math.ceil(count / columns));
  const height = nextPowerOfTwo(rows * cellHeight);

  const cells: PlaqueCell[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    cells.push({ x: col * cellWidth, y: row * cellHeight, w: cellWidth, h: cellHeight });
  }

  return { cells, width: atlasWidth, height };
}

// Brass palette. A real aged brass plaque reads as warm and slightly desaturated rather
// than a saturated yellow, so the ground gradient below runs between the two BRASS tones
// only; the bevel and the engraving take lighter/darker relatives of that same warm hue so
// the whole plaque reads as one material lit from one place, not four unrelated colours.
const BRASS_LIGHT = '#c9a75f'; // ground gradient, top — the face catching the room's lamp
const BRASS_DARK = '#8a6f3e'; // ground gradient, bottom — turning away from the light
const BEVEL_LIGHT = '#e8cf94'; // top/left edge: a machined edge catches more light than the flat face does
const BEVEL_DARK = '#5a4726'; // bottom/right edge, and reused for the inner rule — the shadow side of the same bevel
const ENGRAVE_SHADOW = '#3c2e17'; // the incised fill: dark, not black — a shadowed groove in metal, not printed ink
const ENGRAVE_HIGHLIGHT = '#f6e8c8'; // the catch-light peeking out beneath each letter

const BEVEL_WIDTH = 2; // px
const BEVEL_INSET = 1; // half the stroke width, so the antialiased edge stays inside the cell rather than bleeding into the next plaque
const RULE_INSET = 14; // the inner rule sits clear of the bevel, same scale as spine's own LEFT_MARGIN
const TEXT_MARGIN = 32; // horizontal clearance each side, clear of the inner rule
const ENGRAVE_OFFSET = 1; // the "beneath" pixel — flip its sign and the letters emboss instead of engraving

/**
 * Draws every plaque and returns the atlas. Each cell is drawn **opaque**, unlike
 * buildSpineAtlas's transparent ink — a plaque is the whole object here, not a mark on
 * something else that shows through around it.
 *
 * Font stack is a plain generic (serif) rather than next/font — this runs on a raw canvas
 * outside React's render tree and has no access to font loading, same constraint as
 * renderBackCover and buildSpineAtlas. Serif rather than spine's sans-serif: a nameplate
 * reads as formal, and a plain serif set in capitals is the oldest way of saying so.
 */
export function buildPlaqueAtlas(labels: PlaqueLabel[]): PlaqueAtlas {
  const { cells, width, height } = packPlaqueCells(labels.length);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('buildPlaqueAtlas: 2D context unavailable');

  // A real base colour under the whole canvas first, including any pad rows the
  // power-of-two rounding adds below the last row — no cell covers that strip, but it
  // should still be a plausible surface rather than default transparent black.
  ctx.fillStyle = BRASS_DARK;
  ctx.fillRect(0, 0, width, height);

  const cellMap: Record<string, PlaqueCell> = {};

  labels.forEach((label, i) => {
    const cell = cells[i];
    if (!cell) return; // packPlaqueCells always returns one cell per label; guard keeps TS happy
    cellMap[label.key] = cell;

    // Ground: a soft vertical gradient rather than a flat fill, so the brass reads as a
    // metal surface catching the room's one lamp from above instead of a flat gold rectangle.
    const gradient = ctx.createLinearGradient(cell.x, cell.y, cell.x, cell.y + cell.h);
    gradient.addColorStop(0, BRASS_LIGHT);
    gradient.addColorStop(1, BRASS_DARK);
    ctx.fillStyle = gradient;
    ctx.fillRect(cell.x, cell.y, cell.w, cell.h);

    // Bevel: a lighter line along the top and left, a darker one along the bottom and
    // right. Two strokes, and on their own they are most of what sells "a machined metal
    // plate" rather than a painted rectangle.
    ctx.lineWidth = BEVEL_WIDTH;
    ctx.strokeStyle = BEVEL_LIGHT;
    ctx.beginPath();
    ctx.moveTo(cell.x + BEVEL_INSET, cell.y + cell.h - BEVEL_INSET);
    ctx.lineTo(cell.x + BEVEL_INSET, cell.y + BEVEL_INSET);
    ctx.lineTo(cell.x + cell.w - BEVEL_INSET, cell.y + BEVEL_INSET);
    ctx.stroke();

    ctx.strokeStyle = BEVEL_DARK;
    ctx.beginPath();
    ctx.moveTo(cell.x + cell.w - BEVEL_INSET, cell.y + BEVEL_INSET);
    ctx.lineTo(cell.x + cell.w - BEVEL_INSET, cell.y + cell.h - BEVEL_INSET);
    ctx.lineTo(cell.x + BEVEL_INSET, cell.y + cell.h - BEVEL_INSET);
    ctx.stroke();

    // A thin inner rule, inset further still — engraved plates are very often ruled off
    // like this, a second and quieter line short of the bevel rather than one busy edge.
    ctx.strokeStyle = BEVEL_DARK;
    ctx.lineWidth = 1;
    ctx.strokeRect(cell.x + RULE_INSET, cell.y + RULE_INSET, cell.w - RULE_INSET * 2, cell.h - RULE_INSET * 2);

    // The label: uppercase and generously letter-spaced, the way a formal nameplate sets
    // its text. ctx.letterSpacing is the same technique buildSpineAtlas uses, with the same
    // one caveat: supported in Chromium, not universally, and a harmless no-op where it
    // isn't — labels there just draw without the extra tracking.
    const fontSize = Math.round(Math.max(14, Math.min(cell.h * 0.24, 30)));
    ctx.font = `600 ${fontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${Math.round(fontSize * 0.16)}px`;

    const availableWidth = cell.w - TEXT_MARGIN * 2;
    const text = fitText(ctx, label.label.toUpperCase(), availableWidth);

    // Engraved rather than printed: a light catch-light drawn one pixel low, then the true
    // dark fill on top at (0, 0). The sliver of light peeking out beneath each letter reads
    // as the lower lip of a groove cut into the metal, catching the lamp from above; draw
    // the two passes the other way round and the letters emboss instead of engrave.
    ctx.save();
    ctx.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
    ctx.fillStyle = ENGRAVE_HIGHLIGHT;
    ctx.fillText(text, 0, ENGRAVE_OFFSET);
    ctx.fillStyle = ENGRAVE_SHADOW;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  });

  return { canvas, cells: cellMap, width, height };
}
