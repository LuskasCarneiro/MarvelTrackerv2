import { describe, expect, it } from 'vitest';
import { packSpineCells } from './spineAtlas';

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

describe('packSpineCells', () => {
  // Defaults: atlasWidth 2048, cellWidth 512 -> 4 columns, cellHeight 48.
  const COLUMNS = 4;

  it('gives a valid minimal atlas for zero titles, not a degenerate one', () => {
    const { cells, width, height } = packSpineCells(0);
    expect(cells).toHaveLength(0);
    expect(width).toBe(2048);
    expect(height).toBeGreaterThan(0);
    expect(isPowerOfTwo(height)).toBe(true);
  });

  it('places a single cell at the origin', () => {
    const { cells, width, height } = packSpineCells(1);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 512, h: 48 });
    assertValidLayout(cells, width, height);
  });

  it('fills exactly one full row without starting a second', () => {
    const { cells, width, height } = packSpineCells(COLUMNS);
    expect(cells).toHaveLength(COLUMNS);
    // All on row 0.
    for (const cell of cells) expect(cell.y).toBe(0);
    assertValidLayout(cells, width, height);
  });

  it('wraps to a second row for one more than a full row', () => {
    const { cells, width, height } = packSpineCells(COLUMNS + 1);
    expect(cells).toHaveLength(COLUMNS + 1);
    const last = cells[cells.length - 1]!;
    expect(last.x).toBe(0);
    expect(last.y).toBe(48);
    assertValidLayout(cells, width, height);
  });

  it('lays out the real catalogue size (152) with no overlaps and power-of-two height', () => {
    const { cells, width, height } = packSpineCells(152);
    expect(cells).toHaveLength(152);
    expect(isPowerOfTwo(height)).toBe(true);
    assertValidLayout(cells, width, height);
  });

  it('rounds height up to the next power of two rather than an exact multiple', () => {
    // 152 titles / 4 columns = 38 rows * 48px = 1824, which is not itself a power of two.
    const { height } = packSpineCells(152);
    expect(height).toBe(2048);
  });

  it('guards a cellWidth larger than the atlas width instead of dividing by zero', () => {
    const { cells, width, height } = packSpineCells(3, { atlasWidth: 512, cellWidth: 2048 });
    expect(cells).toHaveLength(3);
    // Clamped so every cell still obeys "never extends past width".
    assertValidLayout(cells, width, height);
  });

  it('respects custom atlasWidth, cellWidth and cellHeight', () => {
    const { cells, width, height } = packSpineCells(5, { atlasWidth: 256, cellWidth: 128, cellHeight: 32 });
    // 2 columns at this width.
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 128, h: 32 });
    expect(cells[1]).toEqual({ x: 128, y: 0, w: 128, h: 32 });
    expect(cells[2]).toEqual({ x: 0, y: 32, w: 128, h: 32 });
    assertValidLayout(cells, width, height);
  });
});
