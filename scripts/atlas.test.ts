import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import atlas from '../data/atlas.json';
import artwork from '../data/artwork.json';

/**
 * The atlas is a committed build artifact that the 3D shelf reads directly, so a fault here
 * shows up as the wrong cover on a case — or a blank one — with nothing thrown anywhere.
 *
 * What this file does NOT check, because it has no network: that the cell a slug points at
 * actually contains that slug's artwork. That was verified once, against all 149 covers, by
 * extracting each cell and comparing it pixel-by-pixel with a freshly fetched poster —
 * worst mean absolute difference 8.5 (WebP loss) against a cross-title floor around 50.
 * Re-run that by hand if the packing order in scripts/build-atlas.ts ever changes.
 *
 * A note on that verification, because it nearly produced a false alarm: the atlases carry
 * an alpha channel and the source posters do not, so comparing the raw buffers directly
 * compares RGBA against RGB and every title looks wrong. All five samples "failing"
 * identically was the tell. Prove the harness before believing the failure.
 */

type Cell = { atlas: number; x: number; y: number };
const cells = atlas.cells as Record<string, Cell>;
const withPoster = Object.entries(artwork as Record<string, { poster: string | null }>)
  .filter(([, entry]) => entry.poster !== null)
  .map(([slug]) => slug);

describe('cover atlas', () => {
  it('packs every title that has artwork, and only those', () => {
    expect(Object.keys(cells).sort()).toEqual(withPoster.sort());
  });

  it('leaves the three unreleased titles out rather than inventing a placeholder', () => {
    expect(Object.keys(artwork).length - withPoster.length).toBe(3);
  });

  it('has written every atlas file the manifest claims', () => {
    for (const file of atlas.atlases) {
      const path = resolve(import.meta.dirname, '..', 'public', 'atlas', file);
      expect(existsSync(path), `${file} is in the manifest but not on disk`).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(10_000);
    }
  });

  it('gives every title its own cell', () => {
    const seen = new Set(Object.values(cells).map((c) => `${c.atlas}:${c.x}:${c.y}`));
    expect(seen.size).toBe(Object.keys(cells).length);
  });

  it('keeps every cell inside its atlas', () => {
    for (const [slug, cell] of Object.entries(cells)) {
      expect(cell.atlas, slug).toBeLessThan(atlas.atlases.length);
      expect(cell.x + atlas.cell.w, slug).toBeLessThanOrEqual(atlas.atlasSize);
      expect(cell.y + atlas.cell.h, slug).toBeLessThanOrEqual(atlas.atlasSize);
    }
  });

  it('uses a cell shaped like a DVD face, not like the poster it came from', () => {
    // 135 x 190 mm is 0.711. A TMDB poster is 0.667. Packing at the poster's aspect and
    // stretching to fit at render time is the failure this ratio exists to prevent.
    expect(atlas.cell.w / atlas.cell.h).toBeCloseTo(135 / 190, 2);
  });
});
