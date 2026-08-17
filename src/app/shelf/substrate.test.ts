import { describe, expect, it } from 'vitest';
import { DIMENSIONS, type Form } from './instancing';
import { SUBSTRATE_SCALE, substrateValue } from './substrate';

// Single source for "every form" — DIMENSIONS is a Record<Form, ...> already required to
// cover all nine, so its keys are the form list rather than a hand-typed copy of one.
const FORMS = Object.keys(DIMENSIONS) as Form[];

const SIZE = 256;

describe('substrateValue', () => {
  it('always returns a value within 0..1', () => {
    for (const form of FORMS) {
      for (const [x, y] of [[0, 0], [1, 1], [255, 255], [128, 64], [64, 200], [200, 3]]) {
        const v = substrateValue(form, x, y, SIZE);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic — same inputs, same output, every call', () => {
    for (const form of FORMS) {
      const a = substrateValue(form, 37, 91, SIZE);
      const b = substrateValue(form, 37, 91, SIZE);
      expect(a).toBe(b);
    }
  });

  it('wraps seamlessly on the x axis: x=0 matches x=size for every y sampled', () => {
    for (const form of FORMS) {
      for (const y of [0, 17, 64, 128, 200, 255]) {
        const left = substrateValue(form, 0, y, SIZE);
        const right = substrateValue(form, SIZE, y, SIZE);
        expect(right).toBeCloseTo(left, 10);
      }
    }
  });

  it('wraps seamlessly on the y axis: y=0 matches y=size for every x sampled', () => {
    for (const form of FORMS) {
      for (const x of [0, 17, 64, 128, 200, 255]) {
        const top = substrateValue(form, x, 0, SIZE);
        const bottom = substrateValue(form, x, SIZE, SIZE);
        expect(bottom).toBeCloseTo(top, 10);
      }
    }
  });

  it('gives every form a genuinely different field, not the same noise relabelled', () => {
    // Sample a handful of points per form and compare the resulting vectors pairwise — a
    // generator that ignored `form` would produce identical vectors for every pair here.
    const samplePoints: Array<[number, number]> = [[10, 10], [50, 120], [200, 30], [90, 200], [5, 250]];
    const vectors = new Map<Form, number[]>();
    for (const form of FORMS) {
      vectors.set(form, samplePoints.map(([x, y]) => substrateValue(form, x, y, SIZE)));
    }
    for (let i = 0; i < FORMS.length; i++) {
      for (let j = i + 1; j < FORMS.length; j++) {
        const a = vectors.get(FORMS[i]!)!;
        const b = vectors.get(FORMS[j]!)!;
        expect(a).not.toEqual(b);
      }
    }
  });
});

describe('SUBSTRATE_SCALE', () => {
  it('has an entry for every form', () => {
    for (const form of FORMS) {
      expect(SUBSTRATE_SCALE[form]).toBeDefined();
    }
  });

  it('is positive and plausibly small (bumpScale territory, not a relief map)', () => {
    for (const form of FORMS) {
      expect(SUBSTRATE_SCALE[form]).toBeGreaterThan(0);
      expect(SUBSTRATE_SCALE[form]).toBeLessThan(0.2);
    }
  });

  it('makes steel and vhs the strongest, bluray and reel the weakest, per the brief', () => {
    const strong = [SUBSTRATE_SCALE.steel, SUBSTRATE_SCALE.vhs];
    const weak = [SUBSTRATE_SCALE.bluray, SUBSTRATE_SCALE.reel];
    for (const s of strong) {
      for (const w of weak) {
        expect(s).toBeGreaterThan(w);
      }
    }
  });
});
