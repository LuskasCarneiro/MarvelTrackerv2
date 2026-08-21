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
 * Headroom above a row's cases. Cover-out needed 15cm so a cover could be seen at all;
 * spine-out does not, and a real DVD shelf is snug. Dropping it tightens the whole unit into
 * something that reads as furniture rather than as scaffolding.
 */
const ROW_CLEARANCE = 0.06;
const BOARD_THICKNESS = 0.04;
/** The brass shelf edge. Deep enough to catch light and read as a line across the room —
 *  at 2mm it was there and invisible, which is the same as not being there. */
const BOARD_LIP_HEIGHT = 0.16;
/**
 * Spine-out, a case lies 135mm *into* the shelf instead of 14mm, so the board has to be a
 * real board — 50mm held a case on its edge and would now hold about a third of one. 175mm
 * is a domestic DVD shelf, and it lets the widest historical form (a 170mm film can) sit on
 * it with only the overhang a real object would have.
 */
const BOARD_DEPTH = 1.75;
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
  /** Which way this case faces at rest. Face-out it is its wall's yaw; spine-out it is that
   *  plus SPINE_YAW. Stored per item because the room has three walls and a case on the left
   *  wall is turned ninety degrees from one on the back. */
  yaw: number;
  /** Whether it stands spine-out. Face-out its printed cover is proud at rest, because that
   *  is what is on display; spine-out the cover parks inside the case so it cannot z-fight
   *  through the neighbour 2mm away. */
  spineOut: boolean;
  /** The yaw of the wall it lives on, which is the direction it must face once presented —
   *  a case drawn out on the left wall has to turn to the viewer standing at the left wall. */
  wallYaw: number;
};

export type UniverseShelf = {
  key: string;
  label: string;
  /** 0 back, 1 left, 2 right. See WALL_YAW. */
  wall: number;
  /** The wall's outward yaw — where the camera stands, and which way it looks. */
  yaw: number;
  width: number;
  /** How many shelves of this cabinet are open rather than cupboard door. Encodes the size
   *  of the collection: see openLevelsFor(). */
  openLevels: number;
  /** The centre of this bay's front face, which is what the camera squares up to. */
  face: { x: number; y: number; z: number };
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
  /** Concealed strip lighting under every shelf — emissive geometry, not lights. See Q9. */
  boardGlowMatrices: THREE.Matrix4[];
  /**
   * The lit recess at the centre of the wall you face, and where its featured poster hangs.
   * Null only if there is no back wall at all, which cannot happen with any real catalogue.
   */
  arch: { position: { x: number; y: number; z: number }; yaw: number; width: number; height: number } | null;
  /** Wear per board instance, in the same order as the matrices above, so the furniture can
   * be tinted per unit without a material or a draw call per bookcase. */
  boardSlabWear: number[];
  boardLipWear: number[];
  /** World-space bounds of every case (not the boards), for framing the default camera. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** The room the cabinets imply, sized to its contents rather than the other way round. */
  room: { halfWidth: number; depth: number; height: number };
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


/** Sized for the tallest case in the catalogue: any medium can stand anywhere on the run. */
const LEVEL_PITCH = Math.max(...Object.values(DIMENSIONS).map((d) => d.h)) + ROW_CLEARANCE + BOARD_THICKNESS;


/**
 * A partition between one universe's stretch and the next, and the clear air either side of
 * it. This is what replaced the gap between separate bookcases: the sections are **joinery**
 * now, not furniture standing apart, so a universe is read as a division of one thing rather
 * than as its own object.
 */
const DIVIDER_PAD = 0.14;

/** The base the cabinet stands on. A plinth is what stops a tall case looking like it was
 *  dropped on the floor, and it is the reason the room now has a visible floor line. */
const PLINTH_HEIGHT = 0.8;
/** How far the plinth is set back from the cabinet face. The recess is what makes it read as
 *  a base rather than as the carcass carrying on to the floor. */
const PLINTH_SETBACK = 0.18;

const UPRIGHT_WIDTH = 0.16;
/** The brass inlay down each pilaster: how wide the strip is, and how far it stands proud. */
const PILASTER_BRASS = 0.07;
const PILASTER_PROUD = 0.05;
/** The brass band under the cornice. */
const CORNICE_BAND = 0.2;
/** The door panel's brass rule: how far in from the door edge, and how fine the line. */
const DOOR_MARGIN = 0.55;
const DOOR_RULE = 0.05;
/** The concealed strip under each shelf: how deep the line reads, and how far it is tucked
 *  back from the front edge so you see the light and not the fitting. */
const GLOW_HEIGHT = 0.24;
const GLOW_SETBACK = 0.3;
const BACK_PANEL_THICKNESS = 0.03;

/** Where every case's back sits: against the back panel, as they do on a real shelf. */

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
/**
 * The room's three walls, as frames rather than as special cases.
 *
 * Every cabinet is laid out in **wall-local** coordinates — `u` along the wall, `y` up, `d` out
 * into the room — and then turned into world space by the wall's own yaw. That is the whole
 * trick: the back wall is the identity case, and the two side walls are the same code read at
 * ninety degrees. Nothing downstream needs to know which wall it is on except the camera, and
 * the camera is told.
 *
 * Local +Z points **out of the wall into the room**, so a case's cover faces the viewer when
 * its yaw is the wall's yaw, and its spine faces the viewer at yaw + SPINE_YAW.
 */
export const WALL_YAW = [0, Math.PI / 2, -Math.PI / 2] as const;
export type WallId = 0 | 1 | 2;

/** The direction a wall faces, which is where the camera stands to look at it. */
export function wallOutward(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/**
 * How much room one title takes standing face-out. The measurement that decides everything
 * else: face-out is roughly thirteen times hungrier than spine-out, which is why a room this
 * size can be filled at all by a collection that is only 1.6m of spine.
 */
const FACE_PITCH = 1.4;

/** The narrowest a cabinet gets, however little it holds. Below this it reads as a slot. */
const MIN_BAY = 4.5;
/** How wide a filler cupboard wants to be — a run of them, not one enormous door. */
const FILLER_TARGET = 7;
const EMPTY_RUN: ShelfRun = { key: "", label: "", titles: [], floating: [] };
const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0.5);

/** The arched recess at the centre of the back wall — the room's focal point. */
const ARCH_WIDTH = 13;
/** The niche's proportions: how thick its jambs, head and sill are, how deep it is recessed,
 *  and the brass surround that makes the poster inside read as a framed painting. */
const ARCH_JAMB = 1.1;
const ARCH_HEAD = 2.4;
const ARCH_SILL = 5;
const ARCH_DEPTH_BACK = 0.4;
const ARCH_FRAME = 0.55;
const ARCH_FRAME_PROUD = 0.16;
/**
 * However small the collection, a room you stand inside has a minimum that reads as a room.
 *
 * Measured against the furniture rather than guessed: two life-sized 2.19m sofas facing each
 * other do not fit in the 3.8m room this used to build, which is why they read as "too big"
 * when they were the one thing at correct scale. 6m by 5m is a gallery; 3.8 by 2.8 was a
 * cupboard with a very high ceiling.
 */
const MIN_ROOM_WIDTH = 60;
const MIN_ROOM_DEPTH = 50;
/** How far a case stands out from the wall plane: back against the carcass, as they do. */
const CASE_FACE_D = 1.28;
/** Cupboard doors sit fractionally proud of the carcass, as doors do, and are thin. */
const DOOR_INSET = 0.06;
const DOOR_THICKNESS = 0.09;

/**
 * Every carcass is the same height — Q21, the owner's correction. What varies is how much of
 * it is open shelf and how much is cupboard door below, and *that* is what encodes the size of
 * the collection. One cornice line all the way round the room.
 */
/**
 * Floor to (near enough) ceiling, at 2.6m in a 2.75m room. It was 2.0m in a 3.3m room, which
 * left half a metre of bare plaster over every cabinet and was most of why the walls read as
 * unfinished. Fitted joinery in a room like the reference runs to the cornice.
 */
const CABINET_HEIGHT = 26;
const TOP_RAIL = 0.3;
const MAX_OPEN_LEVELS = 8;

/**
 * How many open shelves a bay gets.
 *
 * Chosen so the open section lands at a tall, narrow aspect rather than a wide squat one:
 * width is roughly `n * FACE_PITCH / L` and open height is `L * LEVEL_PITCH`, so asking for
 * width ≈ 0.55 × height gives `L = sqrt(1.23n)`. Derived rather than dialled, so a universe
 * that grows gets a taller bay instead of a wider one and the room keeps its proportions.
 */
export function openLevelsFor(titles: number): number {
  const fit = Math.floor((CABINET_HEIGHT - TOP_RAIL) / LEVEL_PITCH);
  return Math.min(MAX_OPEN_LEVELS, fit, Math.max(1, Math.round(Math.sqrt(1.23 * titles))));
}

/**
 * The archive as a room: three walls of fitted cabinets, one bay per universe, the largest
 * collection facing you as you arrive.
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
  const boardGlowMatrices: THREE.Matrix4[] = [];
  const boardSlabWear: number[] = [];
  const boardLipWear: number[] = [];
  const wearByUnit = unitWear(runs);
  const universes: UniverseShelf[] = [];
  let arch: ShelfLayout["arch"] = null;
  const bounds = { minX: 0, maxX: 0, minY: Infinity, maxY: -Infinity };

  const buckets = new Map<Form, ShelfLayout["media"][number]>();
  const bucketFor = (form: Form) => {
    let bucket = buckets.get(form);
    if (!bucket) {
      bucket = { form, bodyMatrices: [], coverMatrices: [], coverUvs: [], slugs: [] };
      buckets.set(form, bucket);
    }
    return bucket;
  };

  const bayItems: ShelfItem[][] = runs.map(() => []);

  const quatFor = (yaw: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  /** Adds one case to its medium's bucket and returns where it went, in world space. */
  const place = (
    title: ShelfTitleData,
    x: number,
    y: number,
    z: number,
    yaw: number,
    spineOut: boolean
  ): ShelfItem => {
    const form = title.form ?? title.medium;
    const dims = DIMENSIONS[form];
    const ds = depthScale(title.runtimeMin, logRange);
    const coverZ = (dims.d * ds) / 2 + COVER_INSET;
    const bucket = bucketFor(form);
    const instance = bucket.slugs.length;
    const quat = quatFor(yaw);

    bucket.bodyMatrices.push(matrix(x, y, z, 1, 1, ds, quat));
    const cellPx = atlasCells[title.slug];
    bucket.coverUvs.push(cropCellUv(cellPx ?? { x: 0, y: 0 }, cellSize, atlasSize, dims.w / dims.h));
    // **Face-out, the cover has to be proud at rest — it *is* the thing on display.**
    //
    // Spine-out it must be parked inside the case instead, because a plane 1.5mm proud of a
    // spine z-fights through the neighbour 2mm away. Getting this the same for both left every
    // shelf looking empty: the artwork was there, buried inside an opaque box.
    const faceOffset = spineOut ? 0 : coverZ;
    bucket.coverMatrices.push(
      matrix(x + Math.sin(yaw) * faceOffset, y, z + Math.cos(yaw) * faceOffset, 1, 1, 1, quat)
    );
    bucket.slugs.push(title.slug);

    if (!cellPx) {
      blankCovers.push({
        slug: title.slug,
        tint: title.tint,
        position: { x, y, z },
        size: { w: dims.w - CORNER_RADIUS * 0.6, h: dims.h - CORNER_RADIUS * 0.6 },
      });
    }

    bounds.maxX = Math.max(bounds.maxX, x + dims.w / 2);
    bounds.minX = Math.min(bounds.minX, x - dims.w / 2);
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
      yaw,
      wallYaw: yaw - (spineOut ? SPINE_YAW : 0),
      spineOut,
    };
  };

  // ---- Pass 1: how big is each bay? -----------------------------------------------------
  //
  // The biggest collection takes the back wall, and the rest fall either side of it in order.
  // Found rather than hard-coded: if the catalogue is reordered or a universe overtakes the
  // MCU, the room re-composes itself instead of quietly putting the wrong thing in front of
  // the door.
  const sizes = runs.map((r) => r.titles.length);
  // **The two largest take the back wall, one either side of the arch** — which is exactly
  // what the reference does with its doorway. One bay plus an arch left most of the back wall
  // bare, and the bare back wall was the first thing you saw on arrival.
  const backTwo = runs
    .map((_, i) => i)
    .sort((a, b) => sizes[b] - sizes[a])
    .slice(0, 1)
    .sort((a, b) => a - b);

  type Bay = {
    run: ShelfRun;
    wear: number;
    titles: ShelfTitleData[];
    open: number;
    width: number;
    /** Carcass with nothing in it, put there so a wall is never bare. */
    filler?: boolean;
    /** The central niche, not a cupboard: brass-framed, lit, holding one featured title. */
    arch?: boolean;
  };
  const bays: Bay[] = runs.map((run, i) => {
    const open = openLevelsFor(run.titles.length);
    const perLevel = Math.max(1, Math.ceil(run.titles.length / open));
    return {
      run,
      wear: wearByUnit[i],
      titles: run.titles,
      open,
      width: Math.max(MIN_BAY, perLevel * FACE_PITCH),
    };
  });

  // The rest split evenly either side, in order, so the walk reads as one route: down the
  // left wall, across the back, and up the right. Splitting on the biggest one's *index*
  // instead left one wall bare whenever the largest collection happened to come first in the
  // catalogue — which it does.
  const rest = bays.map((_, i) => i).filter((i) => !backTwo.includes(i));
  const half = Math.ceil(rest.length / 2);
  const walls: { id: WallId; bays: number[] }[] = [
    { id: 1, bays: rest.slice(0, half) },
    { id: 0, bays: backTwo },
    { id: 2, bays: rest.slice(half) },
  ];

  /**
   * **Fill the leftover wall with cabinetry rather than leaving plaster.**
   *
   * The owner's words: *"I would rather accept empty shelves or closed cabinets than a bare
   * wall."* Bays are sized by what they hold, so a small collection on a 6m wall left metres
   * of nothing either side of it. These are real carcasses — same joinery, same brass, same
   * cupboard doors — holding no titles. A fitted library has runs that are simply not full;
   * it does not have gaps where the joinery stops.
   */
  const addFillers = (wall: { id: WallId; bays: number[] }) => {
    const span = wall.id === 0 ? halfWidth * 2 : sideLength;
    const used = wallLength(wall.bays) + (wall.id === 0 ? ARCH_WIDTH : 0); // arch not yet inserted
    const leftover = span - used - DIVIDER_PAD * 4;
    if (leftover < MIN_BAY) return;

    // Split evenly between the two ends, and again if either end would be a single
    // implausibly wide cupboard rather than a run of them.
    const perEnd = leftover / 2;
    const count = Math.max(1, Math.round(perEnd / FILLER_TARGET));
    const width = perEnd / count;
    const make = () => {
      bays.push({ run: EMPTY_RUN, wear: meanOf(wearByUnit), titles: [], open: 0, width, filler: true });
      return bays.length - 1;
    };
    const head = Array.from({ length: count }, make);
    const tail = Array.from({ length: count }, make);
    wall.bays = [...head, ...wall.bays, ...tail];
  };

  const wallLength = (ids: number[]) =>
    ids.reduce((sum, i) => sum + bays[i].width, 0) + Math.max(0, ids.length - 1) * DIVIDER_PAD * 2;

  // The room is sized to its contents rather than the other way round.
  const backLength = wallLength(walls[1].bays) + ARCH_WIDTH;
  const sideLength = Math.max(
    wallLength(walls[0].bays),
    wallLength(walls[2].bays),
    backLength * 0.8,
    MIN_ROOM_DEPTH
  );
  const halfWidth = Math.max(backLength, MIN_ROOM_WIDTH) / 2;

  // Only now, with the room actually sized: the fillers measure the leftover against a wall
  // whose length is already known. Called before this, they read halfWidth and sideLength in
  // their temporal dead zone and the whole scene fails to build.
  walls.forEach(addFillers);

  /**
   * **The arch goes in the middle of the back wall's run, as an entry rather than a gap.**
   *
   * It used to be a reserved width that nothing ever drew into, which is why the owner kept
   * asking where it was. Inserting it at the midpoint of the finished list — after the filler
   * cupboards, so it counts them — puts it at the centre of the wall you face on arrival,
   * which is the strongest composition in the reference photo.
   */
  const backWall = walls.find((w) => w.id === 0);
  if (backWall) {
    bays.push({ run: EMPTY_RUN, wear: meanOf(wearByUnit), titles: [], open: 0, width: ARCH_WIDTH, arch: true });
    backWall.bays.splice(Math.ceil(backWall.bays.length / 2), 0, bays.length - 1);
  }

  /** Wall-local (u, y, d) to world. See WALL_YAW. */
  const toWorld = (wall: WallId, u: number, y: number, d: number) => {
    // Back wall on the z = 0 plane opening toward +z; the sides face each other across it.
    // Travel runs front-to-back down the left wall, left-to-right across the back, then
    // back-to-front up the right — one continuous U, which is how you would actually walk it.
    if (wall === 0) return { x: -halfWidth + u, y, z: d };
    if (wall === 1) return { x: -halfWidth + d, y, z: sideLength - u };
    return { x: halfWidth - d, y, z: u };
  };

  // ---- Pass 2: lay each wall out ---------------------------------------------------------
  const runTop = CABINET_HEIGHT;
  const runBottom = 0;

  for (const wall of walls) {
    // No arch reservation here: by now it is in `wall.bays` and `wallLength` counts it.
    const total = wallLength(wall.bays);
    const span = wall.id === 0 ? halfWidth * 2 : sideLength;
    let u = (span - total) / 2; // centred on its wall

    wall.bays.forEach((index) => {
      const bay = bays[index];
      const start = u;

      // The arch sits in the middle of the back wall, so the back wall's single bay is split
      // either side of it. With one bay that means the arch takes the centre and the cabinet
      // sits to its left, which is what the reference does with its doorway.

      const perLevel = Math.max(1, Math.ceil(bay.titles.length / bay.open));
      bay.titles.forEach((title, i) => {
        const level = Math.floor(i / perLevel);
        const column = i % perLevel;
        // Level 0 is the top shelf: a bay fills the way a bookcase is read, along the top and
        // then down, and the open shelving hangs from the cornice so it lands at eye level.
        const shelfTop = runTop - TOP_RAIL - level * LEVEL_PITCH;
        const dims = DIMENSIONS[title.form ?? title.medium];
        const at = toWorld(
          wall.id,
          start + column * FACE_PITCH + FACE_PITCH / 2,
          shelfTop - LEVEL_PITCH + dims.h / 2 + BOARD_THICKNESS,
          CASE_FACE_D
        );
        bayItems[index].push(place(title, at.x, at.y, at.z, WALL_YAW[wall.id], false));
      });

      // The fourteen that belong outside time, in story order: hung above the cabinet with
      // nothing underneath them. Scattered by a hash of the slug so the same title hangs in
      // the same place on every render and every machine.
      bay.run.floating.forEach((title, i) => {
        const spread = bay.run.floating.length > 1 ? i / (bay.run.floating.length - 1) : 0.5;
        const jitter = hashUnit(title.slug);
        const hung = toWorld(
          wall.id,
          start + 0.6 + spread * Math.max(bay.width - 1.2, 0.4),
          runTop + 1.2 + jitter * 2.4,
          BOARD_DEPTH * 0.6 + (hashUnit(`${title.slug}-d`) - 0.5) * 0.8
        );
        bayItems[index].push(place(title, hung.x, hung.y, hung.z, WALL_YAW[wall.id], false));
      });

      // The joinery for this bay: a board under every open shelf, the carcass sides, the top,
      // the back panel, and the cupboard doors filling everything below the open section.
      const quat = quatFor(WALL_YAW[wall.id]);
      const mid = start + bay.width / 2;
      for (let level = 0; level < bay.open; level++) {
        const shelfTop = runTop - TOP_RAIL - level * LEVEL_PITCH;
        const at = toWorld(wall.id, mid, shelfTop - LEVEL_PITCH - BOARD_THICKNESS / 2, BOARD_DEPTH / 2);
        boardSlabMatrices.push(matrix(at.x, at.y, at.z, bay.width, BOARD_THICKNESS, BOARD_DEPTH, quat));
        boardSlabWear.push(bay.wear);
        const lip = toWorld(wall.id, mid, shelfTop - LEVEL_PITCH - BOARD_LIP_HEIGHT / 2, BOARD_DEPTH);
        boardLipMatrices.push(matrix(lip.x, lip.y, lip.z, bay.width, BOARD_LIP_HEIGHT, 0.04, quat));
        boardLipWear.push(bay.wear);

        // **Concealed lighting.** The bright line under every shelf edge is the reference's
        // signature and the reason its shelves read as lit rather than as recesses. This is
        // the emissive half of Q9: geometry that *glows* without lighting anything, which
        // costs a draw call for the whole room instead of a light per bay charged against
        // every fragment in the scene.
        const glow = toWorld(wall.id, mid, shelfTop - BOARD_THICKNESS - GLOW_HEIGHT / 2, BOARD_DEPTH - GLOW_SETBACK);
        boardGlowMatrices.push(matrix(glow.x, glow.y, glow.z, bay.width - 0.3, GLOW_HEIGHT, 0.06, quat));
      }

      // The cupboard below. Its height is the whole point of Q21: the less a universe holds,
      // the more of its cabinet is a closed door, and the top line never moves.
      const doorTop = runTop - TOP_RAIL - bay.open * LEVEL_PITCH;
      const doorHeight = doorTop - runBottom - PLINTH_HEIGHT;
      if (doorHeight > 0.2) {
        const at = toWorld(wall.id, mid, runBottom + PLINTH_HEIGHT + doorHeight / 2, BOARD_DEPTH - DOOR_INSET);
        boardSlabMatrices.push(matrix(at.x, at.y, at.z, bay.width - 0.12, doorHeight, DOOR_THICKNESS, quat));
        boardSlabWear.push(bay.wear);

        // A brass rule inset around each door panel — the last of Q24's four brass elements.
        // Without it the closed half of every small universe is a blank wall of wood, which is
        // most of the cabinet on most of the bays.
        const inset = DOOR_MARGIN;
        const panelW = bay.width - 0.12 - inset * 2;
        const panelH = doorHeight - inset * 2;
        if (panelW > 0.4 && panelH > 0.4) {
          for (const [w, h, dy] of [
            [panelW, DOOR_RULE, panelH / 2],
            [panelW, DOOR_RULE, -panelH / 2],
            [DOOR_RULE, panelH, 0],
            [DOOR_RULE, panelH, 0],
          ] as const) {
            const dx = w === DOOR_RULE ? (panelW / 2) * (boardLipMatrices.length % 2 ? 1 : -1) : 0;
            const rule = toWorld(
              wall.id,
              mid + dx,
              runBottom + PLINTH_HEIGHT + doorHeight / 2 + dy,
              BOARD_DEPTH - DOOR_INSET + PILASTER_PROUD / 2
            );
            boardLipMatrices.push(matrix(rule.x, rule.y, rule.z, w, h, PILASTER_PROUD, quat));
            boardLipWear.push(bay.wear);
          }
        }
      }

      // Carcass: back panel, the top, and the plinth.
      const back = toWorld(wall.id, mid, (runBottom + runTop) / 2, BACK_PANEL_THICKNESS / 2);
      boardSlabMatrices.push(
        matrix(back.x, back.y, back.z, bay.width, runTop - runBottom, BACK_PANEL_THICKNESS, quat)
      );
      boardSlabWear.push(bay.wear);

      const topGlow = toWorld(wall.id, mid, runTop - TOP_RAIL - GLOW_HEIGHT / 2, BOARD_DEPTH - GLOW_SETBACK);
      boardGlowMatrices.push(matrix(topGlow.x, topGlow.y, topGlow.z, bay.width - 0.3, GLOW_HEIGHT, 0.06, quat));

      const top = toWorld(wall.id, mid, runTop - TOP_RAIL / 2, BOARD_DEPTH / 2);
      boardSlabMatrices.push(matrix(top.x, top.y, top.z, bay.width + UPRIGHT_WIDTH * 2, TOP_RAIL, BOARD_DEPTH, quat));
      boardSlabWear.push(bay.wear);

      const plinth = toWorld(wall.id, mid, runBottom + PLINTH_HEIGHT / 2, (BOARD_DEPTH - PLINTH_SETBACK) / 2);
      boardSlabMatrices.push(
        matrix(plinth.x, plinth.y, plinth.z, bay.width, PLINTH_HEIGHT, BOARD_DEPTH - PLINTH_SETBACK, quat)
      );
      boardSlabWear.push(bay.wear);

      // The pilasters either side, which is what turns a row of boxes into fitted joinery.
      for (const side of [-1, 1]) {
        const post = toWorld(wall.id, mid + side * (bay.width / 2 + UPRIGHT_WIDTH / 2), (runBottom + runTop) / 2, BOARD_DEPTH / 2);
        boardSlabMatrices.push(
          matrix(post.x, post.y, post.z, UPRIGHT_WIDTH, runTop - runBottom, BOARD_DEPTH, quat)
        );
        boardSlabWear.push(bay.wear);

        // **A brass strip down the face of each pilaster.** This is the single most repeated
        // detail in the reference and the room read as bare boxes without it. It goes into the
        // lip bucket, which is already the brass material, so a room's worth of it costs no
        // extra draw call.
        const strip = toWorld(
          wall.id,
          mid + side * (bay.width / 2 + UPRIGHT_WIDTH / 2),
          (runBottom + runTop) / 2,
          BOARD_DEPTH + PILASTER_PROUD / 2
        );
        boardLipMatrices.push(
          matrix(strip.x, strip.y, strip.z, PILASTER_BRASS, runTop - runBottom, PILASTER_PROUD, quat)
        );
        boardLipWear.push(bay.wear);
      }

      // A brass band under the cornice, running the width of the bay — the reference frames
      // every nameplate against one, and it is what stops the top of the cabinet being a plain
      // edge of wood.
      const band = toWorld(wall.id, mid, runTop - TOP_RAIL - CORNICE_BAND / 2, BOARD_DEPTH + PILASTER_PROUD / 2);
      boardLipMatrices.push(
        matrix(band.x, band.y, band.z, bay.width, CORNICE_BAND, PILASTER_PROUD, quat)
      );
      boardLipWear.push(bay.wear);

      const centre = toWorld(wall.id, mid, (runBottom + runTop) / 2, 0);
      const face = toWorld(wall.id, mid, (runBottom + runTop) / 2, BOARD_DEPTH);
      if (bay.arch) {
        const quatA = quatFor(WALL_YAW[wall.id]);
        const mid = start + bay.width / 2;
        const openW = bay.width - ARCH_JAMB * 2;
        const openTop = runTop - TOP_RAIL - ARCH_HEAD;
        const openBottom = runBottom + ARCH_SILL;
        const openH = openTop - openBottom;

        // The recess itself: a panel set well back, so the niche reads as depth rather than as
        // a picture hung flat on the run.
        const back = toWorld(wall.id, mid, (openTop + openBottom) / 2, ARCH_DEPTH_BACK);
        boardSlabMatrices.push(matrix(back.x, back.y, back.z, openW, openH, BACK_PANEL_THICKNESS, quatA));
        boardSlabWear.push(bay.wear);

        // Jambs, head and sill in cabinetry, framing the opening.
        for (const side of [-1, 1]) {
          const jamb = toWorld(wall.id, mid + side * (openW + ARCH_JAMB) / 2, (runBottom + runTop) / 2, BOARD_DEPTH / 2);
          boardSlabMatrices.push(matrix(jamb.x, jamb.y, jamb.z, ARCH_JAMB, runTop - runBottom, BOARD_DEPTH, quatA));
          boardSlabWear.push(bay.wear);
        }
        const head = toWorld(wall.id, mid, (openTop + runTop - TOP_RAIL) / 2, BOARD_DEPTH / 2);
        boardSlabMatrices.push(matrix(head.x, head.y, head.z, openW, runTop - TOP_RAIL - openTop, BOARD_DEPTH, quatA));
        boardSlabWear.push(bay.wear);
        const sill = toWorld(wall.id, mid, (runBottom + openBottom) / 2, BOARD_DEPTH / 2);
        boardSlabMatrices.push(matrix(sill.x, sill.y, sill.z, openW, openBottom - runBottom, BOARD_DEPTH, quatA));
        boardSlabWear.push(bay.wear);

        // A brass surround on the opening — the owner asked for the poster to sit in a frame
        // "like it was a painting", and this is the frame.
        const frameAt = (du: number, dy: number, w: number, h: number) => {
          const at = toWorld(wall.id, mid + du, (openTop + openBottom) / 2 + dy, BOARD_DEPTH + ARCH_FRAME_PROUD / 2);
          boardLipMatrices.push(matrix(at.x, at.y, at.z, w, h, ARCH_FRAME_PROUD, quatA));
          boardLipWear.push(bay.wear);
        };
        frameAt(0, openH / 2, openW + ARCH_FRAME * 2, ARCH_FRAME);
        frameAt(0, -openH / 2, openW + ARCH_FRAME * 2, ARCH_FRAME);
        frameAt(-(openW + ARCH_FRAME) / 2, 0, ARCH_FRAME, openH);
        frameAt((openW + ARCH_FRAME) / 2, 0, ARCH_FRAME, openH);

        // Just behind the brass surround, not deep in the recess. Sunk at the back of the
        // niche the artwork was being occluded by the joinery around the opening — and a
        // framed painting hangs near the front of its rebate anyway, not against the wall.
        const face = toWorld(wall.id, mid, (openTop + openBottom) / 2, BOARD_DEPTH - 0.08);
        arch = {
          position: { x: face.x, y: face.y, z: face.z },
          yaw: WALL_YAW[wall.id],
          width: openW - ARCH_FRAME,
          height: openH - ARCH_FRAME,
        };

        u = start + bay.width + DIVIDER_PAD * 2;
        return;
      }

      if (bay.filler) {
        u = start + bay.width + DIVIDER_PAD * 2;
        return;
      }

      universes.push({
        key: bay.run.key,
        label: bay.run.label,
        wall: wall.id,
        yaw: WALL_YAW[wall.id],
        width: bay.width,
        openLevels: bay.open,
        startX: centre.x - bay.width / 2,
        endX: centre.x + bay.width / 2,
        face: { x: face.x, y: face.y, z: face.z },
        wear: bay.wear,
        centreY: (runBottom + runTop) / 2,
        height: runTop - runBottom,
        items: bayItems[index],
      });

      u = start + bay.width + DIVIDER_PAD * 2;
    });
  }

  bounds.minY = Math.min(bounds.minY, runBottom);
  bounds.maxY = Math.max(bounds.maxY, runTop);

  return {
    media: [...buckets.values()],
    universes: runs.map((r) => universes.find((u) => u.key === r.key)!),
    blankCovers,
    boardSlabMatrices,
    boardLipMatrices,
    boardSlabWear,
    boardLipWear,
    boardGlowMatrices,
    arch,
    bounds,
    room: { halfWidth, depth: sideLength, height: CABINET_HEIGHT },
  };
}
