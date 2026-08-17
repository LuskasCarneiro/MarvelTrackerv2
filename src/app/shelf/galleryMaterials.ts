/**
 * The gallery's two dressed surfaces — mahogany shelving and brass trim — for the room's
 * redress from plain wood into a bespoke collector's gallery under warm museum lighting.
 * Same family as substrate.ts's and roomSurfaces.ts's hashed value noise: small, seamlessly
 * tileable greyscale fields generated at runtime, no external textures and nothing fetched
 * (PLAN.md §6 rules out generative-AI product assets; procedural canvas noise is the approved
 * route, same as every other surface in `src/app/shelf/`).
 *
 * Unlike those two modules, these two textures double as a colour modulation as well as a
 * bump map: the scene shader mixes between two wood (or two brass) tones using the greyscale
 * value, so the signal has to be meaningful as pigment, not only as height — grain has to
 * genuinely darken the wood, not just bump it. See GALLERY_COLOUR_MIX.
 */

export type GallerySurface = 'mahogany' | 'brass';

/** One octave of periodic value noise: lattice cell counts across the 0..size tile on each
 *  axis, plus this octave's share of the sum. Identical shape to substrate.ts's and
 *  roomSurfaces.ts's Octave — kept local because neither exports it and this module must not
 *  edit either file. */
type Octave = { freqX: number; freqY: number; weight: number };

// Ribbon figure: broad, soft bands of alternating light and dark running the length of the
// grain, at a much lower frequency than the grain itself (MAHOGANY_GRAIN_OCTAVES, below) —
// the detail that makes mahogany read as expensive rather than as flat brown, and the one
// the brief names as most likely to be missed. A single very low-frequency octave gives this
// for free: value noise is inherently soft-edged, so the bands don't need a separate
// sine-wave construction to avoid looking mechanical.
const MAHOGANY_RIBBON_OCTAVES: Octave[] = [{ freqX: 4, freqY: 2, weight: 1 }];

// Grain: long streaks running along y, tightly spaced across x — same anisotropy convention
// as roomSurfaces.ts's FLOOR_GRAIN_OCTAVES. Two octaves, both sampled through the domain
// warp below rather than straight off the lattice, since an unwarped anisotropic lattice
// gives evenly-spaced streaks that read as corduroy, not wood. See mahoganyGrain.
const MAHOGANY_GRAIN_OCTAVES: Octave[] = [
  { freqX: 36, freqY: 4, weight: 0.6 },
  { freqX: 72, freqY: 7, weight: 0.4 }, // freqY off the first octave's multiple so they don't beat in phase
];

// How much weight the broad ribbon and the fine grain each get in the final blend. Grain
// dominates, as the texture's primary character, with ribbon giving the broad figure
// underneath it. Both composites are themselves normalised to 0..1 and these two weights
// sum to 1, so the blend can't leave that range either.
const MAHOGANY_RIBBON_WEIGHT = 0.3;
const MAHOGANY_GRAIN_WEIGHT = 0.7;

// Domain warp for the grain: a slow, independent field that displaces the grain octaves' x
// sample before it reaches the lattice, so the streaks flow and wander rather than marching
// in parallel at a fixed spacing. Frequencies are well below the grain's own — the warp
// should bend the grain, not add a texture of its own. Amplitude is a fraction of `size`
// rather than a pixel count, so the bend is the same relative size at any resolution; see
// mahoganyGrain's doc comment for why this still wraps at the tile edges.
const MAHOGANY_WARP_FREQ_X = 5;
const MAHOGANY_WARP_FREQ_Y = 4;
const MAHOGANY_WARP_SEED = 301;
const MAHOGANY_WARP_AMPLITUDE = 0.05;

// Mineral streaks: rare, localised darker marks, not a texture contributing to every pixel —
// see mahoganyStreak. Anisotropic the same way as the grain, so a streak runs with the fibre
// rather than across it. THRESHOLD is high, so only the field's upper slice qualifies as
// "occasional"; STRENGTH is how dark a streak gets at its darkest.
const MAHOGANY_STREAK_FREQ_X = 9;
const MAHOGANY_STREAK_FREQ_Y = 3;
const MAHOGANY_STREAK_SEED = 401;
const MAHOGANY_STREAK_THRESHOLD = 0.82;
const MAHOGANY_STREAK_STRENGTH = 0.3;

// Swing from mid-grey before clamping. Wide — unlike the room and substrate modules' bump-
// only fields, this one is read as pigment too (see this module's header comment), so it
// needs real contrast rather than a barely-there signal.
const MAHOGANY_AMPLITUDE = 0.8;

// Brushing plus a very slight broad mottle, as one octave stack: two anisotropic octaves for
// the brushing itself (long along x, tight spacing down y — same axis convention as
// substrate.ts's steel and can), markedly finer and more regular than any mahogany grain
// octave, plus one broad, near-isotropic octave so the sheet doesn't read as mechanically
// perfect.
const BRASS_OCTAVES: Octave[] = [
  { freqX: 4, freqY: 100, weight: 0.5 },
  { freqX: 4, freqY: 190, weight: 0.3 }, // finer still, tightens the brushing without a new direction
  { freqX: 4, freqY: 3, weight: 0.2 }, // broad mottle, breaks up the mechanical regularity
];

// Low swing from mid-grey — brass is read through its specular response, not its pigment, so
// the texture should modulate that subtly rather than paint visible stripes. Well under
// mahogany's amplitude on purpose; see GALLERY_COLOUR_MIX.
const BRASS_AMPLITUDE = 0.12;

/** bumpScale values for THREE, per surface. Mahogany carries real relief — deep grain and
 *  ribbon figure meant to be felt under the museum lamp — while brass is a machined, almost
 *  flat brushed finish that should barely displace at all, so the gap between the two is
 *  deliberately large. Exported so the scene invents no numbers of its own, same contract as
 *  substrate.ts's SUBSTRATE_SCALE and roomSurfaces.ts's ROOM_BUMP_SCALE. */
export const GALLERY_BUMP_SCALE: Record<GallerySurface, number> = {
  mahogany: 0.05,
  brass: 0.008,
};

/** How far this surface's greyscale pushes the shader's mix between its two colour tones,
 *  0..1. Unlike the room and substrate textures, these two are read as pigment as well as
 *  height (see this module's header comment): mahogany's grain has to visibly darken the
 *  wood, so it sits high; brass reads mostly through specular highlight and wants only a
 *  light tint from the texture, so it sits low. Exported so the scene invents no numbers of
 *  its own. */
export const GALLERY_COLOUR_MIX: Record<GallerySurface, number> = {
  mahogany: 0.85,
  brass: 0.2,
};

/** Integer hash of a lattice corner. Identical construction to substrate.ts's and
 *  roomSurfaces.ts's hashLattice — Math.imul keeps every multiply inside 32 bits, so the
 *  result is exact and platform-independent. Duplicated here rather than imported: neither
 *  sibling module exports it, and this module must not edit either file. */
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

/**
 * One octave of periodic value noise at (x, y) on a `size`-wide tile. Identical construction
 * to substrate.ts's and roomSurfaces.ts's octaveValue — the lattice index is wrapped, not the
 * sample point, so the seam falls out of the construction rather than needing a fix-up pass.
 *
 * That construction has a second consequence this module leans on directly: the result is
 * periodic in `size` for *any* real x (or y), not only for x already inside [0, size). Shift
 * x by `size` and gx shifts by the integer freqX, which leaves the interpolation fraction
 * unchanged and wraps ix0 and ix0+1 back to the same lattice corners. mahoganyGrain's domain
 * warp relies on exactly this to stay seamless despite displacing its sample point.
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

/** Weighted sum of a surface's octave stack at one point, normalised back to 0..1 — identical
 *  construction to substrate.ts's substrateValue and roomSurfaces.ts's stackedNoise. Octave
 *  index doubles as the hash seed, so two octaves that happen to share a frequency still draw
 *  from independent lattices rather than being the same field twice. */
function stackedNoise(octaves: Octave[], x: number, y: number, size: number): number {
  let sum = 0;
  let totalWeight = 0;
  octaves.forEach((octave, i) => {
    sum += octaveValue(x, y, size, octave.freqX, octave.freqY, i) * octave.weight;
    totalWeight += octave.weight;
  });
  return sum / totalWeight;
}

/**
 * The domain-warped grain composite: MAHOGANY_GRAIN_OCTAVES sampled at an x that has been
 * pushed sideways by a slow, independent noise field, so the streaks flow and wander instead
 * of marching in parallel at a fixed lattice spacing. An unwarped anisotropic lattice is
 * exactly what roomSurfaces.ts's FLOOR_GRAIN_OCTAVES samples straight, and on a floor that
 * regular spacing is fine; on mahogany it reads as corduroy, not wood.
 *
 * Seamless despite the warp: octaveValue is periodic in `size` for any real x, not only x in
 * [0, size) — see its doc comment. `warp` is itself such a periodic field, so
 * warpedX(x + size, y) === warpedX(x, y) + size exactly, and the grain sampled there lands on
 * precisely the lattice position it started from. The same argument holds again on y, with x
 * held fixed, since the warp only ever touches the x sample.
 */
function mahoganyGrain(x: number, y: number, size: number): number {
  const warp = octaveValue(x, y, size, MAHOGANY_WARP_FREQ_X, MAHOGANY_WARP_FREQ_Y, MAHOGANY_WARP_SEED);
  const warpedX = x + (warp - 0.5) * MAHOGANY_WARP_AMPLITUDE * size;
  return stackedNoise(MAHOGANY_GRAIN_OCTAVES, warpedX, y, size);
}

/** Occasional darker mineral streaks: a low-frequency field that only contributes where it
 *  crosses a high threshold, so most of the surface is untouched and the rest gets a streak
 *  that fades in from zero at its edge — same shape as roomSurfaces.ts's floorValue seam
 *  groove, applied to a threshold instead of a distance-to-joint. */
function mahoganyStreak(x: number, y: number, size: number): number {
  const field = octaveValue(x, y, size, MAHOGANY_STREAK_FREQ_X, MAHOGANY_STREAK_FREQ_Y, MAHOGANY_STREAK_SEED);
  if (field <= MAHOGANY_STREAK_THRESHOLD) return 0;
  return ((field - MAHOGANY_STREAK_THRESHOLD) / (1 - MAHOGANY_STREAK_THRESHOLD)) * MAHOGANY_STREAK_STRENGTH;
}

/** Pure and deterministic: mahogany's composite field — broad ribbon figure blended under
 *  fine, warped grain, then darkened by the occasional mineral streak. */
function mahoganyValue(x: number, y: number, size: number): number {
  const ribbon = stackedNoise(MAHOGANY_RIBBON_OCTAVES, x, y, size);
  const grain = mahoganyGrain(x, y, size);
  const combined = ribbon * MAHOGANY_RIBBON_WEIGHT + grain * MAHOGANY_GRAIN_WEIGHT;
  const base = 0.5 + (combined - 0.5) * MAHOGANY_AMPLITUDE;
  return Math.min(1, Math.max(0, base - mahoganyStreak(x, y, size)));
}

/** Pure and deterministic: brass's composite field — fine, regular linear brushing plus a
 *  slight broad mottle, at low amplitude throughout. Deliberately unwarped, unlike mahogany's
 *  grain: a machined brushed finish is meant to look regular, not flowing. */
function brassValue(x: number, y: number, size: number): number {
  const noise = stackedNoise(BRASS_OCTAVES, x, y, size);
  return Math.min(1, Math.max(0, 0.5 + (noise - 0.5) * BRASS_AMPLITUDE));
}

/**
 * Pure, deterministic, wraps seamlessly at the tile edges on both axes — the tested part.
 * Mahogany's warp and streak passes are both built from periodic fields sampled through the
 * same octaveValue/wrap machinery as everything else here, so the seam guarantee holds for
 * the composite, not only for a single raw octave — see mahoganyGrain's doc comment for the
 * argument.
 */
export function gallerySurfaceValue(surface: GallerySurface, x: number, y: number, size: number): number {
  return surface === 'mahogany' ? mahoganyValue(x, y, size) : brassValue(x, y, size);
}

/**
 * A seamlessly tileable greyscale texture for one surface, `size` x `size`, used both as a
 * bump map and to drive the scene's colour mix — see this module's header comment. Built via
 * ImageData rather than a per-pixel fillRect, same reasoning as substrate.ts's buildSubstrate.
 *
 * Default 512 for both surfaces, above the sibling modules' 256: mahogany's grain is layered
 * up to freqX 72 (MAHOGANY_GRAIN_OCTAVES) and brass's brushing up to freqY 190 (BRASS_OCTAVES)
 * — at 256px either would sit close to one lattice cell per pixel, which is short of the
 * resolution fine grain and tight brushing both want.
 */
export function buildGallerySurface(surface: GallerySurface, size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('buildGallerySurface: 2D context unavailable');

  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grey = Math.round(gallerySurfaceValue(surface, x, y, size) * 255);
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
