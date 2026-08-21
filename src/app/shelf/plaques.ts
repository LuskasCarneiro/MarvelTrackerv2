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
 * The size of one plaque, in texels, and the number every proportion below is measured
 * against.
 *
 * Four to one, because the plane it lands on is four to one as well — `PLAQUE_WIDTH` 2.6 by
 * `PLAQUE_HEIGHT` 0.65 in ShelfScene — and a cell of any other proportion delivers letters
 * that arrive stretched.
 *
 * Why four times the texels the old 512 x 128 cell carried, on a machine that has to count
 * them. It is *not* so the plate can be sampled one texel to one pixel: at the distance the
 * camera actually stands it never is. `standingDistance` frames the whole carcass, which puts
 * the eye about 34 units from a 26-unit cabinet, and at 34 units a 0.65-unit plate covers
 * 0.65 / (2 x 34 x tan 27°) = 1.9% of the frame height — twenty CSS pixels on a 1080-tall
 * canvas. Even 128 texels was already more than the screen could resolve.
 *
 * The resolution is there for the engraving instead. The incised look is a catch-light drawn
 * a fraction of a letter's height below the letter, and in a 128-texel cell that fraction
 * rounded to a single pixel — which is the first thing a mipmap chain averages away, and is
 * why type this small has read as flat and printed rather than cut. Drawn four or five pixels
 * deep in a 256-texel cell it survives the reduction as a soft lip. The same argument applies
 * to the type: large glyphs reduced are legible, hairlines reduced are grey mush.
 *
 * The cost is 2048 x 2048 x 4 = 16 MiB resident, near 22 MiB once the mip chain is built,
 * against 4 MiB before. That is a quarter of what the 4096² cover atlas already asks of the
 * same GPU, and it is the reason this stops at 256 rather than going to 512: at 512 the
 * twelve bays would round up to a 4096² atlas of their own and cost more than the covers do.
 */
const CELL_WIDTH = 1024;
const CELL_HEIGHT = 256;

/** The default atlas width. Two columns of `CELL_WIDTH`, which for the gallery's twelve bays
 *  gives six rows and a 2048 x 2048 texture. Kept at 2048 rather than widened to 4096: the
 *  packing is the same number of texels either way (four columns of three rows is 4096 x 1024,
 *  identical area), and the squarer atlas keeps the largest dimension a driver has to accept
 *  down at 2048. */
const ATLAS_WIDTH = 2048;

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
  const atlasWidth = options?.atlasWidth ?? ATLAS_WIDTH;
  const cellHeight = options?.cellHeight ?? CELL_HEIGHT;

  // A cell wider than the atlas can't tile at all — floor(atlasWidth / cellWidth) would be
  // 0 and either divide by zero or loop forever. Clamp it to the atlas width instead, so
  // there's always at least one column and every cell still obeys "never extends past
  // width" rather than the caller getting a cell it can never place.
  const cellWidth = Math.min(options?.cellWidth ?? CELL_WIDTH, atlasWidth);
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
const BRASS_LIGHT = '#a8874a'; // ground gradient, top — the face catching the room's lamp
const BRASS_DARK = '#6d572f'; // ground gradient, bottom — turning away from the light
const BEVEL_LIGHT = '#e8cf94'; // top/left edge: a machined edge catches more light than the flat face does
const BEVEL_DARK = '#5a4726'; // bottom/right edge, and reused for the inner rule — the shadow side of the same bevel
const ENGRAVE_SHADOW = '#1c1408'; // the incised fill. Darkened once the plate sat directly under the picture light: at the old value the groove clipped to white along with the ground and the name vanished, which reads as a missing texture rather than as blown exposure
const ENGRAVE_HIGHLIGHT = '#f6e8c8'; // the catch-light peeking out beneath each letter

// The plate's furniture, every value a fraction of the cell height rather than a pixel count.
// That is the whole point of stating them this way: the cell has now been resized once, and a
// plaque described in pixels has to be redrawn by eye every time it is. The bevel and the rule
// keep the exact ratios the approved 128-pixel plate used (2/128 and 14/128), so the plate's
// proportions are unchanged and only its resolution has moved.
const BEVEL_WIDTH = 0.016;
const RULE_INSET = 0.11;
const RULE_WIDTH = 0.008;

// The text margin is the one proportion deliberately changed: it was 32/128, a quarter of the
// cell height each side, which left the longest labels only 87% of the plate to run across and
// then truncated them. At 0.19 the type has 90% of the plate width and still clears the inner
// rule by 0.08 of the cell height.
const TEXT_MARGIN = 0.19;

/**
 * The largest the type is ever set, as a fraction of the cell height.
 *
 * Half the plate height. A serif's capitals measure 0.65 of the font size (measured in
 * Chromium against the same generic `serif` stack this draws with, at every weight), so half
 * the plate height puts the capitals at a third of the plate's own height — which is the
 * proportion the reference photograph's section headers keep, and a little over double what
 * the old plate managed. Anything larger starts crowding the inner rule.
 */
const TYPE_MAX = 0.5;

/**
 * The floor the shrink-to-fit stops at, below which a label truncates instead.
 *
 * Whole words matter more than a uniform size on a sign, so this is set low enough that no
 * real label ever reaches it: 0.16 of the cell height sets around thirty characters whole
 * across the plate, and the longest label the catalogue holds is "Marvel Television (ABC)" at
 * twenty-three, the longest the brief names "Marvel Cinematic Universe" at twenty-five. The
 * floor exists only so that a pathological label degrades to an ellipsis rather than to type
 * three pixels tall, which would read as a blank plate.
 */
const TYPE_MIN = 0.16;

/** Tracking, as a fraction of the font size. Formal capitals are always spaced out; 0.14 is
 *  what the old plate used (it wrote it as 0.16 and then rounded the result down to a whole
 *  pixel) and it costs about 3% of the size on the longest label, which is worth paying. */
const TRACKING = 0.14;

/** The most tracking a short label may be opened out to when it is spaced to fill the plate.
 *  "MCU" would need 2.2em of gap to reach both margins and would stop reading as a word well
 *  before that; 0.45em spreads it across 46% of the plate and still reads as three letters. */
const TRACKING_MAX = 0.45;

/** How far below the letter the catch-light is drawn, as a fraction of the font size. It was
 *  one pixel against a 30px letter — 0.033 — and one pixel is what disappeared in the mipmap.
 *  0.04 of a 128px letter is five pixels of lip, which reduces to something still visible. */
const ENGRAVE_OFFSET = 0.04;

function setType(ctx: CanvasRenderingContext2D, size: number, tracking: number): void {
  ctx.font = `700 ${size}px serif`;
  ctx.letterSpacing = `${tracking}px`;
}

/** The extent of the drawn strokes and where their middle sits, both relative to the point a
 *  centred draw is anchored on. Ink rather than advance, because the advance box carries the
 *  trailing letter-space and the strokes do not. */
function measureInk(ctx: CanvasRenderingContext2D, text: string): { width: number; centre: number } {
  const m = ctx.measureText(text);
  return {
    width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
    centre: (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
  };
}

/**
 * Sets `ctx.font`, `ctx.letterSpacing` and the two alignments for one label, and hands back
 * the text to draw with the horizontal correction that centres it.
 *
 * Exported for its test: vitest runs in node here, with no canvas behind
 * `document.createElement`, so the only way to cover this arithmetic is to hand it a
 * measuring stub. Everything it needs from a context is `font`, `letterSpacing` and
 * `measureText`.
 *
 * Three things happen, in this order.
 *
 * **The size is solved rather than searched for.** Ink width is exactly linear in the font
 * size while the tracking is a fraction of that size, which is measured rather than assumed:
 * Chromium reports "MARVEL TELEVISION (ABC)" as 13.858em of glyph at zero tracking and
 * 16.938em at 0.14em, and 13.858 + 22 x 0.14 is 16.938 to the third decimal. So one
 * measurement at the maximum size gives the size that exactly fills the width, and the
 * binary search this would otherwise want never has to run.
 *
 * **Long labels shrink, and only truncate when shrinking has run out.** Whole words on a
 * smaller line beat "MARVEL TELEVISION (A…" at a larger one, which is what the plate used to
 * show — the old cell offered 448px to a label that measured 526px and went straight to the
 * ellipsis.
 *
 * **Short labels are opened out rather than left floating.** A three-letter name centred on a
 * 26cm plate leaves most of the brass empty; an engraver spaces it across instead, and that
 * is what the slack is spent on.
 */
export function setPlaqueType(
  ctx: CanvasRenderingContext2D,
  label: string,
  cellHeight: number,
  available: number
): { text: string; offsetX: number; fontSize: number } {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxSize = cellHeight * TYPE_MAX;
  const minSize = cellHeight * TYPE_MIN;

  setType(ctx, maxSize, maxSize * TRACKING);
  const inkAtMax = measureInk(ctx, label).width;

  const size = inkAtMax <= available ? maxSize : Math.max(minSize, (maxSize * available) / inkAtMax);
  setType(ctx, size, size * TRACKING);

  // Hinting rounds glyph advances to whole pixels, so the solved size can still land a hair
  // wide; and at the floor it lands wide by however much the label overruns the plate. Both
  // end here, which is the only path that shortens the words.
  //
  // The half-pixel tolerance is load-bearing rather than sloppy. Solving the size from the
  // measurement puts an exactly-fitting label *on* the limit, and floating point then reports
  // it a ten-thousandth of a pixel over: without the tolerance "SONY / SPIDER-MAN" came back
  // as "SONY / SPIDER-M…" for want of 1e-13 of a pixel. Half a pixel of overrun into a
  // 49-pixel margin cannot be seen; a lost word can.
  let text = label;
  if (measureInk(ctx, text).width > available + 0.5) text = fitText(ctx, text, available);

  const gaps = Math.max(1, text.length - 1);
  const slack = Math.max(0, available - measureInk(ctx, text).width);
  setType(ctx, size, Math.min(size * TRACKING + slack / gaps, size * TRACKING_MAX));

  // `letterSpacing` puts a gap after the last letter as well as between letters, so the
  // advance box a centred draw aligns on runs half a gap wider on the right than the strokes
  // do, and the name sits left of the middle of its plate by that half gap — 29px of a 1024px
  // cell at the widest tracking, which is visible on a sign. Aligning on the middle of the ink
  // instead corrects that, and takes the glyphs' own uneven side bearings with it.
  // The size comes back rather than being read off `ctx.font`, which starts with the weight
  // and would parse to 700.
  return { text, offsetX: -measureInk(ctx, text).centre, fontSize: size };
}

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

    // Every measurement on the plate is taken off its own height, so a change to CELL_HEIGHT
    // moves the whole drawing together instead of leaving the furniture behind at its old
    // pixel sizes while the type grows past it.
    const bevelWidth = cell.h * BEVEL_WIDTH;
    const bevelInset = bevelWidth / 2; // half the stroke, so the antialiased edge stays inside the cell rather than bleeding into the next plaque
    const ruleInset = cell.h * RULE_INSET;
    const textMargin = cell.h * TEXT_MARGIN;

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
    ctx.lineWidth = bevelWidth;
    ctx.strokeStyle = BEVEL_LIGHT;
    ctx.beginPath();
    ctx.moveTo(cell.x + bevelInset, cell.y + cell.h - bevelInset);
    ctx.lineTo(cell.x + bevelInset, cell.y + bevelInset);
    ctx.lineTo(cell.x + cell.w - bevelInset, cell.y + bevelInset);
    ctx.stroke();

    ctx.strokeStyle = BEVEL_DARK;
    ctx.beginPath();
    ctx.moveTo(cell.x + cell.w - bevelInset, cell.y + bevelInset);
    ctx.lineTo(cell.x + cell.w - bevelInset, cell.y + cell.h - bevelInset);
    ctx.lineTo(cell.x + bevelInset, cell.y + cell.h - bevelInset);
    ctx.stroke();

    // A thin inner rule, inset further still — engraved plates are very often ruled off
    // like this, a second and quieter line short of the bevel rather than one busy edge.
    ctx.strokeStyle = BEVEL_DARK;
    ctx.lineWidth = Math.max(1, cell.h * RULE_WIDTH);
    ctx.strokeRect(cell.x + ruleInset, cell.y + ruleInset, cell.w - ruleInset * 2, cell.h - ruleInset * 2);

    // The label: uppercase, bold and generously letter-spaced, the way a formal nameplate sets
    // its text. ctx.letterSpacing is the same technique buildSpineAtlas uses, with the same
    // one caveat: supported in Chromium, not universally, and a harmless no-op where it
    // isn't — labels there just draw tighter, and centred on their ink either way.
    const { text, offsetX, fontSize } = setPlaqueType(
      ctx,
      label.label.toUpperCase(),
      cell.h,
      cell.w - textMargin * 2
    );
    const engraveOffset = Math.max(1, fontSize * ENGRAVE_OFFSET);

    // Engraved rather than printed: a light catch-light drawn a fraction of the letter height
    // low, then the true dark fill on top at (0, 0). The sliver of light peeking out beneath
    // each letter reads as the lower lip of a groove cut into the metal, catching the lamp
    // from above; draw the two passes the other way round and the letters emboss instead of
    // engrave. The offset scales with the type because a fixed pixel does not: at one pixel
    // under a 128px letter the groove is invisible, and at one pixel under a 30px letter it
    // was already the first thing the mip chain threw away.
    ctx.save();
    ctx.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
    ctx.fillStyle = ENGRAVE_HIGHLIGHT;
    ctx.fillText(text, offsetX, engraveOffset);
    ctx.fillStyle = ENGRAVE_SHADOW;
    ctx.fillText(text, offsetX, 0);
    ctx.restore();
  });

  return { canvas, cells: cellMap, width, height };
}
