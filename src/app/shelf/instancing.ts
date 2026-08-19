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
  // Steel is the one form that should catch the lamp and throw it back: embossed metal,
  // not a printed sleeve. The cheap half of PLAN.md's foil map, without the map.
  steel: { color: "#15161a", shininess: 150, specular: "#bcb4a4" },
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
  steel: 145,
  none: 4,
};

/**
 * Spines face the room; covers face along it. docs/05-3d-shelf.md §12 Q1, and PLAN.md §6's
 * "a shelf shows you spines first" — which this code contradicted for three months.
 *
 * `spineGeometryFor()` in ShelfScene.tsx already builds the printed spine on the case's local
 * **-X** face, so the yaw that turns that face to the room is +90 degrees. Everything else
 * follows from it: local Z (thickness, scaled per instance to carry runtime) becomes the
 * case's footprint **along** the shelf, and local X (the 135mm width) becomes its depth
 * **into** the shelf. That single swap is what finally makes thickness legible — §12 lists
 * "thickness is encoded but not legible" as unsolved, and it was unsolvable cover-out,
 * because thickness was the one axis pointing away from the viewer.
 */
export const SPINE_YAW = Math.PI / 2;

/**
 * Between spines. Real cases on a real shelf touch, but 66 of the 152 titles have no physical
 * release and are 3mm cards: touching, they fuse into one dark 20cm block instead of reading
 * as sixty-six things. 2mm is the smallest gap that keeps them countable.
 */
const SPINE_GAP = 0.002;
/**
 * Headroom above a row's cases. Cover-out needed 15cm so a cover could be seen at all;
 * spine-out does not, and a real DVD shelf is snug. Dropping it tightens the whole unit into
 * something that reads as furniture rather than as scaffolding.
 */
const ROW_CLEARANCE = 0.06;
const BOARD_THICKNESS = 0.04;
const BOARD_LIP_HEIGHT = 0.02;
/**
 * Spine-out, a case lies 135mm *into* the shelf instead of 14mm, so the board has to be a
 * real board — 50mm held a case on its edge and would now hold about a third of one. 175mm
 * is a domestic DVD shelf, and it lets the widest historical form (a 170mm film can) sit on
 * it with only the overhang a real object would have.
 */
const BOARD_DEPTH = 1.75;
/**
 * The narrowest a section of the run gets, however little stands in it — enough to carry the
 * nameplate above it and to read as a division rather than as a slot.
 *
 * Measured, not guessed: the twelve universes hold between 17mm (Spider-Verse's two films)
 * and 384mm (the MCU's fifty-seven) of spine. Letting a section be its natural width would
 * put a 260mm brass plate over a 17mm gap.
 */
const MIN_SECTION_WIDTH = 1.6;
const COVER_INSET = 0.0015; // = the spike's INSET: the printed insert sits proud of the body

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

/**
 * How far thickness may stray from a form's nominal depth. Widened from 0.8-1.2x once the
 * objects were seen at a shelf's framing rather than one at a time: at plus or minus 20% a
 * two-hour film and a six-season run were the same object, which wastes the one channel that
 * is free here. Wider than reality, deliberately, and for the same reason spineWidth()
 * exaggerates in the DOM: the ordering is what carries the meaning, and it has to survive
 * being seen edge-on, at an angle, in the dark.
 */
const DEPTH_MIN = 0.7;
const DEPTH_MAX = 1.45;

export function depthScale(runtimeMin: number | null, logRange: { min: number; max: number }): number {
  if (runtimeMin == null) return DEPTH_MIN;
  if (logRange.max === logRange.min) return (DEPTH_MIN + DEPTH_MAX) / 2;
  const t = (Math.log(runtimeMin) - logRange.min) / (logRange.max - logRange.min);
  return DEPTH_MIN + (DEPTH_MAX - DEPTH_MIN) * Math.min(1, Math.max(0, t));
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
  /** Carried through only so a case that is turned over can print its own back (see
   * backCover.ts). Both are already on the client — ShelfTitleData holds them — so this
   * costs nothing extra in the bundle, which the note text emphatically would. */
  runtimeMin: number | null;
  tint: string;
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

/** Every case on the shelf carries this. Built once — it is the same rotation for all 152. */
const SPINE_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SPINE_YAW);

function matrix(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  quat: THREE.Quaternion = IDENTITY_QUAT
): THREE.Matrix4 {
  // compose() is T * R * S, so the scale is applied in the case's own axes and *then* turned.
  // That is what keeps `sz` meaning "thickness" after the yaw has pointed thickness along X.
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(sx, sy, sz));
}

/**
 * **One continuous run**, decided by the owner on 2026-08-19 — `docs/05-3d-shelf.md` §12's
 * open question, closed.
 *
 * Twelve separate bookcases was settled while a bay was metres wide. Measured spine-out, the
 * whole archive is 1611mm and the twelve universes run 17mm to 384mm, so twelve carcasses
 * meant twelve near-identical near-empty boxes. This is what `docs/05-3d-shelf.md` §5 and
 * `CLAUDE.md`'s concept line described in the first place: one run that **ages along its
 * length**, universes marked by joinery rather than by being separate furniture.
 *
 * It is deliberately a **single level**. The camera is locked off and travels horizontally,
 * so a run that wrapped onto a second shelf would break both the travel and the one thing
 * that makes a section legible — that a universe is a contiguous stretch you walk past.
 * At roughly 2.4m long and 21cm tall this is a gallery shelf run, not a bookcase, which is
 * the honest shape for 152 spines.
 */
const RUN_LEVELS = 1;

/** Sized for the tallest case in the catalogue: any medium can stand anywhere on the run. */
const LEVEL_PITCH = Math.max(...Object.values(DIMENSIONS).map((d) => d.h)) + ROW_CLEARANCE + BOARD_THICKNESS;

/**
 * The top face of the run's board — the surface every case stands on, and the origin the
 * whole room is measured from. Zero: the run is mounted on a wall rather than standing on
 * the floor, so there is no reason for it to hang off the floor's coordinate.
 */
const FLOOR_BOARD_Y = 0;

/**
 * A partition between one universe's stretch and the next, and the clear air either side of
 * it. This is what replaced the gap between separate bookcases: the sections are **joinery**
 * now, not furniture standing apart, so a universe is read as a division of one thing rather
 * than as its own object.
 */
const DIVIDER_PAD = 0.14;

const UPRIGHT_WIDTH = 0.07;
const BACK_PANEL_THICKNESS = 0.03;

/** Where every case's back sits: against the back panel, as they do on a real shelf. */
const CASE_BACK_Z = -BOARD_DEPTH / 2 + BACK_PANEL_THICKNESS;

/**
 * The brackets that hold the run on the wall — see their use for why they exist at all.
 *
 * Described as two endpoints rather than as a position and a rotation, because that is how a
 * bracket is actually specified: it meets the underside of the board *here* and the wall
 * *there*. The angle and length below are derived, so moving either end cannot leave a strut
 * pointing into space.
 */
const BRACKET_PITCH = 2.4; // roughly every 240mm, which is what carries a loaded shelf
const BRACKET_THICKNESS = 0.05; // its width along the run — a flat iron strap, seen edge-on
const BRACKET_DEPTH = 0.13; // how deep the strap is, face-on
const BRACKET_TOP_Y = -BOARD_THICKNESS; // tucked under the board
const BRACKET_FOOT_Y = BRACKET_TOP_Y - 0.9;
const BRACKET_FRONT_Z = 0.3;
const BRACKET_BACK_Z = -BOARD_DEPTH / 2;
const BRACKET_RISE = BRACKET_TOP_Y - BRACKET_FOOT_Y;
const BRACKET_REACH = BRACKET_FRONT_Z - BRACKET_BACK_Z;
const BRACKET_LENGTH = Math.hypot(BRACKET_RISE, BRACKET_REACH);
/**
 * Pitched about X so the box's long (local Z) axis lies along the strut.
 *
 * **Negative**, and the sign is the whole thing. Positive puts the strut's high end against the
 * wall and its low end out at the front, hanging off nothing — a bracket upside down, which
 * renders as a row of loose diagonal sticks under the shelf. A bracket is fixed to the wall
 * *low* and rises to meet the board's front edge.
 */
const BRACKET_QUAT = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.atan2(BRACKET_RISE, BRACKET_REACH)
);

/**
 * The joinery, counted so the layout test can assert it without re-deriving it.
 *
 * Each section contributes three box instances — its shelf board, the top board over it and
 * the back panel behind it — all butted to their neighbours so the run reads as continuous
 * while each still carries **its own section's wear**. That is what lets the gradient age
 * along the length, which is the whole point of one run rather than twelve.
 *
 * The run as a whole then adds two end walls, and one divider between each pair of sections.
 */
export const SECTION_PIECES = 3;
export const RUN_END_PIECES = 2;
/** Total box instances for n sections: the per-section pieces, the two ends, the dividers. */
export const carcassPieceCount = (sections: number) =>
  sections * SECTION_PIECES + RUN_END_PIECES + Math.max(0, sections - 1);

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
    bucket.bodyMatrices.push(matrix(x, y, z, 1, 1, ds, SPINE_QUAT));
    const cellPx = atlasCells[title.slug];
    bucket.coverUvs.push(cropCellUv(cellPx ?? { x: 0, y: 0 }, cellSize, atlasSize, dims.w / dims.h));
    // At rest the cover sits *at the case's own centre*, i.e. inside an opaque box, so it is
    // simply not there until the case is drawn out. Cover-out could leave it proud because it
    // faced open air; spine-out it would face the neighbour 2mm away and z-fight through it.
    // poseCover() scales the same offset by the pull, so the two agree at amount = 0.
    bucket.coverMatrices.push(matrix(x, y, z, 1, 1, 1, SPINE_QUAT));
    bucket.slugs.push(title.slug);

    if (!cellPx) {
      blankCovers.push({
        slug: title.slug,
        tint: title.tint,
        // Same reasoning as the cover above: parked inside the body until it is presented.
        position: { x, y, z },
        size: { w: dims.w - CORNER_RADIUS * 0.6, h: dims.h - CORNER_RADIUS * 0.6 },
      });
    }

    // Thickness is the footprint along the shelf now, not width.
    bounds.maxX = Math.max(bounds.maxX, x + (dims.d * ds) / 2);
    bounds.minY = Math.min(bounds.minY, y - dims.h / 2);
    bounds.maxY = Math.max(bounds.maxY, y + dims.h / 2);

    return {
      slug: title.slug,
      label: title.label,
      releaseYear: title.releaseYear,
      storyYear: title.storyYear,
      form,
      instance,
      runtimeMin: title.runtimeMin,
      tint: title.tint,
      x,
      y,
      z,
      ds,
      coverZ,
    };
  };

  /** What one title occupies along the run, spine-out: its thickness plus its gap. */
  const spineLength = (t: ShelfTitleData) =>
    DIMENSIONS[t.form ?? t.medium].d * depthScale(t.runtimeMin, logRange) + SPINE_GAP;

  // One run, left to right. Each universe is a contiguous stretch of it, divided from the next
  // by a partition rather than by clear air, and each stretch's own boards carry that
  // section's wear — which is what lets the furniture age *along the length* instead of
  // twelve separate objects each being uniformly one age.
  const boardTop = FLOOR_BOARD_Y;
  const runTop = FLOOR_BOARD_Y + RUN_LEVELS * LEVEL_PITCH;
  const runBottom = FLOOR_BOARD_Y - BOARD_THICKNESS;
  const runHeight = runTop - runBottom;
  const runCentreY = (runBottom + runTop) / 2;

  let cursor = 0;
  const dividerX: number[] = [];
  const sections: { start: number; end: number; wear: number }[] = [];

  runs.forEach((run, runIndex) => {
    const wear = wearByUnit[runIndex];
    const items: ShelfItem[] = [];
    const sectionStart = cursor;

    let x = cursor;
    run.titles.forEach((title) => {
      const dims = DIMENSIONS[title.form ?? title.medium];
      const length = spineLength(title);
      // Backs aligned to the back panel, as a real shelf stacks them — so the *fronts* step in
      // and out with each case's width, which is a thing you can actually see now that width
      // points into the shelf.
      items.push(place(title, x + (length - SPINE_GAP) / 2, boardTop + dims.h / 2, CASE_BACK_Z + dims.w / 2));
      x += length;
    });

    // A section is at least wide enough to carry its nameplate. Spider-Verse is two films and
    // 17mm of spine; with no floor it would be a section narrower than the plate above it,
    // which reads as a mistake rather than as a small collection.
    const packed = Math.max(x - SPINE_GAP, sectionStart);
    const sectionEnd = Math.max(packed, sectionStart + MIN_SECTION_WIDTH);
    const sectionWidth = sectionEnd - sectionStart;

    // The unanchored ones (story order's fourteen). They hang above their own section with
    // nothing underneath, spread across its width and scattered by a hash of the slug, so the
    // same title hangs in the same place on every render and every machine.
    run.floating.forEach((title, i) => {
      const spread = run.floating.length > 1 ? i / (run.floating.length - 1) : 0.5;
      const jitter = hashUnit(title.slug);
      const hangX = sectionStart + 0.25 + spread * Math.max(sectionWidth - 0.5, 0.3) + (jitter - 0.5) * 0.3;
      const hangY = runTop + 0.8 + jitter * 1.6;
      const hangZ = CASE_BACK_Z + DIMENSIONS.amaray.w / 2 + (hashUnit(`${title.slug}-z`) - 0.5) * 0.6;
      items.push(place(title, hangX, hangY, hangZ));
    });

    // Recorded, not emitted. The boards cannot be sized from the section alone: they have to
    // reach the *divider centres* either side, or the padding around each divider becomes a
    // hole in the shelf and twelve sections read as twelve boxes standing in a row — which is
    // precisely the thing one run exists not to be.
    sections.push({ start: sectionStart, end: sectionEnd, wear });

    universes.push({
      key: run.key,
      label: run.label,
      startX: sectionStart,
      endX: sectionEnd,
      wear,
      centreY: runCentreY,
      height: runHeight,
      items,
    });

    cursor = sectionEnd;
    if (runIndex < runs.length - 1) {
      dividerX.push(cursor + DIVIDER_PAD + UPRIGHT_WIDTH / 2);
      cursor += DIVIDER_PAD * 2 + UPRIGHT_WIDTH;
    }
  });

  // The boards, now that the divider positions are known. Each spans from the boundary behind
  // it to the boundary in front — the divider centres, or the run's own ends — so consecutive
  // boards share an edge and the shelf is unbroken along its whole length, while each still
  // carries its own section's wear. Continuous timber, a gradient of age.
  const runLeft = -UPRIGHT_WIDTH / 2;
  const runRight = cursor + UPRIGHT_WIDTH / 2;
  sections.forEach((section, i) => {
    const left = i === 0 ? runLeft : dividerX[i - 1];
    const right = i === sections.length - 1 ? runRight : dividerX[i];
    const span = right - left;
    const mid = (left + right) / 2;
    boardSlabMatrices.push(matrix(mid, boardTop - BOARD_THICKNESS / 2, 0, span, BOARD_THICKNESS, BOARD_DEPTH));
    boardSlabWear.push(section.wear);
    boardSlabMatrices.push(matrix(mid, runTop - BOARD_THICKNESS / 2, 0, span, BOARD_THICKNESS, BOARD_DEPTH));
    boardSlabWear.push(section.wear);
    boardSlabMatrices.push(
      matrix(mid, runCentreY, -BOARD_DEPTH / 2 + BACK_PANEL_THICKNESS, span, runHeight, BACK_PANEL_THICKNESS)
    );
    boardSlabWear.push(section.wear);
    // The lip: a brighter trim strip along the board's front-top edge.
    boardLipMatrices.push(matrix(mid, boardTop - BOARD_LIP_HEIGHT / 2, BOARD_DEPTH / 2, span, BOARD_LIP_HEIGHT, 0.03));
    boardLipWear.push(section.wear);
  });

  // The partitions between sections. They take the mean wear rather than either neighbour's:
  // a divider belongs to both sides, and giving it one side's value would read as the gradient
  // stepping in the wrong place.
  const meanWear = wearByUnit.length ? wearByUnit.reduce((a, b) => a + b, 0) / wearByUnit.length : 0.5;
  for (const x of dividerX) {
    boardSlabMatrices.push(matrix(x, runCentreY, 0, UPRIGHT_WIDTH, runHeight, BOARD_DEPTH));
    boardSlabWear.push(meanWear);
  }

  // And the two ends. docs/05-3d-shelf.md §12 Q18: **the gallery ends.** A real wall at each
  // extreme, because this is an archive of a finite thing and a wall says *complete* in a way
  // no caption can. Each end takes the wear of the section it closes, so the oldest end of the
  // run is visibly the oldest.
  const endWear = [wearByUnit[0] ?? meanWear, wearByUnit[wearByUnit.length - 1] ?? meanWear];
  [runLeft, runRight].forEach((x, i) => {
    boardSlabMatrices.push(matrix(x, runCentreY, 0, UPRIGHT_WIDTH, runHeight, BOARD_DEPTH));
    boardSlabWear.push(endWear[i]);
  });

  // **Brackets.** The run is mounted on a wall at eye height, and the owner's words were that
  // the shelves "seem like they are floating" — which is exactly what a wall-mounted shelf with
  // no visible support is called. A cast shadow fixes the *detachment*; only a bracket answers
  // the question of what is holding it up.
  //
  // A diagonal strut from under the front of the board back and down to the wall: the ordinary
  // shelf bracket, and the one shape that reads as support at a glance from any distance.
  const bracketRun = runRight - runLeft;
  const bracketCount = Math.max(2, Math.round(bracketRun / BRACKET_PITCH));
  for (let i = 0; i <= bracketCount; i++) {
    const x = runLeft + (bracketRun * i) / bracketCount;
    boardSlabMatrices.push(
      matrix(
        x,
        (BRACKET_TOP_Y + BRACKET_FOOT_Y) / 2,
        (BRACKET_FRONT_Z + BRACKET_BACK_Z) / 2,
        BRACKET_THICKNESS,
        BRACKET_DEPTH,
        BRACKET_LENGTH,
        BRACKET_QUAT
      )
    );
    // Brackets take the wear of whatever stands above them, so the ironmongery ages with the
    // section it carries rather than being a uniform band under an ageing run.
    const above = sections.find((s) => x >= s.start && x <= s.end);
    boardSlabWear.push(above?.wear ?? meanWear);
  }

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
