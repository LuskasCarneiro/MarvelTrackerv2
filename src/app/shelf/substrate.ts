import type { Form } from './instancing';

/**
 * Shared substrate bump maps — PLAN.md section 1 point 2's fix for materials that were
 * shininess-only. Every form gets a small, seamlessly tileable greyscale texture generated
 * here at runtime and layered under the per-item detail (spine art, back cover) as THREE's
 * bumpMap. No external textures: everything below is a hashed value-noise field, same
 * family as backCover.ts's deterministic barcode, just mixed for two dimensions instead
 * of one.
 */

/** One octave of periodic value noise: how many lattice cells fit across the tile on each
 *  axis, and how much this octave contributes to the sum. Anisotropic frequencies (freqX
 *  != freqY) are what give steel and can their horizontal streaks, and volume its weave —
 *  a low frequency on one axis stretches the grain long in that direction. */
type Octave = { freqX: number; freqY: number; weight: number };

// One recipe per form, all built from the same noise. Frequencies are lattice cell counts
// across the 0..size tile, not pixels, so they read the same regardless of `size`.
const NOISE_RECIPES: Record<Form, Octave[]> = {
  // Litho card: soft fibrous grain, running slightly vertical, the coarsest and most
  // pronounced of the case forms per the brief.
  vhs: [
    { freqX: 5, freqY: 20, weight: 0.6 },
    { freqX: 11, freqY: 42, weight: 0.4 },
  ],
  // Polypropylene: very fine, even, isotropic micro-texture.
  amaray: [
    { freqX: 24, freqY: 24, weight: 0.5 },
    { freqX: 48, freqY: 48, weight: 0.5 },
  ],
  // As amaray, finer still.
  bluray: [
    { freqX: 32, freqY: 32, weight: 0.5 },
    { freqX: 64, freqY: 64, weight: 0.5 },
  ],
  // Brushed metal — the reason the task exists. Streaks run horizontal: long along x (low
  // freqX), fine spacing down y (high freqY).
  steel: [{ freqX: 4, freqY: 64, weight: 1 }],
  // A thin matte card standing in for "no physical release" — duller and rougher than
  // amaray, so coarser and lower frequency than it, not finer.
  none: [
    { freqX: 10, freqY: 10, weight: 0.6 },
    { freqX: 20, freqY: 20, weight: 0.4 },
  ],
  // Rough pitted clay: coarse isotropic blobs plus a finer layer for the pitting.
  tablet: [
    { freqX: 8, freqY: 8, weight: 0.5 },
    { freqX: 16, freqY: 16, weight: 0.3 },
    { freqX: 32, freqY: 32, weight: 0.2 },
  ],
  // Woven buckram cloth: two strongly anisotropic octaves crossed at right angles, one
  // standing for the warp thread and one for the weft.
  volume: [
    { freqX: 6, freqY: 40, weight: 0.5 },
    { freqX: 40, freqY: 6, weight: 0.5 },
  ],
  // Brushed metal, same treatment as steel — close but not identical (a slightly coarser
  // brush), so a real can lid still reads as its own object rather than a steelbook twin.
  can: [{ freqX: 5, freqY: 56, weight: 1 }],
  // Smooth plastic: very high frequency, near-flat.
  reel: [{ freqX: 48, freqY: 48, weight: 1 }],
};

/** How strongly each form's substrate should displace, for THREE's bumpScale. Small — the
 *  low hundredths is "subtle surface", not "relief map". Steel and vhs read the strongest
 *  (steel is the form the task exists for; vhs is the coarsest card), bluray and reel the
 *  weakest (glossy, smooth, meant to be barely felt). Exported so the scene does not invent
 *  its own numbers per form. */
export const SUBSTRATE_SCALE: Record<Form, number> = {
  vhs: 0.05,
  amaray: 0.02,
  bluray: 0.012,
  steel: 0.06,
  none: 0.03,
  tablet: 0.045,
  volume: 0.035,
  can: 0.055,
  reel: 0.01,
};

/** Integer hash of a lattice corner, mixed harder than backCover's 1D LCG since this feeds
 *  a 2D lattice: two axes plus an octave seed all need to land in unrelated buckets, not
 *  just march forward one step at a time. Math.imul keeps every multiply inside 32 bits, so
 *  results are exact and identical on every platform (no float-precision drift a plain `*`
 *  would risk once the intermediate exceeds 2^53). */
function hashLattice(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 4096) / 4096; // 0..1
}

/** Ease curve for the bilinear blend — plain linear interpolation gives the lattice a
 *  visible grid; smoothstep hides it. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Wraps n into [0, m) — the modulo the lattice indices need, since JS's `%` keeps the sign
 *  of its left operand and would hand back a negative index for anything left of x=0. */
function wrap(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * One octave of periodic value noise at (x, y) on a `size`-wide tile: a freqX x freqY
 * lattice of hashed corner values, bilinearly interpolated.
 *
 * Seamlessness falls out of the construction rather than needing a seam-fix pass: the
 * lattice index is wrapped (`wrap(ix0, freqX)`), not the sample point, so cell freqX-1 and
 * cell 0 are genuinely adjacent on a ring. At x=0 and x=size, gx lands on an exact integer
 * (0 and freqX respectively) either way, so the interpolation fraction is 0 at both edges
 * and the two ends sample precisely the same lattice corners — not just close, equal.
 */
function octaveValue(x: number, y: number, size: number, freqX: number, freqY: number, seed: number): number {
  const gx = (x / size) * freqX;
  const gy = (y / size) * freqY;
  const ix0 = Math.floor(gx);
  const iy0 = Math.floor(gy);
  const fx = smoothstep(gx - ix0);
  const fy = smoothstep(gy - iy0);

  const x0 = wrap(ix0, freqX);
  const x1 = wrap(ix0 + 1, freqX);
  const y0 = wrap(iy0, freqY);
  const y1 = wrap(iy0 + 1, freqY);

  const v00 = hashLattice(x0, y0, seed);
  const v10 = hashLattice(x1, y0, seed);
  const v01 = hashLattice(x0, y1, seed);
  const v11 = hashLattice(x1, y1, seed);

  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Pure and deterministic: the weighted sum of a form's octaves at one point, normalised
 * back to 0..1 (every octave is itself within 0..1, so the weighted average can't leave
 * that range). Wraps seamlessly on both axes — see octaveValue's doc comment for why.
 */
export function substrateValue(form: Form, x: number, y: number, size: number): number {
  const recipe = NOISE_RECIPES[form];
  let sum = 0;
  let totalWeight = 0;
  recipe.forEach((octave, i) => {
    // Octave index doubles as the hash seed, so two forms that happen to share a
    // frequency still draw from independent lattices rather than being the same field
    // twice.
    sum += octaveValue(x, y, size, octave.freqX, octave.freqY, i) * octave.weight;
    totalWeight += octave.weight;
  });
  return sum / totalWeight;
}

/**
 * A seamlessly tileable greyscale bump texture for one form, `size` x `size`. Built via
 * ImageData rather than a per-pixel fillRect — 65k canvas calls at the default 256x256
 * would be the slow path drawBackCover and buildSpineAtlas both avoid.
 */
export function buildSubstrate(form: Form, size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('buildSubstrate: 2D context unavailable');

  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Noise is uniform-hash-driven so it already centres around mid-grey on average —
      // no separate recentring step needed for the bump to displace both ways.
      const grey = Math.round(substrateValue(form, x, y, size) * 255);
      const i = (y * size + x) * 4;
      image.data[i] = grey;
      image.data[i + 1] = grey;
      image.data[i + 2] = grey;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
