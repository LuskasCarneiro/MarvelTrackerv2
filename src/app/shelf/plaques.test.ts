import { describe, expect, it } from 'vitest';
import { packPlaqueCells, setPlaqueType } from './plaques';

/** Power-of-two check without relying on the implementation's own rounding. */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** Asserts no two cells overlap and every cell sits fully inside width x height. */
function assertValidLayout(cells: Array<{ x: number; y: number; w: number; h: number }>, width: number, height: number) {
  for (const cell of cells) {
    expect(cell.x).toBeGreaterThanOrEqual(0);
    expect(cell.y).toBeGreaterThanOrEqual(0);
    expect(cell.x + cell.w).toBeLessThanOrEqual(width);
    expect(cell.y + cell.h).toBeLessThanOrEqual(height);
  }
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i]!;
      const b = cells[j]!;
      const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlaps).toBe(false);
    }
  }
}

describe('packPlaqueCells', () => {
  // Defaults: atlasWidth 2048, cellWidth 1024 -> 2 columns, cellHeight 256.
  const COLUMNS = 2;

  it('gives a valid minimal atlas for zero labels, not a degenerate one', () => {
    const { cells, width, height } = packPlaqueCells(0);
    expect(cells).toHaveLength(0);
    expect(width).toBe(2048);
    expect(height).toBeGreaterThan(0);
    expect(isPowerOfTwo(height)).toBe(true);
  });

  it('places a single cell at the origin', () => {
    const { cells, width, height } = packPlaqueCells(1);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 1024, h: 256 });
    assertValidLayout(cells, width, height);
  });

  it('keeps the cell at the 4:1 proportion of the plane it is mapped onto', () => {
    // PLAQUE_WIDTH 2.6 by PLAQUE_HEIGHT 0.65 in ShelfScene. Any other cell proportion draws
    // letters that arrive stretched, which no amount of type sizing here can undo.
    const cell = packPlaqueCells(1).cells[0]!;
    expect(cell.w / cell.h).toBeCloseTo(2.6 / 0.65, 5);
  });

  it('fills exactly one full row without starting a second', () => {
    const { cells, width, height } = packPlaqueCells(COLUMNS);
    expect(cells).toHaveLength(COLUMNS);
    // All on row 0.
    for (const cell of cells) expect(cell.y).toBe(0);
    assertValidLayout(cells, width, height);
  });

  it('wraps to a second row for one more than a full row', () => {
    const { cells, width, height } = packPlaqueCells(COLUMNS + 1);
    expect(cells).toHaveLength(COLUMNS + 1);
    const last = cells[cells.length - 1]!;
    expect(last.x).toBe(0);
    expect(last.y).toBe(256);
    assertValidLayout(cells, width, height);
  });

  it('lays out the real gallery size (12 bays) with no overlaps and power-of-two height', () => {
    const { cells, width, height } = packPlaqueCells(12);
    expect(cells).toHaveLength(12);
    expect(isPowerOfTwo(height)).toBe(true);
    assertValidLayout(cells, width, height);
  });

  it('rounds height up to the next power of two rather than an exact multiple', () => {
    // 12 plaques / 2 columns = 6 rows * 256px = 1536, which is not itself a power of two.
    const { height } = packPlaqueCells(12);
    expect(height).toBe(2048);
  });

  it('keeps the gallery atlas inside its 16 MiB budget', () => {
    // The machine this has to run on is a 2015 Intel laptop with shared memory, so the size
    // of this texture is a decision and not an accident: 2048 x 2048 x 4 bytes is 16 MiB
    // resident, near 22 once the mip chain is built. Going to a 512-tall cell would round the
    // twelve bays up to 4096² and cost more than the cover atlas does. Fail here rather than
    // on someone's laptop if a future cell size crosses that line.
    const { width, height } = packPlaqueCells(12);
    expect(width * height * 4).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  it('guards a cellWidth larger than the atlas width instead of dividing by zero', () => {
    const { cells, width, height } = packPlaqueCells(3, { atlasWidth: 512, cellWidth: 2048 });
    expect(cells).toHaveLength(3);
    // Clamped so every cell still obeys "never extends past width".
    assertValidLayout(cells, width, height);
  });

  it('respects custom atlasWidth, cellWidth and cellHeight', () => {
    const { cells, width, height } = packPlaqueCells(5, { atlasWidth: 256, cellWidth: 128, cellHeight: 32 });
    // 2 columns at this width.
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 128, h: 32 });
    expect(cells[1]).toEqual({ x: 128, y: 0, w: 128, h: 32 });
    expect(cells[2]).toEqual({ x: 0, y: 32, w: 128, h: 32 });
    assertValidLayout(cells, width, height);
  });
});

/**
 * A measuring stub standing in for a 2D context.
 *
 * Vitest runs in node here — there is no canvas behind `document.createElement` — so the type
 * fitting can only be covered by handing it something that measures. The model is not a guess:
 * Chromium reports ink width as `glyphs + (n - 1) x tracking` and the centred draw's anchor as
 * the middle of the *advance* box, which carries `n x tracking` because `letterSpacing` puts a
 * gap after the last letter too. Both were measured against the real `serif` stack before this
 * was written, and "MARVEL TELEVISION (ABC)" checks out to the third decimal: 13.858em of
 * glyph, 16.938em at 0.14em tracking, and 13.858 + 22 x 0.14 = 16.938.
 *
 * One flat advance per character rather than real per-glyph widths, because none of the
 * arithmetic under test cares which letters they are.
 */
const ADVANCE = 0.6; // of the font size, near enough the real average for uppercase serif

function measuringContext() {
  return {
    font: '',
    letterSpacing: '0px',
    textAlign: '',
    textBaseline: '',
    get fontSize(): number {
      return Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 0);
    },
    get tracking(): number {
      return parseFloat(this.letterSpacing);
    },
    measureText(text: string) {
      const glyphs = text.length * ADVANCE * this.fontSize;
      const ink = glyphs + Math.max(0, text.length - 1) * this.tracking;
      const anchor = (glyphs + text.length * this.tracking) / 2;
      return {
        width: glyphs + text.length * this.tracking,
        actualBoundingBoxLeft: anchor,
        actualBoundingBoxRight: ink - anchor,
      };
    },
  };
}

/** The stub is structural, not a real context; the cast is the test's, never production's. */
function stubContext() {
  const ctx = measuringContext();
  return { ctx, as: ctx as unknown as CanvasRenderingContext2D };
}

/** Ink width of whatever the context is currently set to draw. */
function inkWidth(ctx: ReturnType<typeof measuringContext>, text: string): number {
  const m = ctx.measureText(text);
  return m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
}

describe('setPlaqueType', () => {
  const CELL_HEIGHT = 256;
  const AVAILABLE = 1024 - 256 * 0.19 * 2; // the cell width less a text margin each side

  it('sets a short label at the full size rather than shrinking it', () => {
    const { ctx, as } = stubContext();
    const { text, fontSize } = setPlaqueType(as, 'MCU', CELL_HEIGHT, AVAILABLE);
    expect(text).toBe('MCU');
    expect(fontSize).toBe(CELL_HEIGHT * 0.5);
    expect(ctx.font).toBe(`700 ${CELL_HEIGHT * 0.5}px serif`);
  });

  it('opens a short label out towards the margins instead of leaving it floating', () => {
    const { ctx, as } = stubContext();
    const plain = setPlaqueType(as, 'MCU', CELL_HEIGHT, AVAILABLE);
    // Tracking well past the 0.14em base, and the label now spans a real share of the plate
    // rather than the quarter of it three letters at 0.14em would. The threshold is 0.35 and
    // not the 0.46 Chromium gives, because the stub sets every character at a flat 0.6em and
    // real serif capitals are wider than that — M is 0.89.
    expect(ctx.tracking).toBeGreaterThan(plain.fontSize * 0.14);
    expect(inkWidth(ctx, plain.text) / AVAILABLE).toBeGreaterThan(0.35);
  });

  it('caps how far a short label may be opened out, so it still reads as a word', () => {
    const { ctx, as } = stubContext();
    const { fontSize } = setPlaqueType(as, 'MCU', CELL_HEIGHT, AVAILABLE);
    // Unclamped, three letters would need 2.2em of gap each to reach both margins.
    expect(ctx.tracking).toBeCloseTo(fontSize * 0.45, 6);
  });

  it('shrinks a long label to fit rather than truncating it', () => {
    const { ctx, as } = stubContext();
    const { text, fontSize } = setPlaqueType(as, 'MARVEL TELEVISION (ABC)', CELL_HEIGHT, AVAILABLE);
    expect(text).toBe('MARVEL TELEVISION (ABC)');
    expect(text).not.toContain('…');
    expect(fontSize).toBeLessThan(CELL_HEIGHT * 0.5);
    expect(fontSize).toBeGreaterThan(CELL_HEIGHT * 0.16);
    expect(inkWidth(ctx, text)).toBeLessThanOrEqual(AVAILABLE + 0.001);
  });

  it('keeps the longest label the brief names whole as well', () => {
    const { as } = stubContext();
    const { text } = setPlaqueType(as, 'MARVEL CINEMATIC UNIVERSE', CELL_HEIGHT, AVAILABLE);
    expect(text).toBe('MARVEL CINEMATIC UNIVERSE');
  });

  it('sets every real gallery label whole, within the plate, at a legible size', () => {
    const labels = [
      'MCU',
      'CLASSIC ERA',
      'X-MEN (FOX)',
      'FANTASTIC FOUR (FOX)',
      'SONY / SPIDER-MAN',
      'SPIDER-VERSE',
      'CLASSIC TV',
      'MUTANTS (FOX)',
      'DEFENDERS (NETFLIX)',
      'MARVEL TELEVISION (ABC)',
      'HULU / FREEFORM',
      'MCU DISNEY+',
      'MARVEL ANIMATION',
    ];
    for (const label of labels) {
      const { ctx, as } = stubContext();
      const { text, fontSize } = setPlaqueType(as, label, CELL_HEIGHT, AVAILABLE);
      expect(text).toBe(label);
      expect(inkWidth(ctx, text)).toBeLessThanOrEqual(AVAILABLE + 0.001);
      // The old plate set everything at 30px in a 128px cell — 0.23 of the plate height — and
      // truncated anything past nineteen characters. Nothing may now fall below the floor.
      expect(fontSize / CELL_HEIGHT).toBeGreaterThanOrEqual(0.16);
    }
  });

  it('truncates only once shrinking has run out at the floor', () => {
    const { ctx, as } = stubContext();
    const absurd = 'A SECTION NAME NOBODY WOULD EVER GIVE A SHELF IN A GALLERY LIKE THIS ONE';
    const { text, fontSize } = setPlaqueType(as, absurd, CELL_HEIGHT, AVAILABLE);
    expect(fontSize).toBe(CELL_HEIGHT * 0.16);
    expect(text).toContain('…');
    expect(text.length).toBeLessThan(absurd.length);
    // Ink rather than advance: fitText cuts by advance width, which carries the gap after the
    // last letter, and the slack that leaves is then spent back on tracking. What has to stay
    // inside the margins is the strokes.
    expect(inkWidth(ctx, text)).toBeLessThanOrEqual(AVAILABLE + 0.001);
  });

  it('centres on the ink, correcting the gap letterSpacing leaves after the last letter', () => {
    const { ctx, as } = stubContext();
    const { text, offsetX } = setPlaqueType(as, 'MARVEL TELEVISION (ABC)', CELL_HEIGHT, AVAILABLE);
    // The trailing gap pushes the advance box's middle half a gap right of the ink's, so the
    // correction is half a gap to the right — positive, and not zero.
    expect(offsetX).toBeCloseTo(ctx.tracking / 2, 6);
    expect(offsetX).toBeGreaterThan(0);
    const m = ctx.measureText(text);
    expect(m.actualBoundingBoxRight + offsetX).toBeCloseTo(m.actualBoundingBoxLeft - offsetX, 6);
  });

  it('aligns for a centred draw, since the ink correction is measured from that anchor', () => {
    const { ctx, as } = stubContext();
    setPlaqueType(as, 'MCU', CELL_HEIGHT, AVAILABLE);
    expect(ctx.textAlign).toBe('center');
    expect(ctx.textBaseline).toBe('middle');
  });

  it('scales with the cell rather than assuming one, so a resized cell needs no redraw', () => {
    const half = stubContext();
    const full = stubContext();
    const a = setPlaqueType(half.as, 'SPIDER-VERSE', 128, AVAILABLE / 2);
    const b = setPlaqueType(full.as, 'SPIDER-VERSE', 256, AVAILABLE);
    expect(b.fontSize).toBeCloseTo(a.fontSize * 2, 6);
    expect(half.ctx.tracking * 2).toBeCloseTo(full.ctx.tracking, 6);
  });
});
