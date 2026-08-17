/**
 * The room's two surfaces — floor and wall plaster — for the single travelling lamp to
 * catch. `docs/05-3d-shelf.md` names the danger directly: a half-built room reads as a bad
 * game level, and the defence is restraint plus real surfaces, not props. So there are only
 * two textures here, both small, seamlessly tileable greyscale bump maps generated at
 * runtime, same family as substrate.ts's hashed value noise — just carrying a groove pass
 * on top for the floorboards, since a floor is the one surface here that has to *read* as
 * something rather than just take a bump.
 */

export type RoomSurface = 'floor' | 'plaster';

/** One octave of periodic value noise: lattice cell counts across the 0..size tile on each
 *  axis, plus this octave's share of the sum. See substrate.ts for the reasoning — this is
 *  the same recipe shape, kept local because substrate.ts exports no helpers to share. */
type Octave = { freqX: number; freqY: number; weight: number };

// Plaster: two isotropic octaves, near the same frequencies substrate.ts gives bluray and
// reel — smooth, soft, "barely there". A wall's job is to catch the lamp's falloff, not to
// have an opinion.
const PLASTER_OCTAVES: Octave[] = [
  { freqX: 18, freqY: 18, weight: 0.6 },
  { freqX: 36, freqY: 34, weight: 0.4 }, // freqY off by 2 so the two octaves don't beat in phase
];

// Floor grain: elongated along y (the run of the plank), fine across x (the width) — same
// anisotropy substrate.ts uses for steel's brushed streaks, just applied to wood instead of
// metal: high freqX (fine spacing across the board), low freqY (long, uninterrupted along
// its length).
const FLOOR_GRAIN_OCTAVES: Octave[] = [
  { freqX: 26, freqY: 3, weight: 0.65 },
  { freqX: 52, freqY: 5, weight: 0.35 },
];

// How many plank columns run across one tile, and how many end-joint segments run down one
// plank's length. Both integer, so the lattice — and the seams cut into it — close up
// exactly at the tile edge; see roomSurfaceValue's doc comment for why that matters.
const FLOOR_PLANK_COLUMNS = 9;
const FLOOR_SEGMENTS_PER_PLANK = 5;

// Seam groove shape: how far (in lattice units, i.e. a fraction of one plank's width or one
// segment's length) the groove reaches from the joint line, and how dark it gets at the
// joint itself. Kept well under 0.5 of a lattice unit so neighbouring seams never overlap.
const SEAM_HALF_WIDTH = 0.07;
const SEAM_STRENGTH = 0.55;

// Amplitudes: how far each surface's noise swings from mid-grey before the seam pass. The
// floor's grain is a texture you're meant to feel; the plaster's is barely a suggestion.
const FLOOR_GRAIN_AMPLITUDE = 0.16;
const PLASTER_AMPLITUDE = 0.05;

// Hash seeds — arbitrary but distinct, so the per-plank contrast jitter and the per-plank
// stagger offset draw from independent fields rather than the same lattice twice.
const SEED_PLANK_CONTRAST = 101;
const SEED_PLANK_STAGGER = 202;

/** bumpScale values for THREE, per surface. The floor's plank seams need to read as real
 *  grooves under the lamp, so it sits an order of magnitude above the plaster, which should
 *  be almost unfelt — a wall that visibly bumps under the light stops reading as a wall.
 *  Exported so ShelfScene invents no numbers of its own, same contract as substrate.ts's
 *  SUBSTRATE_SCALE. */
export const ROOM_BUMP_SCALE: Record<RoomSurface, number> = {
  floor: 0.08,
  plaster: 0.006,
};

/** Integer hash of a lattice corner. Identical construction to substrate.ts's hashLattice —
 *  Math.imul keeps every multiply inside 32 bits, so the result is exact and platform-
 *  independent. Duplicated here rather than imported: substrate.ts exports nothing below
 *  buildSubstrate, and this module must not edit that file. */
function hashLattice(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 4096) / 4096; // 0..1
}

/** Ease curve for the bilinear blend — see substrate.ts: plain linear leaves a visible grid. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Wraps n into [0, m) — JS's `%` keeps the sign of its left operand, which would hand back
 *  a negative lattice index for anything left of x=0 or above y=0. */
function wrap(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** One octave of periodic value noise at (x, y) on a `size`-wide tile. Identical
 *  construction to substrate.ts's octaveValue — the lattice index is wrapped, not the
 *  sample point, so the seam falls out of the construction rather than needing a fix-up
 *  pass. See that file's doc comment for the full argument. */
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

/** Weighted sum of a surface's octave stack at one point, normalised back to 0..1. */
function stackedNoise(octaves: Octave[], x: number, y: number, size: number): number {
  let sum = 0;
  let totalWeight = 0;
  octaves.forEach((octave, i) => {
    sum += octaveValue(x, y, size, octave.freqX, octave.freqY, i) * octave.weight;
    totalWeight += octave.weight;
  });
  return sum / totalWeight;
}

/** Distance from `v` to the nearest integer — used to find how close a sample sits to a
 *  plank joint. Wraps for free: `v` is itself built from a periodic lattice coordinate (see
 *  roomSurfaceValue), so the boundary at the tile's two edges is the same physical joint on
 *  both sides and this returns the same distance for both. */
function distanceToJoint(v: number): number {
  return Math.abs(v - Math.round(v));
}

/**
 * Pure and deterministic: the floorboards' plank-and-seam field. `gx` is the x coordinate in
 * plank-column lattice units (0..FLOOR_PLANK_COLUMNS); every integer value of gx is a column
 * boundary — a long seam running the full length of the floor. `colIndex` is that column,
 * wrapped, and drives two per-plank jitters so neighbouring boards don't look stamped from
 * the same die: a contrast jitter on the grain, and a phase offset on the end-joint spacing
 * (the stagger the brief asks for — each column's joints land at a different point along its
 * length, so no row of joints lines up across the floor).
 */
function floorValue(x: number, y: number, size: number): number {
  const gx = (x / size) * FLOOR_PLANK_COLUMNS;
  const colIndex = wrap(Math.floor(gx), FLOOR_PLANK_COLUMNS);

  const grain = stackedNoise(FLOOR_GRAIN_OCTAVES, x, y, size);
  const contrastJitter = 0.85 + 0.3 * hashLattice(colIndex, 0, SEED_PLANK_CONTRAST); // 0.85..1.15
  const base = 0.5 + (grain - 0.5) * FLOOR_GRAIN_AMPLITUDE * contrastJitter;

  const longSeam = distanceToJoint(gx);

  // Each column's end joints are shifted by its own fractional offset, so column-to-column
  // the joints stagger rather than lining up into a grid — the "regularity that makes a bad
  // game floor" the brief warns against.
  const stagger = hashLattice(colIndex, 1, SEED_PLANK_STAGGER); // 0..1, one offset per column
  const gy = (y / size) * FLOOR_SEGMENTS_PER_PLANK - stagger;
  const endSeam = distanceToJoint(gy);

  const seamDistance = Math.min(longSeam, endSeam);
  const groove = seamDistance < SEAM_HALF_WIDTH ? (1 - seamDistance / SEAM_HALF_WIDTH) * SEAM_STRENGTH : 0;

  return Math.min(1, Math.max(0, base - groove));
}

/** Pure and deterministic: the plaster's near-flat cloudy field, centred on mid-grey. */
function plasterValue(x: number, y: number, size: number): number {
  const noise = stackedNoise(PLASTER_OCTAVES, x, y, size);
  return Math.min(1, Math.max(0, 0.5 + (noise - 0.5) * PLASTER_AMPLITUDE));
}

/**
 * Pure, deterministic, wraps seamlessly at the tile edges on both axes — the tested part.
 * `floor`'s seams (both the long plank-to-plank seam and the staggered end joints) are built
 * from lattice coordinates that are themselves periodic in `size`, so the groove pass wraps
 * for the same reason octaveValue's noise does: the two tile edges evaluate to the same
 * lattice position, not just a close one.
 */
export function roomSurfaceValue(surface: RoomSurface, x: number, y: number, size: number): number {
  return surface === 'floor' ? floorValue(x, y, size) : plasterValue(x, y, size);
}

/**
 * A seamlessly tileable greyscale bump texture for one surface, `size` x `size`. Built via
 * ImageData rather than a per-pixel fillRect, same reasoning as substrate.ts's buildSubstrate.
 */
export function buildRoomSurface(surface: RoomSurface, size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('buildRoomSurface: 2D context unavailable');

  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grey = Math.round(roomSurfaceValue(surface, x, y, size) * 255);
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
