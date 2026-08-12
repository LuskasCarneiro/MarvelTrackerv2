// Pure layout math for the shelf scene: medium dimensions, per-title thickness, row
// positions and the atlas UV crop. No React, no WebGL context — just numbers and
// THREE.Matrix4/Vector3 value objects (three's math classes have no DOM dependency), so
// this is readable and testable in isolation. See instancing.test.ts.

import * as THREE from "three";
import type { Medium } from "@/lib/catalogue";

/**
 * What the object *is*. In release order that is the home-video medium it shipped on; in
 * story order it is what would have carried the story at the time — see formForStoryYear()
 * and docs/05-3d-shelf.md §4. The five media are shared between both, because a 2015 story
 * on a 2015 Blu-ray is the same object either way.
 */
export type Form = Medium | "tablet" | "volume" | "can" | "reel";

export type ShelfTitleData = {
  slug: string;
  /** What to print when this title is drawn out — catalogue.ts's displayTitle, which already
   * carries the series number for the 19 titles that repeat. */
  label: string;
  runtimeMin: number | null;
  tint: string;
  medium: Medium;
  releaseYear: number;
  /** When the story happens, for the story ordering. Null for the 14 titles that belong
   * outside time — see lib/chronology.ts and docs/05-3d-shelf.md §5. */
  storyYear: number | null;
  /** What to draw. Defaults to the medium, which is what release order wants. */
  form?: Form;
};

/**
 * The object a story would have reached you on, had someone been there to record it.
 *
 * docs/05-3d-shelf.md §4, and it says the important thing plainly: **this is a conceit, not a
 * fact.** Nothing was recorded in 1943. The two orderings converge in the modern era — for
 * roughly 120 titles a 2015 story shipped on 2015 media and the object does not change — and
 * diverge in the past, which is exactly where the surprise is: Captain America is a Blu-ray
 * by release and a film can by story.
 *
 * A title with no place on a timeline keeps its own medium; it is already saying something
 * else by hanging off the shelf.
 */
export function formForStoryYear(storyYear: number | null, medium: Medium): Form {
  if (storyYear === null) return medium;
  if (storyYear < -1000) return "tablet"; // 5000 BC — Eternals
  if (storyYear < 1900) return "volume"; // 1845 — a bound volume
  if (storyYear < 1960) return "can"; // the 1940s — 35mm film can
  if (storyYear < 1980) return "reel"; // the 1960s and 70s — Super 8
  if (storyYear < 2000) return "vhs";
  if (storyYear < 2010) return "amaray";
  if (storyYear < 2020) return "steel";
  return "none";
}

/**
 * One universe's titles as they cross the server/client boundary, in release order. The
 * scene re-sorts them per ordering mode; the layout never sorts.
 */
export type UniverseData = { key: string; label: string; titles: ShelfTitleData[] };

// Real millimetres, 1 unit = 100mm — the brief's case-dimensions table, verbatim.
const DIMENSIONS_MM: Record<Medium, { h: number; w: number; d: number }> = {
  vhs: { h: 197, w: 110, d: 32 },
  amaray: { h: 190, w: 135, d: 14 },
  bluray: { h: 171, w: 135, d: 12 },
  steel: { h: 172, w: 135, d: 15 },
  none: { h: 190, w: 135, d: 3 },
};

/** The historical objects, in the same real millimetres. A can and a reel are round, so w is
 * their diameter and d their depth on the shelf — they stand on edge like a record. */
const HISTORICAL_MM: Record<Exclude<Form, Medium>, { h: number; w: number; d: number }> = {
  tablet: { h: 160, w: 120, d: 30 },
  volume: { h: 190, w: 130, d: 40 },
  can: { h: 170, w: 170, d: 25 },
  reel: { h: 150, w: 150, d: 16 },
};

export const DIMENSIONS: Record<Form, { h: number; w: number; d: number }> = Object.fromEntries(
  Object.entries({ ...DIMENSIONS_MM, ...HISTORICAL_MM }).map(([form, { h, w, d }]) => [
    form,
    { h: h / 100, w: w / 100, d: d / 100 },
  ])
) as Record<Form, { h: number; w: number; d: number }>;

/** The round forms need a cylinder and a circular label rather than a box and a plane. */
export const ROUND_FORMS: ReadonlySet<Form> = new Set<Form>(["can", "reel"]);

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
export const BODY_MATERIAL: Record<Form, { color: string; shininess: number; specular: string }> = {
  // The historical objects, kept as quiet as the cases: dry clay, worn leather, dull steel,
  // dark plastic. The covers are still the only colour in the room.
  tablet: { color: "#3a3229", shininess: 2, specular: "#221c15" },
  volume: { color: "#241a14", shininess: 30, specular: "#4a3a2c" },
  can: { color: "#2a2c2e", shininess: 90, specular: "#8a8a8a" },
  reel: { color: "#1b1b1d", shininess: 60, specular: "#55565a" },
  vhs: { color: "#17130f", shininess: 25, specular: "#2b241c" },
  amaray: { color: "#15120f", shininess: 55, specular: "#3a332b" }, // = the spike, exactly
  bluray: { color: "#100e0c", shininess: 70, specular: "#463e34" },
  steel: { color: "#131313", shininess: 100, specular: "#8f897f" },
  none: { color: "#231f1a", shininess: 4, specular: "#1a1714" },
};

/** The cover sits under a clear sleeve that is glossier than the case itself — except
 * 'none', which has no sleeve at all ("no gloss", per the brief). */
export const COVER_SHININESS: Record<Form, number> = {
  // A pressed clay face and a printed can lid have no sleeve over them at all.
  tablet: 2,
  volume: 25,
  can: 45,
  reel: 30,
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

/**
 * One universe's worth of shelf: its titles in the order they should read, plus any that
 * cannot be placed on it at all (in story order, the ones that belong outside time).
 */
export type ShelfRun = {
  key: string;
  /** The universe's name, from catalogue.ts — user-facing copy, so it travels. */
  label: string;
  titles: ShelfTitleData[];
  floating: ShelfTitleData[];
};

/**
 * One case, as placed. The matrices below are built from these; they are kept because the
 * scroll interaction has to re-pose a single instance every frame (pulling it out of the
 * shelf and putting it back), and recomposing from numbers is clearer than decomposing a
 * Matrix4 to find out where the case was.
 */
export type ShelfItem = {
  slug: string;
  label: string;
  releaseYear: number;
  storyYear: number | null;
  /** What this instance is drawn as — the medium in release order, the era's object in story
   * order. Which InstancedMesh it lives in, and therefore how a raycast resolves. */
  form: Form;
  /** Index of this case within its medium's InstancedMesh — what a raycast hit returns. */
  instance: number;
  x: number;
  y: number;
  z: number;
  /** Per-instance depth scale, encoding runtime. */
  ds: number;
  /** The cover plane's offset in front of the case's own centre. */
  coverZ: number;
};

export type UniverseShelf = {
  key: string;
  label: string;
  startX: number;
  endX: number;
  /** 0 = untouched, 1 = the most worn unit in the room. See unitWear(). */
  wear: number;
  /** How many shelves this unit has — see levelsFor(). */
  levels: number;
  /** Mid-height of this unit's own carcass, which is what the camera frames while you are
   * standing at it. Units are different heights, so this is not a constant. */
  centreY: number;
  /** Full height of this unit's carcass, for choosing how far back to stand. */
  height: number;
  /** Every case on this shelf, in the order the scroll walks them: down a column, then
   * right to the next. A column is one moment in time, so this reads as time passing. */
  items: ShelfItem[];
};

export type ShelfLayout = {
  media: {
    form: Form;
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
  /** The shelves, left to right, one per universe. */
  universes: UniverseShelf[];
  /**
   * 3 of 152 titles have no atlas cell at all (no poster on TMDB yet — see the brief).
   * Their instanced cover slot gets an arbitrary, always-hidden UV window (cell 0, since
   * du/dv=0 risks a degenerate mip lookup on some drivers); this array carries a small,
   * non-instanced, opaque plane per title, in its own tint, positioned a hair further
   * forward so it wins the depth test and fully occludes that slot — "a blank case, not a
   * crash", using the exact tintToHsl()+setHSL() pattern CaseScene.tsx uses for its spine.
   */
  blankCovers: {
    slug: string;
    tint: string;
    position: { x: number; y: number; z: number };
    size: { w: number; h: number };
  }[];
  boardSlabMatrices: THREE.Matrix4[];
  boardLipMatrices: THREE.Matrix4[];
  /** Wear per board instance, in the same order as the matrices above, so the furniture can
   * be tinted per unit without a material or a draw call per bookcase. */
  boardSlabWear: number[];
  boardLipWear: number[];
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

/** The tallest a unit gets. Four gives the mass of a real bookcase. */
export const LEVELS = 4;

/**
 * How many shelves a unit needs. Filling every unit to four levels turns Spider-Verse's two
 * films into a one-column tower with two empty shelves above them — a sliver, not a
 * bookcase. Roughly three titles per level keeps every unit at least as wide as it is tall,
 * so the room reads as furniture of different sizes rather than as broken copies of one
 * shape. Units are bottom-aligned, so a short one is a low shelf, not a tall one hanging in
 * the air.
 */
export function levelsFor(count: number): number {
  return Math.min(LEVELS, Math.max(1, Math.ceil(count / 3)));
}

/** Every level is the same pitch, sized for the tallest case in the catalogue. Column-major
 * means any medium can appear at any level, so a per-level height would have to be that max
 * anyway — and a run whose shelves stepped up and down would read as broken. */
const LEVEL_PITCH = Math.max(...Object.values(DIMENSIONS).map((d) => d.h)) + ROW_CLEARANCE + BOARD_THICKNESS;

/** The bottom board of every unit, tall or short — they all stand on the same floor. */
const FLOOR_BOARD_Y = -(LEVELS - 1) * LEVEL_PITCH;

/** Clear air between one universe's unit and the next. Wide enough that they read as
 * separate pieces of furniture rather than one run with a gap in it. */
const UNIVERSE_GAP = 2.6;

const UPRIGHT_WIDTH = 0.07;
const BACK_PANEL_THICKNESS = 0.03;

/** How many pieces of carcass each unit adds beyond its shelves: a top, two uprights and a
 * back. Exported so the layout test can assert the furniture without re-deriving it. */
export const CARCASS_PIECES = 4;

/**
 * How worn each unit's furniture looks, from the median release year of what stands on it —
 * oldest most worn, newest untouched. docs/05-3d-shelf.md §3: the objects change in steps and
 * the furniture changes as a gradient, and what the gradient carries is **wear, not style**.
 * A 1980s unit morphing into a 2020s unit is a costume change and would look like one.
 *
 * Normalised across the room rather than against fixed years, so it never goes stale: the
 * oldest bookcase present is always the worn one.
 */
export function unitWear(runs: ShelfRun[]): number[] {
  const medians = runs.map((run) => {
    const years = [...run.titles, ...run.floating].map((t) => t.releaseYear).sort((a, b) => a - b);
    return years.length ? years[Math.floor(years.length / 2)] : 0;
  });
  const present = medians.filter((y) => y > 0);
  const oldest = Math.min(...present);
  const newest = Math.max(...present);
  if (newest === oldest) return medians.map(() => 0.5);
  return medians.map((year) => (year > 0 ? (newest - year) / (newest - oldest) : 0.5));
}

/**
 * The archive as a room of shelf units — **one per universe**, left to right, each filled
 * column-major and chronological within itself.
 *
 * Each unit still ages along its own length, which is the concept in `CLAUDE.md`: the MCU
 * unit runs DVD to Blu-ray to steelbook to nothing-physical as you travel it, and the
 * Classic era unit is clamshells throughout. Splitting by universe changes what a shelf *is*
 * without giving up what makes it a shelf.
 *
 * Runs arrive in the order they should stand and already sorted; this function does not sort.
 */
export function buildShelfLayout(
  runs: ShelfRun[],
  atlasCells: Record<string, CellPx>,
  cellSize: { w: number; h: number },
  atlasSize: number
): ShelfLayout {
  const allTitles = runs.flatMap((r) => [...r.titles, ...r.floating]);
  const logRange = runtimeLogRange(allTitles);
  const blankCovers: ShelfLayout["blankCovers"] = [];
  const boardSlabMatrices: THREE.Matrix4[] = [];
  const boardLipMatrices: THREE.Matrix4[] = [];
  const boardSlabWear: number[] = [];
  const boardLipWear: number[] = [];
  const wearByUnit = unitWear(runs);
  const universes: UniverseShelf[] = [];
  const bounds = { minX: 0, maxX: 0, minY: Infinity, maxY: -Infinity };

  // One bucket per medium across the whole room, because an InstancedMesh needs its
  // instances grouped by the material they share — a shelf unit is not a draw call.
  const buckets = new Map<Form, ShelfLayout["media"][number]>();
  const bucketFor = (form: Form) => {
    let bucket = buckets.get(form);
    if (!bucket) {
      bucket = { form, bodyMatrices: [], coverMatrices: [], coverUvs: [], slugs: [] };
      buckets.set(form, bucket);
    }
    return bucket;
  };

  /** Adds one case to its medium's bucket and returns where it went. */
  const place = (title: ShelfTitleData, x: number, y: number, z: number): ShelfItem => {
    const form = title.form ?? title.medium;
    const dims = DIMENSIONS[form];
    const ds = depthScale(title.runtimeMin, logRange);
    const coverZ = (dims.d * ds) / 2 + COVER_INSET;
    const bucket = bucketFor(form);
    const instance = bucket.slugs.length;

    // Base geometry is built at the medium's nominal depth; only Z scales per instance.
    bucket.bodyMatrices.push(matrix(x, y, z, 1, 1, ds));
    const cellPx = atlasCells[title.slug];
    bucket.coverUvs.push(cropCellUv(cellPx ?? { x: 0, y: 0 }, cellSize, atlasSize, dims.w / dims.h));
    bucket.coverMatrices.push(matrix(x, y, z + coverZ, 1, 1, 1));
    bucket.slugs.push(title.slug);

    if (!cellPx) {
      blankCovers.push({
        slug: title.slug,
        tint: title.tint,
        position: { x, y, z: z + (dims.d * ds) / 2 + BLANK_COVER_INSET },
        size: { w: dims.w - CORNER_RADIUS * 0.6, h: dims.h - CORNER_RADIUS * 0.6 },
      });
    }

    bounds.maxX = Math.max(bounds.maxX, x + dims.w / 2);
    bounds.minY = Math.min(bounds.minY, y - dims.h / 2);
    bounds.maxY = Math.max(bounds.maxY, y + dims.h / 2);

    return {
      slug: title.slug,
      label: title.label,
      releaseYear: title.releaseYear,
      storyYear: title.storyYear,
      form,
      instance,
      x,
      y,
      z,
      ds,
      coverZ,
    };
  };

  let unitLeft = 0;
  runs.forEach((run, runIndex) => {
    const wear = wearByUnit[runIndex];
    const items: ShelfItem[] = [];

    const levels = levelsFor(run.titles.length);
    const columns: ShelfTitleData[][] = [];
    run.titles.forEach((title, i) => {
      const column = Math.floor(i / levels);
      (columns[column] ??= []).push(title);
    });

    let columnLeft = unitLeft;
    columns.forEach((column) => {
      // A column is as wide as its widest member: a VHS (110mm) sharing a column with
      // Amarays (135mm) centres within it rather than dragging the unit out of alignment.
      const columnWidth = Math.max(...column.map((t) => DIMENSIONS[t.form ?? t.medium].w));
      column.forEach((title, level) => {
        const dims = DIMENSIONS[title.form ?? title.medium];
        // level 0 is this unit's top shelf, and the unit is bottom-aligned to the floor.
        const boardTop = FLOOR_BOARD_Y + (levels - 1 - level) * LEVEL_PITCH;
        items.push(place(title, columnLeft + columnWidth / 2, boardTop + dims.h / 2, 0));
      });
      columnLeft += columnWidth + GAP_X;
    });

    const unitRight = Math.max(columnLeft - GAP_X, unitLeft + DIMENSIONS.amaray.w);
    const unitWidth = unitRight - unitLeft;
    const unitTop = FLOOR_BOARD_Y + levels * LEVEL_PITCH;
    const unitBottom = FLOOR_BOARD_Y - BOARD_THICKNESS;

    // The unanchored ones (story order's fourteen). They hang above their own universe's
    // unit with nothing underneath, spread across its width and scattered by a hash of the
    // slug, so the same title hangs in the same place on every render and every machine.
    run.floating.forEach((title, i) => {
      const spread = run.floating.length > 1 ? i / (run.floating.length - 1) : 0.5;
      const jitter = hashUnit(title.slug);
      const x = unitLeft + 0.7 + spread * Math.max(unitWidth - 1.4, 0.5) + (jitter - 0.5) * 0.9;
      // Above the carcass, not just above the top row of cases: the unit now has a top board,
      // and hanging these at case height would push them through it.
      const y = unitTop + 0.8 + jitter * 1.6;
      items.push(place(title, x, y, (hashUnit(`${title.slug}-z`) - 0.5) * 1.2));
    });

    // A carcass per unit, not just floating shelves: four boards, a top, two uprights and a
    // back panel. Every piece is another instance of the same unit box, so a whole extra
    // bookcase costs nothing in draw calls — and it is what makes a universe read as its own
    // piece of furniture rather than a section of an endless wall. The back panel is
    // docs/05-3d-shelf.md §3's one concession to building a room: real shelves have backs, it
    // stops the floating-in-void feeling, and it gives the lamp a surface to fall on.
    const slabWidth = unitWidth + BOARD_MARGIN * 2;
    const centreX = unitLeft + unitWidth / 2;
    const unitHeight = unitTop - unitBottom;

    for (let level = 0; level < levels; level++) {
      const boardTop = FLOOR_BOARD_Y + (levels - 1 - level) * LEVEL_PITCH;
      boardSlabMatrices.push(matrix(centreX, boardTop - BOARD_THICKNESS / 2, 0, slabWidth, BOARD_THICKNESS, BOARD_DEPTH));
      boardSlabWear.push(wear);
      // The lip: a brighter trim strip along the board's front-top edge — the one surface a
      // face-out shelf never hides behind its own cases.
      boardLipMatrices.push(
        matrix(centreX, boardTop - BOARD_LIP_HEIGHT / 2, BOARD_DEPTH / 2, slabWidth, BOARD_LIP_HEIGHT, 0.03)
      );
      boardLipWear.push(wear);
    }
    boardSlabMatrices.push(matrix(centreX, unitTop - BOARD_THICKNESS / 2, 0, slabWidth, BOARD_THICKNESS, BOARD_DEPTH));
    boardSlabWear.push(wear);
    for (const side of [-1, 1]) {
      boardSlabMatrices.push(
        matrix(
          centreX + side * (slabWidth / 2 + UPRIGHT_WIDTH / 2),
          unitBottom + unitHeight / 2,
          0,
          UPRIGHT_WIDTH,
          unitHeight,
          BOARD_DEPTH
        )
      );
      boardSlabWear.push(wear);
    }
    boardSlabMatrices.push(
      matrix(centreX, unitBottom + unitHeight / 2, -BOARD_DEPTH / 2 + BACK_PANEL_THICKNESS, slabWidth, unitHeight, BACK_PANEL_THICKNESS)
    );
    boardSlabWear.push(wear);

    universes.push({
      key: run.key,
      label: run.label,
      startX: unitLeft,
      endX: unitRight,
      wear,
      levels,
      centreY: (unitBottom + unitTop) / 2,
      height: unitTop - unitBottom,
      items,
    });
    unitLeft = unitRight + UNIVERSE_GAP;
  });

  // Frame the furniture, not just the cases: the carcass runs from its own top board down to
  // below the bottom shelf, and a camera fitted to the cases alone crops both.
  bounds.minY = Math.min(bounds.minY, FLOOR_BOARD_Y - BOARD_THICKNESS);
  bounds.maxY = Math.max(bounds.maxY, ...universes.map((u) => u.centreY * 2 - (FLOOR_BOARD_Y - BOARD_THICKNESS)));

  return {
    media: [...buckets.values()],
    universes,
    blankCovers,
    boardSlabMatrices,
    boardLipMatrices,
    boardSlabWear,
    boardLipWear,
    bounds,
  };
}
