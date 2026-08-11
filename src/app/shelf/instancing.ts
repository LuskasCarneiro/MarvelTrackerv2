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
};

export type ShelfRowData = {
  medium: Medium;
  /** The era's name, from catalogue.ts — user-facing copy, so it travels rather than being
   * re-typed here. Used by the era jump buttons. */
  label: string;
  titles: ShelfTitleData[];
};

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
export function runtimeLogRange(rows: ShelfRowData[]): { min: number; max: number } {
  const runtimes = rows.flatMap((r) => r.titles.map((t) => t.runtimeMin)).filter((n): n is number => n != null);
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
    label: string;
    bodyMatrices: THREE.Matrix4[];
    coverMatrices: THREE.Matrix4[];
    coverUvs: CellUv[];
    /**
     * Instance index -> slug, in the same order as the matrices above, so a raycast hit's
     * `instanceId` resolves to a title without a second lookup structure. The whole of
     * instance picking is this array plus `e.instanceId`.
     */
    slugs: string[];
    /** Centre height of this row's cases — what the camera aims at when jumping to an era. */
    rowY: number;
  }[];
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

function matrix(x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), IDENTITY_QUAT, new THREE.Vector3(sx, sy, sz));
}

/**
 * Lays out every shelf row: face-out, left to right, small gap, chronological within a row
 * (rows arrive pre-sorted from catalogue.ts). Rows stack top to bottom in era order, each on
 * its own board, so moving down the wall moves forward through time — see the brief.
 */
export function buildShelfLayout(
  rows: ShelfRowData[],
  atlasCells: Record<string, CellPx>,
  cellSize: { w: number; h: number },
  atlasSize: number
): ShelfLayout {
  const logRange = runtimeLogRange(rows);
  const media: ShelfLayout["media"] = [];
  const blankCovers: ShelfLayout["blankCovers"] = [];
  const boardSlabMatrices: THREE.Matrix4[] = [];
  const boardLipMatrices: THREE.Matrix4[] = [];
  const bounds = { minX: 0, maxX: 0, minY: Infinity, maxY: -Infinity };

  let boardTop = 0;

  rows.forEach((row, rowIndex) => {
    const dims = DIMENSIONS[row.medium];

    if (rowIndex > 0) {
      // Each board sits low enough that THIS row's own cases clear the previous board's
      // underside by ROW_CLEARANCE — using the row *above*'s height here instead
      // undershoots whenever a row is taller than the one before it. steel (172mm) is
      // followed by none (190mm): an 18mm increase that ate the 15cm clearance and clipped
      // 'none' case tops 3cm through the steel board above (caught by hand-tracing the
      // board Y values, not by looking at a screenshot — the default camera never frames
      // that pair of rows).
      boardTop -= ROW_CLEARANCE + BOARD_THICKNESS + dims.h;
    }

    const faceAspect = dims.w / dims.h;
    const bodyMatrices: THREE.Matrix4[] = [];
    const coverMatrices: THREE.Matrix4[] = [];
    const coverUvs: CellUv[] = [];

    row.titles.forEach((title, i) => {
      const x = i * (dims.w + GAP_X) + dims.w / 2;
      const y = boardTop + dims.h / 2;
      const ds = depthScale(title.runtimeMin, logRange);
      const d = dims.d * ds;

      // Base geometry is built at the medium's nominal depth; only Z scales per instance.
      bodyMatrices.push(matrix(x, y, 0, 1, 1, ds));

      const cellPx = atlasCells[title.slug];
      coverUvs.push(cropCellUv(cellPx ?? { x: 0, y: 0 }, cellSize, atlasSize, faceAspect));
      const coverZ = d / 2 + COVER_INSET;
      coverMatrices.push(matrix(x, y, coverZ, 1, 1, 1));

      if (!cellPx) {
        blankCovers.push({
          slug: title.slug,
          tint: title.tint,
          position: { x, y, z: d / 2 + BLANK_COVER_INSET },
          size: { w: dims.w - CORNER_RADIUS * 0.6, h: dims.h - CORNER_RADIUS * 0.6 },
        });
      }

      bounds.maxX = Math.max(bounds.maxX, x + dims.w / 2);
      bounds.minY = Math.min(bounds.minY, boardTop);
      bounds.maxY = Math.max(bounds.maxY, y + dims.h / 2);
    });

    const rowWidth = row.titles.length ? row.titles.length * dims.w + (row.titles.length - 1) * GAP_X : 0;
    const rowCenterX = rowWidth / 2;
    const slabWidth = rowWidth + BOARD_MARGIN * 2;

    boardSlabMatrices.push(matrix(rowCenterX, boardTop - BOARD_THICKNESS / 2, 0, slabWidth, BOARD_THICKNESS, BOARD_DEPTH));
    // The lip: a brighter trim strip along the board's front-top edge — the one surface a
    // face-out row never hides behind its own cases.
    boardLipMatrices.push(
      matrix(rowCenterX, boardTop - BOARD_LIP_HEIGHT / 2, BOARD_DEPTH / 2, slabWidth, BOARD_LIP_HEIGHT, 0.03)
    );

    media.push({
      medium: row.medium,
      label: row.label,
      bodyMatrices,
      coverMatrices,
      coverUvs,
      slugs: row.titles.map((t) => t.slug),
      rowY: boardTop + dims.h / 2,
    });
  });

  return { media, blankCovers, boardSlabMatrices, boardLipMatrices, bounds };
}
