// Pure layout math for the shelf scene: medium dimensions, per-title thickness, row
// positions and the atlas UV crop. No React, no WebGL context — just numbers and
// THREE.Matrix4/Vector3 value objects (three's math classes have no DOM dependency), so
// this is readable and testable in isolation. See instancing.test.ts.

import * as THREE from "three";
import type { Medium } from "@/lib/catalogue";

export type ShelfTitleData = {
  slug: string;
  runtimeMin: number | null;
  tint: string;
  medium: Medium;
  releaseYear: number;
  /** When the story happens, for the story ordering. Null for the 14 titles that belong
   * outside time — see lib/chronology.ts and docs/05-3d-shelf.md §5. */
  storyYear: number | null;
};

/** An era's name, from catalogue.ts — user-facing copy, so it travels rather than being
 * re-typed here. The scene turns these into the landmark buttons. */
export type EraLabel = { medium: Medium; label: string };

// Real millimetres, 1 unit = 100mm — the brief's case-dimensions table, verbatim.
const DIMENSIONS_MM: Record<Medium, { h: number; w: number; d: number }> = {
  vhs: { h: 197, w: 110, d: 32 },
  amaray: { h: 190, w: 135, d: 14 },
  bluray: { h: 171, w: 135, d: 12 },
  steel: { h: 172, w: 135, d: 15 },
  none: { h: 190, w: 135, d: 3 },
};

export const DIMENSIONS: Record<Medium, { h: number; w: number; d: number }> = Object.fromEntries(
  Object.entries(DIMENSIONS_MM).map(([medium, { h, w, d }]) => [medium, { h: h / 100, w: w / 100, d: d / 100 }])
) as Record<Medium, { h: number; w: number; d: number }>;

/**
 * Corner rounding. One constant for every medium: RoundedBoxGeometry clamps radius to half
 * the shortest side itself (see three/examples/jsm/geometries/RoundedBoxGeometry.js), so
 * the 3mm-thick 'none' card auto-clamps to a sliver without a special case here.
 */
export const CORNER_RADIUS = 0.025;

/**
 * The era's material, translated from PLAN.md §2's words into MeshPhongMaterial params:
 * matte litho cardboard (vhs) -> polypropylene, low sheen (amaray) -> thinner, glossier
 * (bluray) -> embossed metal, high specular (steel). 'none' is deliberately duller than all
 * of them — "a thin matte card", not a case (see the brief).
 */
export const BODY_MATERIAL: Record<Medium, { color: string; shininess: number; specular: string }> = {
  vhs: { color: "#17130f", shininess: 25, specular: "#2b241c" },
  amaray: { color: "#15120f", shininess: 55, specular: "#3a332b" }, // = the spike, exactly
  bluray: { color: "#100e0c", shininess: 70, specular: "#463e34" },
  steel: { color: "#131313", shininess: 100, specular: "#8f897f" },
  none: { color: "#231f1a", shininess: 4, specular: "#1a1714" },
};

/** The cover sits under a clear sleeve that is glossier than the case itself — except
 * 'none', which has no sleeve at all ("no gloss", per the brief). */
export const COVER_SHININESS: Record<Medium, number> = {
  vhs: 60,
  amaray: 95, // = the spike, exactly
  bluray: 105,
  steel: 115,
  none: 4,
};

const GAP_X = 0.025; // ~2.5cm between cases in a row
const ROW_CLEARANCE = 0.15; // headroom above a row's cases, below the board above
const BOARD_THICKNESS = 0.04;
const BOARD_LIP_HEIGHT = 0.02;
const BOARD_MARGIN = 0.08; // the board overhangs the end cases a little
const BOARD_DEPTH = 0.5;
const COVER_INSET = 0.0015; // = the spike's INSET: the printed insert sits proud of the body
const BLANK_COVER_INSET = 0.006; // further forward still, so it wins the depth test outright

/**
 * Thickness encodes runtime, ±20% off each medium's base depth, drawn from the catalogue's
 * own runtime range so it never goes stale. A null runtime gets the thinnest depth, never a
 * fabricated middle — spineWidth() in catalogue.ts makes the same call for the DOM spines.
 *
 * Logarithmic, not linear: runtimeMin is "episodes x length" for series (PLAN.md §2), and
 * three VHS-era animated series run 1,268–5,025 minutes against a 24-minute short at the
 * other end (measured from data/titles.json). A linear map over that raw range pins 148 of
 * 152 titles within a whisker of the thinnest depth, so only the VHS row would show any
 * variation at all. Log is the standard fix for a long-tailed range: ordering is unchanged,
 * the extremes still land at 0.8x/1.2x, and a typical 90–180 minute film becomes
 * distinguishable from its neighbours instead of rounding down to "the short one".
 */
export function runtimeLogRange(titles: ShelfTitleData[]): { min: number; max: number } {
  const runtimes = titles.map((t) => t.runtimeMin).filter((n): n is number => n != null);
  return { min: Math.log(Math.min(...runtimes)), max: Math.log(Math.max(...runtimes)) };
}

export function depthScale(runtimeMin: number | null, logRange: { min: number; max: number }): number {
  if (runtimeMin == null) return 0.8;
  if (logRange.max === logRange.min) return 1.0;
  const t = (Math.log(runtimeMin) - logRange.min) / (logRange.max - logRange.min);
  return 0.8 + 0.4 * Math.min(1, Math.max(0, t));
}

export type CellPx = { x: number; y: number };
export type CellUv = { u0: number; v0: number; du: number; dv: number };

/**
 * A per-instance UV window into the shared cover atlas, cropped to the medium's own face
 * aspect ratio so the artwork fills the case front without stretching — the same "crop to
 * cover, don't stretch" rule CaseScene.tsx's coverFit() applies to a single texture, just
 * computed as a sub-rectangle of the atlas cell instead of a texture repeat/offset, because
 * an InstancedMesh shares one material and repeat/offset are texture-wide, not per-instance.
 *
 * atlas.json's cell x/y are pixels from the top-left of the file (sharp's convention, and
 * the ordinary raster one). three uploads with flipY=true by default — the same default
 * CaseScene.tsx's poster texture relies on to come out right-side up — which puts v=0 at
 * the BOTTOM of the image as displayed. So the cell's bottom edge (file y + cellH) is what
 * maps to v0 (the window's minimum v), and its top edge (file y) maps to the top of the
 * window. Get this backwards and every cover renders upside down, which is the "wrong
 * cover, not an obvious error" trap the brief calls out.
 */
export function cropCellUv(
  cellPx: CellPx,
  cellSize: { w: number; h: number },
  atlasSize: number,
  faceAspect: number
): CellUv {
  const cellAspect = cellSize.w / cellSize.h;
  let cropX = cellPx.x;
  let cropY = cellPx.y;
  let cropW = cellSize.w;
  let cropH = cellSize.h;

  if (cellAspect > faceAspect) {
    // The cell is relatively wider than the face: crop its width, keep the full height.
    cropW = faceAspect * cellSize.h;
    cropX = cellPx.x + (cellSize.w - cropW) / 2;
  } else {
    // The cell is relatively taller than the face: crop its height, keep the full width.
    cropH = cellSize.w / faceAspect;
    cropY = cellPx.y + (cellSize.h - cropH) / 2;
  }

  return {
    u0: cropX / atlasSize,
    du: cropW / atlasSize,
    v0: 1 - (cropY + cropH) / atlasSize,
    dv: cropH / atlasSize,
  };
}

export type ShelfLayout = {
  media: {
    medium: Medium;
    bodyMatrices: THREE.Matrix4[];
    coverMatrices: THREE.Matrix4[];
    coverUvs: CellUv[];
    /**
     * Instance index -> slug, in the same order as the matrices above, so a raycast hit's
     * `instanceId` resolves to a title without a second lookup structure. The whole of
     * instance picking is this array plus `e.instanceId`.
     */
    slugs: string[];
  }[];
  /**
   * Where each era begins along the run, in world x. Era boundaries are not layout any more
   * (see docs/05-3d-shelf.md §1) — they are landmarks you pass, so this is what the jump
   * buttons aim at rather than a row to select.
   */
  landmarks: { medium: Medium; startX: number }[];
  /**
   * 3 of 152 titles have no atlas cell at all (no poster on TMDB yet — see the brief).
   * Their instanced cover slot gets an arbitrary, always-hidden UV window (cell 0, since
   * du/dv=0 risks a degenerate mip lookup on some drivers); this array carries a small,
   * non-instanced, opaque plane per title, in its own tint, positioned a hair further
   * forward so it wins the depth test and fully occludes that slot — "a blank case, not a
   * crash", using the exact tintToHsl()+setHSL() pattern CaseScene.tsx uses for its spine.
   * A plain position (rather than a full Matrix4): every blank-cover transform is pure
   * translation, so there is nothing a JSX `position` prop loses over `matrix` — and it
   * sidesteps needing `matrixAutoUpdate={false}` on three non-instanced meshes for no gain.
   */
  blankCovers: {
    slug: string;
    tint: string;
    position: { x: number; y: number; z: number };
    size: { w: number; h: number };
  }[];
  boardSlabMatrices: THREE.Matrix4[];
  boardLipMatrices: THREE.Matrix4[];
  /** World-space bounds of every case (not the boards), for framing the default camera. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

const IDENTITY_QUAT = new THREE.Quaternion();

/** A stable 0..1 from a slug, for scatter that is the same on every render and every
 * machine. Same reason and same shape as titleTint()'s hash in lib/tint.ts. */
function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function matrix(x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), IDENTITY_QUAT, new THREE.Vector3(sx, sy, sz));
}

/** How many shelves tall the run is. Four gives the mass of a real bookcase and keeps the
 * journey to ~50 units instead of ~205 (see docs/05-3d-shelf.md §1). */
export const LEVELS = 4;

/** Every level is the same pitch, sized for the tallest case in the catalogue. Column-major
 * means any medium can appear at any level, so a per-level height would have to be that max
 * anyway — and a run whose shelves stepped up and down would read as broken. */
const LEVEL_PITCH = Math.max(...Object.values(DIMENSIONS).map((d) => d.h)) + ROW_CLEARANCE + BOARD_THICKNESS;

/**
 * One continuous run, chronological end to end, filled **column-major**: consecutive titles
 * stack top to bottom within a column, then the run steps right. See docs/05-3d-shelf.md §1
 * for why this replaced five era rows — "the shelf ages as you move through it" is not five
 * bins you jump between, and rows of 7 against rows of 66 read as broken rather than designed.
 *
 * A column is one moment in time, so an era change sweeps past as a **vertical band**: you
 * watch clamshells give way to Amarays across the full height at once. Era boundaries stop
 * being layout and become landmarks, which is what `landmarks` is for.
 *
 * `titles` arrives in the order the run should read; this function does not sort.
 */
export function buildShelfLayout(
  titles: ShelfTitleData[],
  atlasCells: Record<string, CellPx>,
  cellSize: { w: number; h: number },
  atlasSize: number,
  /**
   * Titles with no place on the run at all. In story order these are the 14 about unstable
   * reality — multiverses, the TVA, a character who may be imagining everything — and they
   * hang above the run, unanchored, rather than being assigned a year they do not have.
   * Empty in release order, where every title has a release date.
   */
  floating: ShelfTitleData[] = []
): ShelfLayout {
  const logRange = runtimeLogRange([...titles, ...floating]);
  const blankCovers: ShelfLayout["blankCovers"] = [];
  const boardSlabMatrices: THREE.Matrix4[] = [];
  const boardLipMatrices: THREE.Matrix4[] = [];
  const landmarks: ShelfLayout["landmarks"] = [];
  const bounds = { minX: 0, maxX: 0, minY: Infinity, maxY: -Infinity };

  // One bucket per medium, in first-seen order, because an InstancedMesh needs its instances
  // grouped by the material they share. Instance order within a bucket is run order, which is
  // what makes `slugs[instanceId]` a straight lookup when picking.
  const buckets = new Map<Medium, ShelfLayout["media"][number]>();
  const bucketFor = (medium: Medium) => {
    let bucket = buckets.get(medium);
    if (!bucket) {
      bucket = { medium, bodyMatrices: [], coverMatrices: [], coverUvs: [], slugs: [] };
      buckets.set(medium, bucket);
    }
    return bucket;
  };

  const columns: ShelfTitleData[][] = [];
  titles.forEach((title, i) => {
    const column = Math.floor(i / LEVELS);
    (columns[column] ??= []).push(title);
  });

  let columnLeft = 0;
  columns.forEach((column) => {
    // A column is as wide as its widest member: a VHS (110mm) sharing a column with Amarays
    // (135mm) centres within it rather than dragging the rest of the run out of alignment.
    const columnWidth = Math.max(...column.map((t) => DIMENSIONS[t.medium].w));

    column.forEach((title, level) => {
      const dims = DIMENSIONS[title.medium];
      const x = columnLeft + columnWidth / 2;
      const boardTop = -level * LEVEL_PITCH;
      const y = boardTop + dims.h / 2;
      const ds = depthScale(title.runtimeMin, logRange);
      const d = dims.d * ds;
      const bucket = bucketFor(title.medium);

      // Base geometry is built at the medium's nominal depth; only Z scales per instance.
      bucket.bodyMatrices.push(matrix(x, y, 0, 1, 1, ds));

      const cellPx = atlasCells[title.slug];
      bucket.coverUvs.push(cropCellUv(cellPx ?? { x: 0, y: 0 }, cellSize, atlasSize, dims.w / dims.h));
      bucket.coverMatrices.push(matrix(x, y, d / 2 + COVER_INSET, 1, 1, 1));
      bucket.slugs.push(title.slug);

      if (!cellPx) {
        blankCovers.push({
          slug: title.slug,
          tint: title.tint,
          position: { x, y, z: d / 2 + BLANK_COVER_INSET },
          size: { w: dims.w - CORNER_RADIUS * 0.6, h: dims.h - CORNER_RADIUS * 0.6 },
        });
      }

      if (!landmarks.some((l) => l.medium === title.medium)) {
        landmarks.push({ medium: title.medium, startX: x });
      }

      bounds.maxX = Math.max(bounds.maxX, x + dims.w / 2);
      bounds.minY = Math.min(bounds.minY, boardTop);
      bounds.maxY = Math.max(bounds.maxY, y + dims.h / 2);
    });

    columnLeft += columnWidth + GAP_X;
  });

  // The unanchored ones. Spread along the run so they read as belonging to the whole of it
  // rather than to one section, above the top board with nothing underneath them. The offsets
  // are hashed from the slug rather than random: the same title hangs in the same place on
  // every render and on every machine, and a neat row would look like a sixth shelf.
  const runEnd = bounds.maxX;
  floating.forEach((title, i) => {
    const dims = DIMENSIONS[title.medium];
    const spread = floating.length > 1 ? i / (floating.length - 1) : 0.5;
    const jitter = hashUnit(title.slug);
    const x = 2 + spread * Math.max(runEnd - 4, 1) + (jitter - 0.5) * 1.6;
    const y = bounds.maxY + 0.9 + jitter * 1.8;
    const z = (hashUnit(`${title.slug}-z`) - 0.5) * 1.4;
    const ds = depthScale(title.runtimeMin, logRange);
    const bucket = bucketFor(title.medium);

    bucket.bodyMatrices.push(matrix(x, y, z, 1, 1, ds));
    const cellPx = atlasCells[title.slug];
    bucket.coverUvs.push(cropCellUv(cellPx ?? { x: 0, y: 0 }, cellSize, atlasSize, dims.w / dims.h));
    bucket.coverMatrices.push(matrix(x, y, z + (dims.d * ds) / 2 + COVER_INSET, 1, 1, 1));
    bucket.slugs.push(title.slug);

    if (!cellPx) {
      blankCovers.push({
        slug: title.slug,
        tint: title.tint,
        position: { x, y, z: z + (dims.d * ds) / 2 + BLANK_COVER_INSET },
        size: { w: dims.w - CORNER_RADIUS * 0.6, h: dims.h - CORNER_RADIUS * 0.6 },
      });
    }
  });

  // One board per level, spanning the whole run: the furniture is continuous even though the
  // objects standing on it change in steps (docs/05-3d-shelf.md §3). Boards are sized from
  // the run itself, so the floating titles above deliberately have nothing under them.
  const runWidth = runEnd + BOARD_MARGIN * 2;
  const boardCenterX = runWidth / 2 - BOARD_MARGIN;
  for (let level = 0; level < LEVELS; level++) {
    const boardTop = -level * LEVEL_PITCH;
    boardSlabMatrices.push(
      matrix(boardCenterX, boardTop - BOARD_THICKNESS / 2, 0, runWidth, BOARD_THICKNESS, BOARD_DEPTH)
    );
    // The lip: a brighter trim strip along the board's front-top edge — the one surface a
    // face-out run never hides behind its own cases.
    boardLipMatrices.push(
      matrix(boardCenterX, boardTop - BOARD_LIP_HEIGHT / 2, BOARD_DEPTH / 2, runWidth, BOARD_LIP_HEIGHT, 0.03)
    );
  }

  return { media: [...buckets.values()], blankCovers, landmarks, boardSlabMatrices, boardLipMatrices, bounds };
}
