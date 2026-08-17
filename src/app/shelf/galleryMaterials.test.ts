import { describe, expect, it } from 'vitest';
import { GALLERY_BUMP_SCALE, GALLERY_COLOUR_MIX, gallerySurfaceValue, type GallerySurface } from './galleryMaterials';

const SURFACES: GallerySurface[] = ['mahogany', 'brass'];
const SIZE = 256;

function variance(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

describe('gallerySurfaceValue', () => {
  it('always returns a value within 0..1', () => {
    for (const surface of SURFACES) {
      for (const [x, y] of [[0, 0], [1, 1], [255, 255], [128, 64], [64, 200], [200, 3]]) {
        const v = gallerySurfaceValue(surface, x, y, SIZE);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic — same inputs, same output, every call', () => {
    for (const surface of SURFACES) {
      const a = gallerySurfaceValue(surface, 37, 91, SIZE);
      const b = gallerySurfaceValue(surface, 37, 91, SIZE);
      expect(a).toBe(b);
    }
  });

  it('wraps seamlessly on the x axis: x=0 matches x=size for every y sampled', () => {
    for (const surface of SURFACES) {
      for (const y of [0, 17, 64, 128, 200, 255]) {
        const left = gallerySurfaceValue(surface, 0, y, SIZE);
        const right = gallerySurfaceValue(surface, SIZE, y, SIZE);
        expect(right).toBeCloseTo(left, 10);
      }
    }
  });

  it('wraps seamlessly on the y axis: y=0 matches y=size for every x sampled', () => {
    for (const surface of SURFACES) {
      for (const x of [0, 17, 64, 128, 200, 255]) {
        const top = gallerySurfaceValue(surface, x, 0, SIZE);
        const bottom = gallerySurfaceValue(surface, x, SIZE, SIZE);
        expect(bottom).toBeCloseTo(top, 10);
      }
    }
  });

  it('gives mahogany and brass genuinely different fields, not the same noise relabelled', () => {
    const samplePoints: Array<[number, number]> = [[10, 10], [50, 120], [200, 30], [90, 200], [5, 250]];
    const mahoganyValues = samplePoints.map(([x, y]) => gallerySurfaceValue('mahogany', x, y, SIZE));
    const brassValues = samplePoints.map(([x, y]) => gallerySurfaceValue('brass', x, y, SIZE));
    expect(mahoganyValues).not.toEqual(brassValues);
  });

  it('gives mahogany structure at more than one scale, not one octave of grain', () => {
    // A single octave of anisotropic noise — the "cheap veneer" failure the brief names —
    // has one characteristic feature size and nothing else: block-averaging it over a
    // window a few cells wide cancels most of its variance away, the same way averaging
    // cancels any noise with no lower-frequency component riding underneath it. Mahogany's
    // ribbon figure is exactly that lower-frequency component, so it should survive being
    // averaged out in a way a single grain octave would not.
    //
    // This scanline crosses both several grain cells (freqX 36/72 against a 256-wide tile,
    // so a handful of pixels per cell) and a full ribbon cycle (freqX 4, so ~64px per cell),
    // so a short window sees the grain and a block low-pass sees the ribbon.
    const y = 96;
    const values = Array.from({ length: SIZE }, (_, x) => gallerySurfaceValue('mahogany', x, y, SIZE));

    const windowSize = 12;
    let maxShortVariance = 0;
    for (let start = 0; start + windowSize <= SIZE; start += windowSize) {
      maxShortVariance = Math.max(maxShortVariance, variance(values.slice(start, start + windowSize)));
    }

    const blockSize = 32;
    const blockAverages: number[] = [];
    for (let start = 0; start + blockSize <= SIZE; start += blockSize) {
      const block = values.slice(start, start + blockSize);
      blockAverages.push(block.reduce((a, b) => a + b, 0) / block.length);
    }
    const longVariance = variance(blockAverages);

    // Weak on purpose, per the brief: this doesn't prove the layering is exactly right, only
    // that fine-scale and broad-scale variation both genuinely exist rather than one being a
    // rounding artefact of the other.
    expect(maxShortVariance).toBeGreaterThan(0.0005);
    expect(longVariance).toBeGreaterThan(0.0005);
  });
});

describe('GALLERY_BUMP_SCALE', () => {
  it('has a positive, plausibly small entry for both surfaces', () => {
    for (const surface of SURFACES) {
      expect(GALLERY_BUMP_SCALE[surface]).toBeGreaterThan(0);
      expect(GALLERY_BUMP_SCALE[surface]).toBeLessThan(0.2);
    }
  });

  it('makes mahogany read stronger than the near-flat brass, per the brief', () => {
    expect(GALLERY_BUMP_SCALE.mahogany).toBeGreaterThan(GALLERY_BUMP_SCALE.brass);
  });
});

describe('GALLERY_COLOUR_MIX', () => {
  it('stays within 0..1 for both surfaces', () => {
    for (const surface of SURFACES) {
      expect(GALLERY_COLOUR_MIX[surface]).toBeGreaterThanOrEqual(0);
      expect(GALLERY_COLOUR_MIX[surface]).toBeLessThanOrEqual(1);
    }
  });

  it('pushes mahogany much harder than brass, per the brief', () => {
    expect(GALLERY_COLOUR_MIX.mahogany).toBeGreaterThan(GALLERY_COLOUR_MIX.brass);
  });
});
