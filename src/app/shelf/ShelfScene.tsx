"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { PerformanceMonitor, useProgress, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { tintToHsl } from "@/lib/tint";
import { renderBackCover } from "./backCover";
import { buildSpineAtlas, type SpineTitle } from "./spineAtlas";
import { buildSubstrate, SUBSTRATE_SCALE } from "./substrate";
import { loadNotes } from "./notes";
import { bestMatch, type SearchableTitle } from "./search";
import { buildRoomSurface, ROOM_BUMP_SCALE } from "./roomSurfaces";
import { buildGallerySurface, GALLERY_COLOUR_MIX } from "./galleryMaterials";
import { buildPlaqueAtlas, type PlaqueAtlas } from "./plaques";
import atlasManifest from "../../../data/atlas.json";
import {
  DIMENSIONS,
  CORNER_RADIUS,
  BODY_MATERIAL,
  COVER_SHININESS,
  buildShelfLayout,
  formForStoryYear,
  ROUND_FORMS,
  SPINE_YAW,
  wallOutward,
  type Form,
  type ShelfTitleData,
  type ShelfItem,
  type ShelfRun,
  type UniverseData,
  type UniverseShelf,
  type CellUv,
} from "./instancing";

type AtlasCellPx = { atlas: number; x: number; y: number };
const atlasCells: Record<string, AtlasCellPx> = atlasManifest.cells;
const CELL_SIZE = atlasManifest.cell;
const ATLAS_SIZE = atlasManifest.atlasSize;
const ATLAS_PATH = `/atlas/${atlasManifest.atlases[0]}`;

// data/atlas.json is a build artifact this route only reads (see CLAUDE.md's "do not
// touch data/"). Today it always packs into one 4096x4096 sheet -- 149 covers into 176
// slots, comfortably one atlas (see scripts/build-atlas.ts). If a future pipeline run ever
// needs a second sheet, the cover InstancedMeshes below would need to split by atlas
// index; out of scope here, so this says so instead of silently sampling the wrong sheet.
if (atlasManifest.atlases.length > 1) {
  console.warn(`[shelf] ${atlasManifest.atlases.length} atlas sheets committed; only "${ATLAS_PATH}" is sampled.`);
}

// The board colours used to be mirrored from globals.css here. They are per-instance now —
// see WOOD_FRESH / WOOD_WORN and tintByWear — because each unit's furniture is aged by what
// stands on it, and an instance colour is not something a material can hold.


/**
 * The technical crux (see the brief): an InstancedMesh shares one material, so which atlas
 * cell each instance's cover shows has to travel as a per-instance attribute (aCell, set on
 * the geometry in buildMediumMeshes) and be applied here rather than through the material's
 * own repeat/offset. Verbatim from the brief's shader recipe -- three 0.185 names the
 * varying vMapUv, not vUv, and #include <map_fragment> only exists once material.map is set.
 */
function createCoverMaterial(
  map: THREE.Texture,
  shininess: number,
  /**
   * The printed face carries the substrate too, and this is the half that actually shows.
   *
   * A bump on the case *body* is almost entirely hidden: the front of every case is covered
   * by its artwork plane, so the body's own surface survives only on the thin edges. Which
   * gets the material exactly backwards for the form it was built for — a steelbook's artwork
   * is printed **onto** the metal, so the metal has to modulate the artwork, not sit behind
   * it. Same for VHS: the litho card is the thing the picture is printed on.
   *
   * It samples through `vBumpMapUv`, three's own uv for the bump slot, so it tiles across the
   * face at the texture's repeat and is untouched by the atlas-cell window the shader below
   * applies to `map`. The two maps want different UVs, and that is exactly what they get.
   */
  substrate: THREE.Texture | null,
  /** Spine labels are ink on a transparent sheet laid over the case, so they need alpha
   * testing; covers are opaque and must not pay for it. Alpha *test* rather than blending
   * keeps depth writes on, so a spine still occludes properly and needs no sort order. */
  options: {
    alphaTest?: number;
    bumpScale?: number;
    itemBump?: number;
    foil?: number;
    /** Override the default highlight. The nameplate needs it: it hangs directly under the
     *  picture light, square to the camera, so the default specular lands as a broad
     *  head-on highlight that clips the plate — engraving included — to flat white. */
    specular?: string;
  } = {}
): THREE.MeshPhongMaterial {
  const material = new THREE.MeshPhongMaterial({
    map,
    shininess,
    specular: new THREE.Color(options.specular ?? "#6b6259"),
    ...(substrate ? { bumpMap: substrate, bumpScale: options.bumpScale ?? 0.02 } : {}),
    ...(options.alphaTest ? { transparent: false, alphaTest: options.alphaTest } : {}),
  });
  const itemBump = options.itemBump ?? 0;
  const foil = options.foil ?? 0;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uItemBump = { value: itemBump };
    shader.uniforms.uFoil = { value: foil };
    // One texel of the atlas, for the gradient below. A constant rather than textureSize(),
    // which needs GLSL3 and would tie this shader to the WebGL2 path for no gain.
    shader.uniforms.uTexel = { value: 1 / ATLAS_SIZE };
    shader.uniforms.uDetailRange = { value: DETAIL_RANGE };

    shader.vertexShader =
      "attribute vec4 aCell;\nvarying vec4 vCell;\n" +
      shader.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n\tvCell = aCell;");

    shader.fragmentShader =
      "varying vec4 vCell;\nuniform float uItemBump;\nuniform float uFoil;\nuniform float uTexel;\nuniform float uDetailRange;\n" +
      shader.fragmentShader
        // Sample once, and keep the artwork's luminance — the two effects below are both
        // functions of it, and sampling a 4096² atlas three more times per fragment for
        // something already in a register is the kind of cost that never shows up in review.
        .replace(
          "#include <map_fragment>",
          `vec2 cellUv = vCell.xy + vMapUv * vCell.zw;
	vec4 artwork = texture2D( map, cellUv );
	diffuseColor *= artwork;
	float itemLum = dot( artwork.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );`
        )
        /**
         * Foil. PLAN.md §1's third finding is that Stripe models foil stamping as its own map
         * with its own specular, because the real books are foil-stamped — the material is
         * true to the physical object rather than decorative.
         *
         * We have no per-title foil masks and §6 rules out generating art. But a foil stamp is
         * not arbitrary: it lands on the title treatment, which is the brightest thing on
         * almost every one of these covers. So the mask is derivable from the artwork already
         * in the atlas — bright pixels take the extra specular, everything else is untouched.
         * smoothstep rather than a hard cut, or the foil gets a visible outline.
         */
        .replace(
          "#include <specularmap_fragment>",
          `#include <specularmap_fragment>
	specularStrength *= 1.0 + uFoil * smoothstep( 0.62, 0.96, itemLum );`
        )
        /**
         * The per-item bump — the second half of the teardown's two bump layers, which was
         * recorded as blocked on per-title art. It is not: debossing follows the printing, so
         * the cover's own luminance gradient *is* the relief. Two extra taps give a central
         * difference; the normal is nudged, never replaced, so the substrate underneath still
         * reads through it.
         *
         * Guarded on uItemBump so the forms that opt out pay nothing — a branch on a uniform
         * is coherent across the whole draw and costs nothing on any GPU this targets.
         */
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
	if ( uItemBump > 0.0 && length( vViewPosition ) < uDetailRange ) {
		float lx = dot( texture2D( map, cellUv + vec2( uTexel, 0.0 ) ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
		float ly = dot( texture2D( map, cellUv + vec2( 0.0, uTexel ) ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
		normal = normalize( normal + vec3( ( itemLum - lx ) * uItemBump, ( itemLum - ly ) * uItemBump, 0.0 ) );
	}`
        );
  };
  return material;
}

/**
 * Spine ink, and the one place in this scene that is deliberately unlit.
 *
 * **The original reason for this expired, and the decision outlived it.** It was unlit
 * because a spine faced sideways while the lamp stood in front of the shelf, so a lit surface
 * there sat at about ninety degrees to its only light source and rendered black — labels
 * drawn correctly and lit into invisibility, which reads exactly like a UV bug and is not
 * one. Spine-out, the spine faces the lamp squarely and that argument no longer applies.
 *
 * It stays unlit on the *other* half of the old reasoning, which did not expire: printing is
 * not a surface that reflects a room, it is ink, and it should read from any angle you can
 * see it from. The cost is honest — a shelf of unlit spines does not fall off towards the
 * dark ends of the run, so the case bodies behind them carry that depth alone.
 */
function createSpineMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  // White: the atlas now carries its own ink colour, the title's tint band and the format
  // mark, so anything but white here would multiply all three towards the same warm grey.
  const material = new THREE.MeshBasicMaterial({ map, alphaTest: 0.4 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute vec4 aCell;\nvarying vec4 vCell;\n" +
      shader.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n\tvCell = aCell;");
    shader.fragmentShader =
      "varying vec4 vCell;\n" +
      shader.fragmentShader.replace(
        "#include <map_fragment>",
        "diffuseColor *= texture2D( map, vCell.xy + vMapUv * vCell.zw );"
      );
  };
  return material;
}

type FormRow = {
  form: Form;
  slugs: string[];
  bodyMatrices: THREE.Matrix4[];
  coverMatrices: THREE.Matrix4[];
  coverUvs: CellUv[];
};

/**
 * The body of one form. A can and a reel are cylinders standing on edge like a record, so the
 * geometry is pre-rotated to face +z and every instance matrix stays a plain translate-scale
 * — the same shape of transform the cases use, and the pull works on it unchanged.
 */
function bodyGeometryFor(form: Form): THREE.BufferGeometry {
  const dims = DIMENSIONS[form];
  if (ROUND_FORMS.has(form)) {
    const cylinder = new THREE.CylinderGeometry(dims.w / 2, dims.w / 2, dims.d, 32);
    cylinder.rotateX(Math.PI / 2);
    return cylinder;
  }
  return new RoundedBoxGeometry(dims.w, dims.h, dims.d, 2, CORNER_RADIUS);
}

/** The printed face. A disc for the round forms — a film can carries a circular label, and
 * CircleGeometry's UVs already fill 0..1, so the atlas window crops it without any extra work. */
function coverGeometryFor(form: Form): THREE.BufferGeometry {
  const dims = DIMENSIONS[form];
  if (ROUND_FORMS.has(form)) return new THREE.CircleGeometry((dims.w / 2) * 0.86, 32);
  // Shrunk off the true face size the same amount the spike shrinks its poster plane, so
  // the printed insert sits within the moulded corner radius instead of poking past it.
  return new THREE.PlaneGeometry(dims.w - CORNER_RADIUS * 0.6, dims.h - CORNER_RADIUS * 0.6);
}

/**
 * Which forms carry a printed spine. A film can, a reel, a tablet and a bound volume have no
 * spine to print.
 *
 * `none` is now in the set, which reverses an earlier call. It was excluded because it stands
 * for a title that never had a physical release, so printing a spine on it "would assert the
 * opposite of what it means" — sound while spines faced sideways and were nearly never seen.
 * Spine-out it is 66 of the 152 titles, and leaving them out meant 43% of the shelf was
 * unmarked black slivers: no tint, and no format mark, on exactly the era Q7 exists to mark.
 *
 * It carries the two *bands* only, never a title — see buildSpineAtlas. A band is the
 * object's own colour and its era; a printed title is the claim about a physical release that
 * the old comment was right to refuse.
 */
const SPINE_FORMS = new Set<Form>(["vhs", "amaray", "bluray", "steel", "none"]);

/**
 * Which forms carry the substrate bump on their printed face.
 *
 * Not all of them, and this is a performance decision with a straight face: three's bump chunk
 * costs two extra texture fetches and a derivative *per fragment*, and the covers fill most of
 * the screen. Steel earns it — a steelbook's artwork is printed onto brushed metal and that is
 * the whole point of the materials work — and VHS earns it, being litho card. Amaray and
 * Blu-ray do not: `substrate.ts` describes their surface as "very fine, even micro-texture, low
 * amplitude" and "finer and smoother still", so they were paying the full price for something
 * at the edge of visibility, on the two forms that make up most of the catalogue.
 */
const COVER_SUBSTRATE_FORMS = new Set<Form>(["vhs", "steel"]);

/** How far the label sheet stands off the case's own side, so it never z-fights the body. */
const SPINE_INSET = 0.002;

/** How many times the substrate tile repeats across a case face. Grain, not pattern: high
 * enough that no one reads it as a texture, low enough to survive minification. */
const SUBSTRATE_REPEAT = 4;

/** The range AdaptiveQuality is allowed to move the device pixel ratio through. The floor used
 * to be 1; it is lower now because a machine that cannot hold 1 needs somewhere to go, and a
 * soft image that moves beats a crisp one that stutters. */
/** Where the viewer stands: back far enough to frame this bay, and a little above the
 * bay's own mid-height, so the shot sits at standing eye level rather than looking at the
 * middle of the furniture. `WIDE_FACTOR` is the same shot from further back, for taking in
 * the whole bay at once.
 *
 * The standing distance is a **gallery** distance, not a reading one: close enough that the
 * artwork is legible, far enough that the bay, its neighbours and the room around them are all
 * in shot. A locked-off camera that fills the frame with one bay edge to edge shows a wall of
 * posters and no architecture, which is the opposite of standing in a room. The case still
 * arrives at the same apparent size whichever distance is chosen, because the hold point is
 * measured back from the viewer rather than forward from the shelf. */
/**
 * Spine-out, a fixed standing distance stopped working. Cover-out every unit was metres wide
 * and 12.6 framed them all much the same; packed by thickness a universe of two titles is
 * 45cm and the MCU is a few times that, so one distance either buries the small units in the
 * middle of the frame or pushes the big ones off both edges.
 *
 * So stand at whatever distance makes *this* bay fill the same fraction of the shot. The
 * fractions are well under 1 on purpose — the note above still holds, this is a gallery
 * distance and not a reading one, and the neighbouring alcoves have to stay in view.
 */
const BAY_FILL_X = 0.5;
const BAY_FILL_Y = 0.8;
/** Never closer than arm's length, never so far the room stops reading as a room. */
const STAND_MIN = 3.2;
const STAND_MAX = 44;
/**
 * How much further back "the whole shelf" stands than the bay distance.
 *
 * Raised from 1.55, and it is doing a different job now. **The close shot cannot show the
 * room** — the camera is locked square-on at eye level, and a person standing at a shelf
 * looking straight ahead sees wall, not floor. That is not a framing bug, it is what facing a
 * wall looks like. So the room is the wide shot's job: back far enough and the floor, the
 * ceiling, the picture rail and both ends of the run come into frame at once.
 *
 * 5.0 rather than 3.2, and derived rather than dialled: the eye sits about 15.9 units above
 * the floor and 11.2 below the ceiling, so seeing *both* needs a half-frame of 15.9 — which at
 * this field of view is 41 units back. At 3.2 it stopped just short of the floor and filled
 * the frame with blank wall instead, which is the one framing that makes a real room read as a
 * painted backdrop.
 */
const WIDE_FACTOR = 5.0;

/** Air kept between the cabinet and the frame edge when the camera is tracking along it. */
/** Where the centre view stands, as a fraction of the room's depth from the back wall. */
const CENTRE_STAND = 1.6;
/** How far the picture light stands off the face of the bay it lights. */
const LAMP_STANDOFF = 2.2;

function standingDistance(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  factor: number
): number {
  const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
  const forWidth = width / (2 * BAY_FILL_X * Math.tan(halfFov) * camera.aspect);
  const forHeight = height / (2 * BAY_FILL_Y * Math.tan(halfFov));
  // The wide factor is applied *before* the clamp, not after. Applied after, a bay that
  // already wanted the maximum distance was multiplied past it and the camera stepped clean
  // out through the front wall of the room — which does not look like a bug from inside the
  // code and looks, from outside, like the whole room going flat and dim at once.
  return THREE.MathUtils.clamp(Math.max(forWidth, forHeight) * factor, STAND_MIN, STAND_MAX);
}


const DPR_MIN = 0.7;
const DPR_MAX = 1.5;

/**
 * The room's dimensions, all measured off the bookcases rather than fixed, so it stays a room
 * around the shelf whatever the catalogue does.
 *
 * `ROOM_BACK_Z` sits just behind the units' own back panels (which end near z = -0.235), so the
 * bookcases stand *against* the wall rather than floating in front of one. The front is far
 * enough forward that the floor runs out underneath the camera — a floor that stops before the
 * viewer does is the single most obvious way to look like a set rather than a room.
 */
const ROOM_BACK_Z = -0.3;
/**
 * The room's front wall. It must stay comfortably beyond `STAND_MAX`, or the widest shot puts
 * the camera outside the box the room is built from — and since the walls are `BackSide`, that
 * does not error, it simply renders the room inside out and unlit. 58 against a 44 maximum.
 */
const ROOM_FRONT = 58;
/** How thick the walls read where they meet, and how much floor there is beyond the front
 *  cabinets so the centre stand is inside the room rather than in its front wall. */
const WALL_THICKNESS = 1.2;
const ROOM_FRONT_MARGIN = 26;
/**
 * Air above the run. With the floor 1.4m below it, this puts the ceiling about 2.7m up — an
 * ordinary domestic room. It used to be 3.6 (36cm!) on the reasoning that the ceiling "is in
 * darkness either way"; that stopped being true the moment the room was painted, and a
 * ceiling you can see has to be at a height a person would believe.
 */
const ROOM_HEADROOM = 13;
const SKIRTING_HEIGHT = 0.22;
const SKIRTING_DEPTH = 0.05;
/** The picture rail: how far below the ceiling it sits, and how deep the moulding is. */
const RAIL_DROP = 1.4;
const RAIL_HEIGHT = 0.12;
/**
 * How far the floor sits below the run. The run is **mounted on the wall**, not standing on
 * the floor, so this is a real measurement rather than a clearance: 1.4m puts the shelf at
 * chest height and the eye — which sits a little above the run's own middle — at about 1.6m,
 * where a standing person's eye actually is.
 */
const ROOM_FLOOR_DROP = 0.02;

/**
 * The room's colours. **A painted wall, not a void** — the owner's call on 2026-08-19, and it
 * reverses the near-black this room has had since it was built.
 *
 * It also breaks the palette line in `CLAUDE.md` ("Dark, warm"), which is amended there rather
 * than quietly contradicted here. What survives of the old reasoning is the discipline behind
 * it: the room still has no opinions of its own. It is an off-white with a warm bias, the
 * colour of ordinary emulsion in lamplight, so the artwork is still the only real colour in
 * the scene — the ground simply stopped being black.
 *
 * A pale wall also does something the dark one could not: the cases are dark objects, so they
 * now read as silhouettes against it, and the run's shape is legible from across the room.
 */
const ROOM_WALL = "#d9d2c6";
/** A touch warmer and deeper than the wall, as a floor is — it takes the light at a glancing
 * angle where the wall takes it square on, so an identical colour would read as lighter. */
const ROOM_FLOOR = "#8d7a63";
/** Painted joinery, a shade off the wall: present, never a stripe. */
const ROOM_SKIRTING = "#c9c0b1";
/** The ceiling, lighter than the walls the way a ceiling is nearly always painted. */
const ROOM_CEILING = "#e6e0d6";
/**
 * The air, and what the canvas clears to. A shade below the wall so distance still reads as
 * distance — but a *pale* shade, because in a lit room the far end of anything goes hazy, not
 * black. Used for both, so nothing can ever peek past the room into a differently-coloured
 * void.
 */
const ROOM_HAZE = "#c4bcae";

/**
 * How strongly each form's printing is debossed, and how much of its title treatment is foil.
 *
 * Both are read off the real object rather than tuned to taste. **Foil**: a steelbook's title
 * is genuinely foil-stamped and its whole face is metal, so it takes the most; VHS sleeves of
 * the era were routinely foil-blocked, which is why they still catch a lamp; a DVD Amaray's
 * printed insert under a clear sleeve is the least foiled thing on the shelf. **Deboss**: card
 * takes an impression and holds it, polypropylene barely does, and `none` — a title with no
 * physical release — gets neither, because there is no object to have been stamped.
 */
const ITEM_BUMP: Partial<Record<Form, number>> = { vhs: 0.5, amaray: 0.2, bluray: 0.22, steel: 0.42 };
const FOIL: Partial<Record<Form, number>> = { vhs: 0.5, amaray: 0.15, bluray: 0.3, steel: 0.9, can: 0.25 };

/**
 * The spine face: a plane on the case's left side, which is the side a camera standing to the
 * left of the run actually sees.
 *
 * Rotating -90° about Y maps the plane's local +X onto world +Z and leaves local +Y as world
 * +Y — so the plane's width runs along the case's *depth* and its height along the case's
 * height, which is exactly a spine. That mapping is also why the spine needs no special
 * instance matrix: the body's per-instance `scale.z = ds` (thickness encoding runtime)
 * stretches this plane along its own width, which is the dimension that should grow.
 *
 * The UVs are swapped so the atlas cell — drawn wide and short, with the title running
 * horizontally — lands with the text running *along the spine*, as printing on a real case
 * does. Doing it on the geometry rather than in the shader keeps the atlas module ignorant of
 * three.js, and keeps one shader recipe shared with the covers.
 */
function spineGeometryFor(form: Form): THREE.BufferGeometry {
  const dims = DIMENSIONS[form];
  const geometry = new THREE.PlaneGeometry(dims.d, dims.h);
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(-dims.w / 2 - SPINE_INSET, 0, 0);

  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    // Swap, and flip the long axis, so the title reads top-to-bottom the way spine printing
    // does on a shelf in this part of the world rather than bottom-to-top.
    uv.setXY(i, 1 - v, u);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** One InstancedMesh for the body, one for the cover -- two draw calls per form,
 * regardless of how many titles that form contributes to the room. */
function buildMediumMeshes(
  row: FormRow,
  coverTexture: THREE.Texture,
  spine: { texture: THREE.Texture; uvs: CellUv[] } | null,
  substrate: THREE.Texture | null
) {
  const count = row.bodyMatrices.length;

  const bodyGeometry = bodyGeometryFor(row.form);
  const bm = BODY_MATERIAL[row.form];
  // The shared substrate bump — PLAN.md §1's second finding, and the one it rates as the
  // trick worth stealing: a bump layer belonging to the *material* rather than to the item
  // is what makes many objects feel individually made without many bespoke assets. Until
  // now every case was shininess-only, so a steelbook and a DVD differed by a number and
  // by nothing you could see.
  //
  // **No bump map on the body, deliberately, and it is a performance fix rather than a taste
  // one.** The body's front is covered by its artwork plane, so its own surface survives only
  // on the thin edges — which is exactly why the substrate was moved onto the cover material.
  // Leaving it on the body as well meant paying for it twice: three's bump chunk costs two
  // extra texture fetches and a derivative per fragment, and the bodies cover most of the
  // screen. Measured, on the same headless harness, at the moment the substrate landed: 4.4
  // fps to 2.6. Removing it here costs nothing anybody can see.
  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: bm.color,
    shininess: bm.shininess,
    specular: bm.specular,
  });
  const body = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);
  // The cases are the things that must darken the boards under them and the panel behind
  // them. Receive too: a case standing next to a taller one should sit in its shadow.
  body.castShadow = true;
  body.receiveShadow = true;
  row.bodyMatrices.forEach((m, i) => body.setMatrixAt(i, m));
  body.instanceMatrix.needsUpdate = true;

  const coverGeometry = coverGeometryFor(row.form);
  const cellData = new Float32Array(count * 4);
  row.coverUvs.forEach((uv, i) => cellData.set([uv.u0, uv.v0, uv.du, uv.dv], i * 4));
  coverGeometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(cellData, 4));
  const coverMaterial = createCoverMaterial(coverTexture, COVER_SHININESS[row.form], COVER_SUBSTRATE_FORMS.has(row.form) ? substrate : null, {
    bumpScale: SUBSTRATE_SCALE[row.form],
    itemBump: ITEM_BUMP[row.form],
    foil: FOIL[row.form],
  });
  const cover = new THREE.InstancedMesh(coverGeometry, coverMaterial, count);
  row.coverMatrices.forEach((m, i) => cover.setMatrixAt(i, m));
  cover.instanceMatrix.needsUpdate = true;

  // The spine shares the body's instance matrices exactly — same position, same thickness
  // scale — because it is a face of the same object rather than a thing placed near it.
  let spineMesh: THREE.InstancedMesh | null = null;
  if (spine && SPINE_FORMS.has(row.form)) {
    const spineGeometry = spineGeometryFor(row.form);
    const spineCells = new Float32Array(count * 4);
    spine.uvs.forEach((uv, i) => spineCells.set([uv.u0, uv.v0, uv.du, uv.dv], i * 4));
    spineGeometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(spineCells, 4));
    // Duller than any cover: this is ink printed onto the case, not artwork behind a sleeve.
    const spineMaterial = createSpineMaterial(spine.texture);
    spineMesh = new THREE.InstancedMesh(spineGeometry, spineMaterial, count);
    row.bodyMatrices.forEach((m, i) => spineMesh!.setMatrixAt(i, m));
    spineMesh.instanceMatrix.needsUpdate = true;
  }

  // **The mount.** Face-out, a cover with nothing behind it reads as a sticker on the
  // woodwork — which is exactly what the owner saw. Every comic in the reference sits in a
  // slab with a pale border, and that border is most of why they read as *objects* against
  // dark wood. One extra plane per case, instanced, sharing the cover's own matrices: a hair
  // larger, a hair behind, in bone rather than brass so the artwork stays the brightest thing.
  const mountGeometry = coverGeometryFor(row.form);
  mountGeometry.scale(MOUNT_OVERSIZE, MOUNT_OVERSIZE, 1);
  mountGeometry.translate(0, 0, -MOUNT_SETBACK);
  const mount = new THREE.InstancedMesh(
    mountGeometry,
    new THREE.MeshPhongMaterial({ color: MOUNT_COLOUR, shininess: 6, specular: "#2a2620" }),
    count
  );
  mount.castShadow = true;
  mount.receiveShadow = true;
  row.coverMatrices.forEach((m, i) => mount.setMatrixAt(i, m));
  mount.instanceMatrix.needsUpdate = true;

  return { body, cover, spine: spineMesh, mount };
}

/**
 * Every piece of every bookcase, as two InstancedMeshes -- a unit box scaled per instance,
 * the same trick as the case bodies' thickness.
 *
 * The wear gradient rides on `setColorAt`, which is why twelve differently-aged bookcases
 * still cost two draw calls: an instance colour is a per-instance attribute, not a material.
 * What varies is only how dark and how dry the wood looks, never its style -- a 1980s unit
 * morphing into a 2020s one would be a costume change and would look like one
 * (docs/05-3d-shelf.md §3).
 */
// Lifted well off the near-black it was. Against a pale room a very dark carcass reads as a
// flat silhouette — no grain, no sheen, no material at all — and the reference's wood is a
// clearly-visible mid red-brown, not a shadow. The grain map has to have something to modulate.
const WOOD_FRESH = new THREE.Color("#6b3a24");
const WOOD_WORN = new THREE.Color("#402014");

/**
 * The trim is **brass** now rather than a lighter wood, and it is the cheapest single thing
 * that makes a cabinet read as bespoke instead of flat-packed. It is also already the right
 * geometry: the lip is a separate instanced strip along the front edge of every shelf, so
 * making it metal costs a material and nothing else.
 *
 * Brass ages the way the wood does — a worn bay's trim has dulled and darkened where hands have
 * been, which is the same wear signal the boards carry, told in a different material.
 */
// Actual brass, not a browner wood. The shelf edge is the most-repeated brass element in the
// reference and the cheapest to read from across a room.
/** How much bigger the mount is than the artwork, and how far behind it sits. Small: this is
 *  a slab's border, not a picture mat. */
const MOUNT_OVERSIZE = 1.1;
const MOUNT_SETBACK = 0.004;
/** Bone, not white — a graded-comic slab and a museum mount are both off-white, and true
 *  white against these covers would out-shout every one of them. */
const MOUNT_COLOUR = "#cfc6b4";

/** Warm, and close to white without reaching it — a concealed lamp behind a brass fitting,
 *  not an LED strip. */
const GLOW_COLOUR = "#ffeacb";
/** How far past white the strips are driven, so the tone mapper reads them as a source. */
const GLOW_GAIN = 4.5;

const LIP_FRESH = new THREE.Color("#c9a54e");
const LIP_WORN = new THREE.Color("#7a6030");

/** How many world units one tile of grain covers. Mahogany is coarse enough to read across a
 * whole shelf board; brass brushing is fine and tight, as machined metal is. */
/** The nameplate over each bay: wide, short, and mounted a little above the cabinet's top so
 * it reads as fixed to the woodwork rather than resting on it. */
const PLAQUE_WIDTH = 2.6;
const PLAQUE_HEIGHT = 0.65;
const PLAQUE_RISE = 0.62;
const PLAQUE_Z = 0.26;

/**
 * How much of the wall above a unit belongs to it: its nameplate, plus air. The camera frames
 * the unit *and* this, and sits at the middle of the two — which is what a person looking at
 * a labelled bay actually looks at.
 */
const PLAQUE_HEADROOM = PLAQUE_RISE + PLAQUE_HEIGHT + 0.45;

const MAHOGANY_SCALE = 0.22;
const BRASS_SCALE = 1.4;

/**
 * Wood and metal on the bookcases, mapped in **world space** rather than by the geometry's own
 * UVs — and that is the whole reason this shader exists.
 *
 * Every board, upright and trim strip in the room is the same unit box scaled per instance: a
 * shelf slab is twenty units wide and four hundredths tall, a brass lip is thinner still. Their
 * UVs are therefore stretched by wildly different amounts, so a grain drawn through them would
 * be pin-fine on one piece and smeared to mud on the next — the same texture reading as a
 * different material on every part of the same cabinet.
 *
 * Projecting from world position fixes it: the grain has one physical size everywhere, exactly
 * as it would if the whole room had been cut from one tree. The projection picks its plane from
 * the dominant axis of the world normal, which for axis-aligned boxes is exact — a scaled box's
 * normals stay on their axes, so `abs()` still names the right face.
 *
 * Colour, not just relief. Real mahogany is dark *lines* in lighter wood, and a bump-only grain
 * on a flat brown reads as textured plastic. The sampled value drives a multiply around 1.0, so
 * the per-instance wear colour that `tintByWear` writes survives underneath it: the cabinet is
 * still aged by what stands on it, and now it is also made of something.
 */
function createGalleryMaterial(
  map: THREE.Texture,
  options: { colour: string; shininess: number; specular: string; scale: number; mix: number }
): THREE.MeshPhongMaterial {
  const material = new THREE.MeshPhongMaterial({
    color: options.colour,
    shininess: options.shininess,
    specular: new THREE.Color(options.specular),
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrain = { value: map };
    shader.uniforms.uGrainScale = { value: options.scale };
    shader.uniforms.uGrainMix = { value: options.mix };

    shader.vertexShader =
      "varying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\n" +
      shader.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
	#ifdef USE_INSTANCING
		vWorldNormal = mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal;
	#else
		vWorldNormal = mat3( modelMatrix ) * objectNormal;
	#endif`
        )
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
	#ifdef USE_INSTANCING
		vWorldPos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
	#else
		vWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	#endif`
        );

    shader.fragmentShader =
      "varying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\nuniform sampler2D uGrain;\nuniform float uGrainScale;\nuniform float uGrainMix;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
	vec3 gn = abs( normalize( vWorldNormal ) );
	vec2 grainUv = ( gn.y > gn.x && gn.y > gn.z )
		? vWorldPos.xz
		: ( gn.x > gn.z ? vWorldPos.zy : vWorldPos.xy );
	float grain = texture2D( uGrain, grainUv * uGrainScale ).r;
	diffuseColor.rgb *= mix( 1.0 - uGrainMix, 1.0 + uGrainMix, grain );`
      )
      // `specularStrength` is declared by the specular chunk, which three includes *after*
      // <color_fragment> — so this has to be a second, later injection rather than one block.
      // `grain` is still in scope: both land inside main().
      .replace(
        "#include <specularmap_fragment>",
        `#include <specularmap_fragment>
	specularStrength *= mix( 0.75, 1.35, grain );`
      );
  };
  return material;
}

function tintByWear(mesh: THREE.InstancedMesh, wear: number[], fresh: THREE.Color, worn: THREE.Color) {
  const colour = new THREE.Color();
  wear.forEach((amount, i) => mesh.setColorAt(i, colour.lerpColors(fresh, worn, amount)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function buildBoardMeshes(
  slabMatrices: THREE.Matrix4[],
  lipMatrices: THREE.Matrix4[],
  glowMatrices: THREE.Matrix4[],
  slabWear: number[],
  lipWear: number[],
  mahogany: THREE.Texture,
  brass: THREE.Texture
) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  // White base colour on purpose: the per-instance wear colour *is* the wood colour, and a
  // tinted material would multiply against it a second time.
  const slabMaterial = createGalleryMaterial(mahogany, {
    colour: "#ffffff",
    shininess: 26,
    specular: "#4a3a28",
    scale: MAHOGANY_SCALE,
    mix: GALLERY_COLOUR_MIX.mahogany,
  });
  const slab = new THREE.InstancedMesh(unitBox, slabMaterial, slabMatrices.length);
  // The joinery both casts and receives: the run has to throw a shadow onto the wall behind
  // it -- which is the whole of not looking stuck on -- and take the cases' shadows itself.
  slab.castShadow = true;
  slab.receiveShadow = true;
  slabMatrices.forEach((m, i) => slab.setMatrixAt(i, m));
  slab.instanceMatrix.needsUpdate = true;
  tintByWear(slab, slabWear, WOOD_FRESH, WOOD_WORN);

  // A worn unit's lip has lost its sheen as well as its colour: the front edge is the one
  // surface a hand actually touches.
  const lipMaterial = createGalleryMaterial(brass, {
    colour: "#ffffff",
    // The highlight, not the paint, is what makes brass read as metal — but a flat strip facing
    // the lamp lights along its whole length, so a bright specular turns the trim into a gold
    // bar rather than an edge. Dark warm specular, still tight.
    shininess: 96,
    specular: "#7d6134",
    scale: BRASS_SCALE,
    mix: GALLERY_COLOUR_MIX.brass,
  });
  const lip = new THREE.InstancedMesh(unitBox, lipMaterial, lipMatrices.length);
  lip.castShadow = true;
  lip.receiveShadow = true;
  lipMatrices.forEach((m, i) => lip.setMatrixAt(i, m));
  lip.instanceMatrix.needsUpdate = true;
  tintByWear(lip, lipWear, LIP_FRESH, LIP_WORN);

  // The concealed strips. `MeshBasicMaterial` because they are the *source*: a lit material
  // would have them shaded by the room, which is exactly backwards for something that is
  // supposed to be the brightest thing in the bay.
  // Pushed past 1.0 on purpose. A basic material at #ffeacb tone-maps to about the same value
  // as the plaster behind it, so the strip reads as a pale moulding rather than as a lamp —
  // it was drawn correctly and looked like nothing. Multiplying into HDR lets ACES roll it off
  // to a hot near-white that is unmistakably the brightest thing in the bay.
  const glowMaterial = new THREE.MeshBasicMaterial({ color: GLOW_COLOUR });
  glowMaterial.color.multiplyScalar(GLOW_GAIN);
  const glow = new THREE.InstancedMesh(unitBox, glowMaterial, glowMatrices.length);
  glowMatrices.forEach((m, i) => glow.setMatrixAt(i, m));
  glow.instanceMatrix.needsUpdate = true;

  return { slab, lip, glow };
}

type Layout = ReturnType<typeof buildShelfLayout>;

function BlankCover({
  position,
  tint,
  size,
  meshRef,
}: {
  position: readonly [number, number, number];
  tint: string;
  size: { w: number; h: number };
  /** So the pull can carry this plane along with its case — see ShelfContent's frame loop. */
  meshRef: (mesh: THREE.Mesh | null) => void;
}) {
  // = CaseScene.tsx's spine colour, exactly: setHSL, never Color.setStyle() (see tint.ts --
  // three's string parser silently returns white for this project's space-separated hsl()).
  const color = useMemo(() => {
    const { h, s, l } = tintToHsl(tint);
    return new THREE.Color().setHSL(h, s, l);
  }, [tint]);

  return (
    // Turned with its case. Unrotated, a 135mm plane parked inside a 12mm spine would stick
    // out of both sides of it — a bright tinted fin sticking through the shelf, for the three
    // titles that have no artwork.
    <mesh ref={meshRef} position={position} rotation={[0, SPINE_YAW, 0]}>
      <planeGeometry args={[size.w, size.h]} />
      <meshPhongMaterial color={color} shininess={4} specular="#1a1714" />
    </mesh>
  );
}

/**
 * How a case presents itself to a locked-off camera.
 *
 * `PRESENT_YAW` is small and deliberate: square-on would read as a flat poster and lose the
 * thing 3D is for, which is that this is an *object* with a thickness that encodes its runtime.
 * A few degrees is enough to see the spine and the depth without it looking askew.
 */
const PRESENT_YAW = -0.19;

/**
 * Where the case comes to: centred in the bay, at eye level, an arm's length in front of the
 * viewer. `HOLD_GAP` is measured back from where the camera stands, so it is the one number
 * that sets how large the held case draws.
 *
 * Widened from 2.8 after photographing the scene for the first time (`e2e/shelf-frames.spec.ts`).
 * At 2.8 the case was 27% of the frame's width, ran off the bottom edge so its own cover could
 * not be read end to end, and completely hid the bay it had just come out of — including the
 * brass nameplate saying which section you are standing in. Every one of those is a defect the
 * arithmetic could not show me and a screenshot showed immediately.
 */
const HOLD_GAP = 3.9;

/**
 * How much closer a case comes once it is turned over. You do not read the back of something
 * at arm's length — you bring it in, which is the whole reason a person turns an object at
 * all. It is also the only fix that reaches the real defect: the back cover is a 1024px canvas
 * mapped onto a plane roughly 250px wide on screen, so the curated note — the thing `PLAN.md`
 * §6 calls the most valuable and least regenerable part of v1 — was landing at about seven
 * pixels. Type size fights that one element at a time; distance fixes the whole hierarchy at
 * once, and is what actually happens in the hand.
 *
 * The side effect is that a turned case covers its bay. That is correct here and was not
 * correct for the presented state: browsing wants to know where it is standing, reading does
 * not.
 */
const TURN_APPROACH = 1.5;

/**
 * How far below eye level a case is held. You do not hold an object you are inspecting dead in
 * front of your pupils, and the composition agrees: at eye level the case sat exactly over the
 * bay's brass nameplate, hiding the one element that says which section you are standing in.
 * Perspective is why — the plaque is twelve units away and the case under three, so the near
 * object covers a far larger angle than their world positions suggest.
 */
const HOLD_DROP = 0.3;

/**
 * How near a case must be for its per-item debossing to be computed at all — a level of detail
 * rule, and the first one this scene has actually needed.
 *
 * The deboss costs two extra atlas taps per fragment and is derived from the artwork's own
 * luminance gradient, so it is a *fine* relief: visible on a case held at arm's length and
 * physically unresolvable on one sitting across the room at thumbnail size. The locked-off
 * gallery framing put a whole bay of fifty-odd covers on screen at once, all of them paying for
 * an effect none of them was large enough to show.
 *
 * A case in the hand is ~2.8 units away and one on the shelf ~12.6, so the two populations are
 * nowhere near each other and the threshold needs no fine tuning. The branch is on a uniform
 * and a varying, which is coherent across each case, so the GPU is not paying for divergence.
 */
const DETAIL_RANGE = 6;

/**
 * The presentation light: the one that falls on a case once it is in your hands.
 *
 * Needed because the hold point is *in front of* the shelf lamp, so a case travelling towards
 * the viewer walks out of the light and arrives as a black slab — lit from behind by the very
 * lamp that lights the shelf. This one sits between the viewer and the object, a little above,
 * like the spot over a vitrine, and its intensity rides the pull so it never washes the shelf
 * when nothing is being held.
 *
 * **It stands well back, and that is the whole trick.** The first attempt put it 1.7 units from
 * a case 1.9 units tall, so the inverse-square falloff varied enormously across the face and
 * burned a white hole through the middle of the artwork. Sitting roughly where the viewer is,
 * the distance to the top of the case and to the bottom is nearly the same, and the face lights
 * evenly. Near lights make hotspots; far lights make illumination.
 */
const HOLD_LIGHT_FORWARD = 3.2;
const HOLD_LIGHT_UP = 1.5;
const HOLD_LIGHT_INTENSITY = 18;
const HOLD_LIGHT_REACH = 13;

/** The rest of the way round, so the back faces the room. Same sign as PRESENT_YAW — the turn
 * continues the rotation the presentation started rather than undoing it. */
const TURN_YAW = -Math.PI;
const TURN_SPEED = 3.4;
/** Below this the back is edge-on or facing away, so there is nothing to draw. */
const TURN_VISIBLE = 0.02;

/** Head-height over the run and standing off its face, like a picture light on a wall unit.
 * The reach is short because the falloff is the whole effect: the neighbouring universes
 * are there, in the dark, and you travel to them rather than seeing them all at once. */
/**
 * How far above a bay's own top board the picture light hangs. It used to be a fixed height
 * in the room, which worked while every unit was four levels tall and they all topped out at
 * the same place. Spine-out the units are sized to their contents — the MCU is two levels and
 * everything else is one — and a fixed lamp ended up *below* the top of the tall bay and
 * about a quarter of a unit from its brass nameplate, which blew the plate to flat white. The
 * same collision as the case-held-inside-the-lamp bug below, from the same cause: two
 * positions chosen in different weeks, one of which later moved.
 */
const LAMP_ABOVE = 2.2;
/** The cone. Wide enough to wash a whole section, narrow enough that its edge falls off within
 *  the frame rather than lighting the room evenly and casting nothing. */
const LAMP_ANGLE = 1.0;

/**
 * Where the room's general light comes from: high, in front, and off to one side — the
 * direction a window is, which is the only lighting a viewer will read as "a room" without
 * being shown the window itself. Off-axis on purpose: a light square to the wall flattens the
 * shelf's brackets and its shadow into nothing.
 */
const ROOM_LIGHT_X = -26;
const ROOM_LIGHT_Y = 30;
const ROOM_LIGHT_Z = 26;
const LAMP_HEIGHT = -1.2;
/**
 * The shelf lamp sits close to the shelf face, and that matters more than it looks.
 *
 * It used to stand at z = 4.0, which — once cases started travelling forward to be presented —
 * was almost exactly where they came to rest. A case was being held *inside the lamp*, one unit
 * from a 95-intensity point light, and arrived blown to white with the title unreadable. It
 * looked like a tone-mapping or an exposure problem and was neither: it was two positions
 * chosen in different weeks that happened to collide.
 */
const LAMP_Z = 2.2;
/**
 * Was 95, and 130 before that. Both were fitted to a room roughly three times this size: a
 * cover-out bay was metres wide, and the lamp had to throw that far to light one. Spine-out,
 * the whole catalogue is 1.6m of shelf and the bays are 160-220mm across, so the same lamp now
 * sits almost on top of everything — it blew every brass nameplate to flat white, the plate
 * being the one thing mounted directly under it.
 *
 * The old warning still holds and is why this went down rather than the ambient going up on
 * its own: a lamp bright enough to reach the floor is a lamp bright enough to destroy the case
 * standing next to it. What changed is the distance, so the intensity had to follow it.
 */
const LAMP_INTENSITY = 62;
/**
 * Raised from 15 once there was actually a room to light. With no floor and no walls the reach
 * only had to cover the cases; now it has to *land* on something — a lamp whose pool dies
 * before it reaches the floor leaves the shelf standing in a void, which was the whole
 * complaint about there being no room. Measured against the real geometry: the floor sits 5.4
 * units below the lamp and the ceiling 5.2 above it.
 */
const LAMP_REACH = 30;


/**
 * What to call each object. Release order's five are the media as the design system names
 * them; story order's four are what the story would have been carried on. Deliberately not
 * derived from `catalogue.ts`'s shelf labels: those name an *era of release*, and in story
 * order this is naming an object instead.
 */
const FORM_NAMES: Record<Form, string> = {
  vhs: "VHS clamshell",
  amaray: "DVD Amaray",
  bluray: "Blu-ray case",
  steel: "Steelbook",
  none: "No physical release",
  tablet: "Clay tablet",
  volume: "Bound volume",
  can: "35mm film can",
  reel: "Super 8 reel",
};

/**
 * The year to print beside an object. In story order that has to be the *story* year, not the
 * release year: the story year is what chose the object, and printing 2011 next to a 35mm
 * film can invites exactly the wrong reading. A title with no place on a timeline says so.
 */
function storyYearLabel(year: number | null): string {
  if (year === null) return "Outside time";
  return year < 0 ? `${Math.abs(year)} BC` : String(year);
}

/** How far a pointer may travel between down and up and still count as a tap. */
const TAP_SLOP = 8;

/** The camera's vertical field of view, how much shelf should fit across the frame at
 * minimum — about four cases, which is what keeps a phone usable — and the air left above
 * and below a unit so it does not touch the edges. */
/**
 * A wide lens, because this is now interior photography rather than a shot of one shelf.
 *
 * 42 degrees is about a 50mm lens, and from the middle of the room it puts *both side walls
 * outside the frustum entirely* — the geometry is fine, you simply cannot see it. Seeing a
 * side wall 2.1m away over its whole depth needs the camera about 6m back at 42 degrees, which
 * is outside the building. Interiors are shot at roughly 24mm for exactly this reason.
 */
const FOV = 54;

/** A plane's own half-turn, so the back cover faces out of the back of the case instead of
 * into it. Constant, so it is built once rather than per frame. */
const FLIP_Y = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));

/**
 * How far into the pull a printed face takes to come proud of the case. Small: it only has to
 * outlast the moment the case is still between its neighbours, and every frame after that is a
 * frame the artwork should be visible for.
 */
const COVER_EMERGE = 0.05;

const scratch = {
  matrix: new THREE.Matrix4(),
  quaternion: new THREE.Quaternion(),
  euler: new THREE.Euler(),
  position: new THREE.Vector3(),
  scale: new THREE.Vector3(),
  offset: new THREE.Vector3(),
};

/**
 * Where one case sits when it is pulled `amount` (0 = on the shelf, 1 = fully out) and turned
 * `turn` (0 = front to the room, 1 = back to the room).
 *
 * The turn *continues* the yaw the pull already started rather than starting a new rotation:
 * PULL_YAW is negative, so a further -PI carries the case round the same way your wrist would.
 * Turning back the other way looks like the case undoing itself, which is the one thing a
 * physical object never does.
 *
 * `faceZ` is how far in front of the case's own centre this plane sits — +coverZ for the
 * printed front, -coverZ for the back. It is rotated with the case, so the plane stays stuck
 * to whichever face it belongs to instead of swinging through the body.
 */
function poseCase(
  item: ShelfItem,
  amount: number,
  faceZ: number,
  turn: number,
  scaleZ: number,
  hold: { x: number; y: number; z: number }
): THREE.Matrix4 {
  const { matrix, quaternion, euler, position, scale, offset } = scratch;
  // On the shelf the case is spine-out; drawn fully out it is face-on. So the pull *is* the
  // turn — the motion the owner asked to keep now also does the work of showing you the
  // cover, instead of a separate flourish bolted onto it. At amount = 0 this equals the
  // SPINE_YAW the layout baked into the resting matrices, which is what stops the case
  // jumping the first time it is touched.
  // Each case carries its own resting yaw now, because the room has three walls and a case on
  // the left wall is turned ninety degrees from one on the back. Drawn out, it turns to face
  // whoever is standing at *its* wall — `wallYaw + PRESENT_YAW` — rather than to a fixed
  // direction that would have been right on exactly one of the three.
  const yaw = item.yaw + (item.wallYaw + PRESENT_YAW - item.yaw) * amount + TURN_YAW * turn;
  quaternion.setFromEuler(euler.set(0, yaw, 0));
  // The printed faces sit flush inside the case until it is drawn out. Spine-out, a cover
  // proud of its own face would poke through the neighbour 2mm away; scaling the offset by
  // the pull parks it inside an opaque box exactly when that would happen, and it is hidden
  // there rather than fighting for the depth test.
  // The printed faces sit flush inside the case *only while it is on the shelf*, where a cover
  // proud of its own face would poke through the neighbour 2mm away and z-fight with it.
  //
  // This used to scale by `amount` directly, which is the bug the owner reported as artwork
  // that "only loads when the box is fully in front of you": at half-drawn the cover was still
  // at half its offset, i.e. still buried inside an opaque box, so the poster appeared to snap
  // into existence at the end of the travel. Nothing was loading late — it was inside the case
  // the whole way out. The ramp is over the first few percent of the pull instead, so the
  // cover is proud as soon as the case has cleared its neighbours and is visible for the whole
  // of the animation.
  // Face-out cases keep their cover proud throughout — it is what is on display. Only a
  // spine-out case has to hide it while shelved, and only because of its neighbours.
  const emerge = item.spineOut ? Math.min(1, amount / COVER_EMERGE) : 1;
  offset.set(0, 0, faceZ * emerge).applyQuaternion(quaternion);
  // The case travels from its slot to the presentation point in front of the eye, rather than
  // simply nosing forward out of the shelf. With a locked-off camera this is the whole
  // interaction: the viewer does not go to the object, the object comes to the viewer.
  position.set(
    THREE.MathUtils.lerp(item.x, hold.x, amount) + offset.x,
    THREE.MathUtils.lerp(item.y, hold.y, amount) + offset.y,
    THREE.MathUtils.lerp(item.z, hold.z, amount) + offset.z
  );
  return matrix.compose(position, quaternion, scale.set(1, 1, scaleZ));
}

/** The body: no face offset, and Z-scaled to carry its runtime. */
const poseBody = (item: ShelfItem, amount: number, turn: number, hold: Hold) =>
  poseCase(item, amount, 0, turn, item.ds, hold);
/** The printed front. */
const poseCover = (item: ShelfItem, amount: number, turn: number, hold: Hold) =>
  poseCase(item, amount, item.coverZ, turn, 1, hold);

type Hold = { x: number; y: number; z: number };

function ShelfContent({
  layout,
  onPick,
  universe,
  progress,
  instant,
  onActive,
  turnedItem,
  storyOrder,
  spineTitles,
  wide,
  centred,
}: {
  /** Standing back to see the whole unit, rather than close in on one case. */
  wide: boolean;
  /** Standing in the middle of the room with all three walls in shot, rather than up at a
   *  bay. This is what you arrive to, and what Escape returns you to. */
  centred: boolean;
  layout: Layout;
  /** Every title in the catalogue, for the spine atlas. Stable across ordering and universe. */
  spineTitles: SpineTitle[];
  onPick: (slug: string) => void;
  universe: UniverseShelf;
  /** The case being read back-first, or null when everything is facing the room. One prop
   * rather than a boolean plus the item: they can only ever be true together, and two props
   * that must agree is a state you can get wrong. */
  turnedItem: ShelfItem | null;
  /** Which ordering is on, so the back prints the same year the caption does. */
  storyOrder: boolean;
  /** With reduced motion set, the camera arrives instead of gliding. */
  instant: boolean;
  /** Called when the walk reaches a different title, so the DOM can name it. Once per title,
   * not once per frame: the pull runs at 60fps and React has no business seeing that. */
  onActive: (item: ShelfItem) => void;
  /** Live scroll position, in titles, within this universe. A ref rather than state: it
   * changes on every wheel event and nothing in React needs to re-render for it. */
  progress: React.RefObject<number>;
}) {
  const texture = useTexture(ATLAS_PATH, (t) => {
    const map = Array.isArray(t) ? t[0] : t;
    // Without this the atlas renders washed out -- three decodes to linear otherwise.
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
  });

  /**
   * The spine labels, as one alpha-tested atlas over every case.
   *
   * Built once from the whole catalogue rather than per universe or per ordering: the label
   * printed on a case is the same string whichever shelf it stands on and whichever order it
   * stands in, so rebuilding it on every reshuffle would redraw 152 strings to get the same
   * texture back. `spineTitles` is the stable list; the per-instance windows into it are what
   * change, and those are cheap.
   */
  /**
   * One substrate bump texture per form, built once for the whole room.
   *
   * Keyed off the forms actually present rather than every form there is: story order draws
   * clay tablets and film cans and release order never does, so building all nine would spend
   * time on surfaces nobody is looking at.
   *
   * `RepeatWrapping` with a repeat count is what turns a 256px tile into grain at a physical
   * size — the tile is seamless, so the count is free to set by eye. Grain that scales with
   * the case would make a VHS clamshell's card coarser than a Blu-ray's simply for being
   * bigger, which is backwards: card grain is a property of the card.
   */
  const substrates = useMemo(() => {
    const byForm = new Map<Form, THREE.Texture>();
    for (const row of layout.media) {
      if (byForm.has(row.form)) continue;
      const created = new THREE.CanvasTexture(buildSubstrate(row.form));
      created.wrapS = THREE.RepeatWrapping;
      created.wrapT = THREE.RepeatWrapping;
      created.repeat.set(SUBSTRATE_REPEAT, SUBSTRATE_REPEAT);
      created.anisotropy = 4;
      byForm.set(row.form, created);
    }
    return byForm;
  }, [layout]);
  useEffect(() => {
    const built = [...substrates.values()];
    return () => built.forEach((t) => t.dispose());
  }, [substrates]);

  const spineAtlas = useMemo(() => buildSpineAtlas(spineTitles), [spineTitles]);
  const spineTexture = useMemo(() => {
    const created = new THREE.CanvasTexture(spineAtlas.canvas);
    created.colorSpace = THREE.SRGBColorSpace;
    created.anisotropy = 8;
    return created;
  }, [spineAtlas]);
  useEffect(() => () => spineTexture.dispose(), [spineTexture]);

  const mediumMeshes = useMemo(
    () =>
      layout.media.map((row) => {
        // A cell drawn at the spine's own aspect needs no crop — unlike the covers, whose
        // artwork is a different shape from the face it is printed on. So this is a straight
        // pixels-to-UV conversion, with the flip that three's default flipY upload implies.
        const uvs = row.slugs.map((slug) => {
          const cell = spineAtlas.cells[slug];
          if (!cell) return { u0: 0, v0: 0, du: 0, dv: 0 };
          return {
            u0: cell.x / spineAtlas.width,
            du: cell.w / spineAtlas.width,
            v0: 1 - (cell.y + cell.h) / spineAtlas.height,
            dv: cell.h / spineAtlas.height,
          };
        });
        return {
          form: row.form,
          slugs: row.slugs,
          ...buildMediumMeshes(row, texture, { texture: spineTexture, uvs }, substrates.get(row.form) ?? null),
        };
      }),
    [layout, texture, spineAtlas, spineTexture, substrates]
  );
  const meshByForm = useMemo(() => new Map(mediumMeshes.map((m) => [m.form, m])), [mediumMeshes]);
  /**
   * The cabinetry's two materials, built once for the whole room. They are world-projected, so
   * one tile serves every board, upright and trim strip regardless of how each is scaled — see
   * createGalleryMaterial.
   */
  const cabinetry = useMemo(() => {
    const make = (surface: "mahogany" | "brass") => {
      const created = new THREE.CanvasTexture(buildGallerySurface(surface));
      created.wrapS = THREE.RepeatWrapping;
      created.wrapT = THREE.RepeatWrapping;
      created.anisotropy = 8;
      return created;
    };
    return { mahogany: make("mahogany"), brass: make("brass") };
  }, []);
  useEffect(() => {
    const built = [cabinetry.mahogany, cabinetry.brass];
    return () => built.forEach((t) => t.dispose());
  }, [cabinetry]);

  const plaques = useMemo(() => buildPlaqueAtlas(layout.universes.map((u) => ({ key: u.key, label: u.label }))), [layout]);
  const plaqueTexture = useMemo(() => {
    const created = new THREE.CanvasTexture(plaques.canvas);
    created.colorSpace = THREE.SRGBColorSpace;
    created.anisotropy = 8;
    return created;
  }, [plaques]);
  useEffect(() => () => plaqueTexture.dispose(), [plaqueTexture]);

  const boards = useMemo(
    () =>
      buildBoardMeshes(
        layout.boardSlabMatrices,
        layout.boardLipMatrices,
        layout.boardGlowMatrices,
        layout.boardSlabWear,
        layout.boardLipWear,
        cabinetry.mahogany,
        cabinetry.brass
      ),
    [layout, cabinetry]
  );

  // The three titles with no artwork carry their own plane (see ShelfLayout.blankCovers); it
  // has to travel with the case, or a pulled case leaves its blank front behind on the shelf.
  const blankRefs = useRef(new Map<string, THREE.Mesh>());

  // Where the pointer went down, so a drag that ends over a case is not read as a click on
  // it. On touch the gesture that walks the shelf ends with a finger up over a case, and
  // without this guard every swipe opens a title page.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  const lamp = useRef<THREE.SpotLight>(null);
  const holdLight = useRef<THREE.PointLight>(null);
  const posed = useRef<ShelfItem | null>(null);
  const backRef = useRef<THREE.Mesh>(null);

  /**
   * The owner's curated note for the back of the case, fetched rather than imported.
   *
   * The 152 notes are the best writing in this project and the back of a case is where a
   * synopsis belongs — but importing them here would put all 152 in this route's bundle, which
   * is the trap `docs/06-progress.md` records as "Prop or import, it still ships". So they come
   * from `/shelf/notes`, a statically prerendered route, fetched **once** the first time anyone
   * turns a case and memoised from then on. Nobody who only browses the shelf ever pays for it.
   *
   * `loadNotes` resolves to an empty map rather than rejecting if the fetch fails: a back
   * without its blurb is a small loss, and a throw inside a WebGL frame loop takes down the
   * whole scene — which has happened on this project before, from a module in the masthead.
   */
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!turnedItem) return;
    let live = true;
    loadNotes().then((loaded) => {
      if (live) setNotes(loaded);
    });
    return () => {
      live = false;
    };
  }, [turnedItem]);
  /** Live turn, 0..1. A ref for the same reason `progress` is one: it changes every frame
   * while the case swings round, and nothing in React renders differently for it. */
  const turn = useRef(0);

  /**
   * The back of the case that is out, drawn to a canvas on demand.
   *
   * One title at a time, not an atlas of 152: only one case is ever turned, the card is pure
   * text over a flat ground, and it costs a few milliseconds to draw. Keyed on the slug so
   * walking the shelf with a case turned re-prints it for whatever you are now holding.
   *
   * ponytail: facts only, no synopsis. The 152 curated notes stay out of this route's bundle
   * (see the caption below, and "Prop or import, it still ships" in docs/06-progress.md) —
   * the prose is one click away on the title page, which is itself the back of the case. If
   * the back ever wants the note, lazily fetch that one title's rather than importing all of
   * them.
   */
  const backTexture = useMemo(() => {
    if (!turnedItem) return null;
    const canvas = renderBackCover({
      note: notes[turnedItem.slug],
      label: turnedItem.label,
      formName: FORM_NAMES[turnedItem.form],
      yearLabel: storyOrder ? storyYearLabel(turnedItem.storyYear) : String(turnedItem.releaseYear),
      runtimeMin: turnedItem.runtimeMin,
      universeLabel: universe.label,
      tint: turnedItem.tint,
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }, [turnedItem, storyOrder, universe.label, notes]);

  // A CanvasTexture holds a GPU upload; React will not free it for us when the memo
  // recomputes, and walking a long shelf with a case turned would leak one per title.
  useEffect(() => () => backTexture?.dispose(), [backTexture]);

  /**
   * How far back to stand at this unit. Two constraints, and the further wins:
   *
   * - its **height** must fit the vertical fov, which is what makes a four-level MCU unit
   *   different from Spider-Verse's two films on one shelf;
   * - a minimum **width** must fit across, which matters on a portrait phone, where fov is
   *   vertical and the frame is narrow. (Scaling the distance by the aspect ratio was the
   *   first attempt and put a phone three and a half times too far back.)
   */

  /**
   * The interaction, in one frame loop.
   *
   * Scrolling walks the shelf a title at a time: `sin(pi * fraction)` takes the case out of
   * the shelf and puts it back within one step, so keeping the wheel moving returns it and
   * brings out the next — which is the behaviour asked for, not a carousel that holds a
   * selection. The camera follows the case being pulled, so it is always the one in the
   * middle of the screen, and the lamp follows the camera.
   */
  useFrame((state, dt) => {
    const items = universe.items;
    if (!items.length) return;

    const walk = Math.min(Math.max(progress.current, 0), items.length - 0.001);
    const index = Math.floor(walk);
    const item = items[index];

    // Where the viewer stands, and where a drawn-out case comes to rest in front of them.
    // Computed here, at the top, because the poses below need it — it used to sit down in the
    // camera section and was read before it was initialised, which is a crash rather than a
    // subtle fault only because `const` is honest about it.
    // **Where you stand, in a room with three walls.**
    //
    // A bay knows its own wall's outward direction, so standing to look at it is the same
    // arithmetic on every wall: back off along that normal from the middle of the bay's face,
    // and look back at it. The back wall is the identity case and the two sides are the same
    // code read at ninety degrees — which is the whole reason the layout hands over a yaw
    // rather than an x-coordinate.
    const eyeY = universe.centreY + PLAQUE_HEADROOM / 2;
    const standZ = standingDistance(
      state.camera as THREE.PerspectiveCamera,
      universe.width,
      universe.height + PLAQUE_HEADROOM,
      wide ? WIDE_FACTOR : 1
    );
    const out = wallOutward(universe.yaw);

    // Arriving, and whenever you step back out: the middle of the room, facing the back wall,
    // with all three walls in shot. This is the view the reference image is taken from.
    const centreZ = layout.room.depth * CENTRE_STAND;
    const target = centred
      ? { x: 0, y: eyeY, z: 0 }
      : { x: universe.face.x, y: eyeY, z: universe.face.z };
    const stand = centred
      ? { x: 0, y: eyeY, z: centreZ }
      : { x: universe.face.x + out.x * standZ, y: eyeY, z: universe.face.z + out.z * standZ };

    // Ease the turn towards whatever the DOM button last asked for. Reduced motion arrives
    // rather than travels, exactly as the camera does. Computed before the hold point rather
    // than after, because the hold point now depends on it.
    turn.current += ((turnedItem ? 1 : 0) - turn.current) * (instant ? 1 : Math.min(1, dt * TURN_SPEED));
    if (turn.current < 0.001) turn.current = 0;

    // Derived from where the viewer is standing rather than from the shelf, so it is always
    // the same arm's length from the eye whichever bay you are at and whichever shelf the
    // title sits on — and closer by TURN_APPROACH once turned, so the back can be read.
    // In front of the camera along its own view direction, rather than at a fixed z. With one
    // wall those were the same number; with three, a fixed z holds the case somewhere off to
    // the side of anyone standing at a side wall.
    const forwardX = target.x - stand.x;
    const forwardZ = target.z - stand.z;
    const forwardLen = Math.hypot(forwardX, forwardZ) || 1;
    const reach = HOLD_GAP - TURN_APPROACH * turn.current;
    const hold: Hold = {
      x: stand.x + (forwardX / forwardLen) * reach,
      y: eyeY - HOLD_DROP,
      z: stand.z + (forwardZ / forwardLen) * reach,
    };

    // A turned case is held fully out. Without the max() the walk's own sine would keep
    // running underneath and the case you are reading would sink back into the shelf while
    // still facing you — the scroll listener freezes the walk, but the pull is a function of
    // where the walk stopped, which can be mid-step.
    const amount = Math.max(Math.sin(Math.PI * (walk - index)), turn.current);

    // Put the previous case back before posing a new one, or a fast scroll leaves cases
    // hanging out of the shelf behind it.
    if (posed.current && posed.current !== item) {
      const previous = posed.current;
      const mesh = meshByForm.get(previous.form);
      if (mesh) {
        mesh.body.setMatrixAt(previous.instance, poseBody(previous, 0, 0, hold));
        mesh.cover.setMatrixAt(previous.instance, poseCover(previous, 0, 0, hold));
        mesh.body.instanceMatrix.needsUpdate = true;
        mesh.cover.instanceMatrix.needsUpdate = true;
        if (mesh.spine) {
          mesh.spine.setMatrixAt(previous.instance, poseBody(previous, 0, 0, hold));
          mesh.spine.instanceMatrix.needsUpdate = true;
        }
      }
      // Put it back the same way it is posed, rather than by re-deriving where "back" is:
      // the case has a resting *rotation* now, not just a resting position, and setting only
      // the position would leave a blank cover facing the room on a shelf of spines.
      const blankBack = blankRefs.current.get(previous.slug);
      if (blankBack) {
        const m = poseCover(previous, 0, 0, hold);
        blankBack.position.setFromMatrixPosition(m);
        blankBack.quaternion.setFromRotationMatrix(m);
      }
    }

    const mesh = meshByForm.get(item.form);
    if (mesh) {
      mesh.body.setMatrixAt(item.instance, poseBody(item, amount, turn.current, hold));
      mesh.cover.setMatrixAt(item.instance, poseCover(item, amount, turn.current, hold));
      mesh.body.instanceMatrix.needsUpdate = true;
      mesh.cover.instanceMatrix.needsUpdate = true;
      // The spine is a face of the body, so it takes the body's pose exactly — including the
      // turn, which is what lets you read the spine of a case as it comes round.
      if (mesh.spine) {
        mesh.spine.setMatrixAt(item.instance, poseBody(item, amount, turn.current, hold));
        mesh.spine.instanceMatrix.needsUpdate = true;
      }
    }
    const blank = blankRefs.current.get(item.slug);
    if (blank) {
      const m = poseCover(item, amount, turn.current, hold);
      blank.position.setFromMatrixPosition(m);
      blank.quaternion.setFromRotationMatrix(m);
    }

    // The back is one plane, mounted only while a case is actually turned, stuck to the far
    // face. It carries an extra PI of yaw of its own so it looks outwards rather than into
    // the case it is glued to.
    const back = backRef.current;
    if (back) {
      back.visible = turn.current > TURN_VISIBLE;
      if (back.visible) {
        const m = poseCase(item, amount, -item.coverZ, turn.current, 1, hold);
        back.position.setFromMatrixPosition(m);
        back.quaternion.setFromRotationMatrix(m).multiply(FLIP_Y);
      }
    }
    if (posed.current !== item) onActive(item);
    posed.current = item;

    // Follow. Camera and orbit target move by the same delta, which keeps the viewer's angle
    // and zoom — moving the target alone swings the camera round the shelf.
    // Read off the frame state rather than captured from render: these are the objects
    // three.js expects to be mutated, and a value obtained during render must not be.
    const camera = state.camera;
    /**
     * The camera is **locked off**. It does not orbit, it does not pan, and it never rotates:
     * it stands at eye level in front of one bay of the gallery, square on, like a person who
     * has stopped walking. Everything that used to move the viewer now moves the *objects*
     * instead — the case comes to you.
     *
     * This replaced an OrbitControls rig, and the rig is gone rather than disabled. Two things
     * writing one camera is what made the old version possible to get lost in: the frame loop
     * followed the case while a drag moved the target, and neither knew about the other.
     *
     * Three positions, all on rails:
     *
     * - **x** is the centre of the bay you are standing at, which a horizontal swipe changes.
     * - **y** is fixed at eye level for the bay. It does *not* track the case up and down the
     *   shelf — a locked-off shot does not bob, and the case comes to the eye rather than the
     *   eye going to the case.
     * - **z** is a fixed standing distance, easing only when a case is drawn out to be read.
     */
    const ease = instant ? 1 : Math.min(1, dt * 3.2);

    camera.position.x += (stand.x - camera.position.x) * ease;
    camera.position.y += (eyeY - camera.position.y) * ease;
    camera.position.z += (stand.z - camera.position.z) * ease;
    // `lookAt` every frame rather than once: the position is still easing toward the bay, and
    // a stale orientation reads as a swimming horizon. This is also the only place the camera
    // is allowed to turn — see WALL_YAW and Q6. It is on rails, not orbiting.
    camera.lookAt(target.x, target.y, target.z);

    // The spotlight over this bay travels with the viewer — and now rides at this bay's own
    // height, so it is a picture light over whatever furniture is actually there.
    if (lamp.current) {
      lamp.current.position.x = target.x + out.x * LAMP_STANDOFF;
      lamp.current.position.y = universe.centreY + universe.height / 2 + LAMP_ABOVE;
      lamp.current.position.z = target.z + out.z * LAMP_STANDOFF;
      // A SpotLight aims at its `target`, which is a plain Object3D that three does *not* add
      // to the scene for you — so its world matrix is never updated by the normal traversal
      // and the cone stays pointing wherever it was born. Moving it here and updating it by
      // hand is the whole fix; without it the lamp lights the floor and nothing else.
      lamp.current.target.position.set(target.x, universe.centreY, target.z);
      lamp.current.target.updateMatrixWorld();
    }
    if (holdLight.current) {
      holdLight.current.position.set(hold.x, hold.y + HOLD_LIGHT_UP, hold.z + HOLD_LIGHT_FORWARD);
      holdLight.current.intensity = HOLD_LIGHT_INTENSITY * amount;
    }
  });

  return (
    <>
      {/* Instance picking. R3F raycasts an InstancedMesh for us and puts the hit index on
          the event as `instanceId`; body and cover are built from the same title order, so
          either hit resolves through the medium's slug array. stopPropagation keeps a click
          that passes through a gap from also hitting the shelf behind it. */}
      {mediumMeshes.map(({ form, slugs, body, cover, spine, mount }) => (
        <group
          key={form}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            pressedAt.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (e.instanceId === undefined) return;
            const from = pressedAt.current;
            const travelled = from
              ? Math.hypot(e.nativeEvent.clientX - from.x, e.nativeEvent.clientY - from.y)
              : 0;
            if (travelled > TAP_SLOP) return;
            e.stopPropagation();
            onPick(slugs[e.instanceId]);
          }}
          onPointerOver={() => {
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          {/* Behind the cover, so it is drawn first and the artwork sits on it. */}
          <primitive object={mount} />
          <primitive object={body} />
          <primitive object={cover} />
          {/* Inside the picking group deliberately: clicking the spine of a case is clicking
              the case, and the spine shares the body's instance indices so it resolves through
              the same slug array. */}
          {spine && <primitive object={spine} />}
        </group>
      ))}
      <Plaques bays={layout.universes} atlas={plaques} texture={plaqueTexture} />
      <primitive object={boards.slab} />
      <primitive object={boards.lip} />
      <primitive object={boards.glow} />
      {layout.blankCovers.map((blank) => (
        <BlankCover
          key={blank.slug}
          meshRef={(mesh) => {
            if (mesh) blankRefs.current.set(blank.slug, mesh);
            else blankRefs.current.delete(blank.slug);
          }}
          position={[blank.position.x, blank.position.y, blank.position.z]}
          tint={blank.tint}
          size={blank.size}
        />
      ))}
      {/* The back of the case being read. One plane, one draw call, and only while something
          is actually turned — the room is back to its 16 calls the moment you turn it back.
          It is not part of the picking group above: a click on the back should still open the
          title page, and it inherits nothing, so it carries its own handler.
          `depthWrite` stays on and there is no transparency, so it occludes the case body
          behind it rather than blending into it. */}
      {turnedItem && backTexture && (
        <mesh
          ref={backRef}
          visible={false}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onPick(turnedItem.slug);
          }}
        >
          <planeGeometry
            args={[
              DIMENSIONS[turnedItem.form].w - CORNER_RADIUS * 0.6,
              DIMENSIONS[turnedItem.form].h - CORNER_RADIUS * 0.6,
            ]}
          />
          {/* Matte: a case back is printed card under a matte laminate, not the glossy sleeve
              the front sits behind, so this is deliberately duller than any COVER_SHININESS. */}
          <meshPhongMaterial map={backTexture} shininess={6} specular="#1a1714" />
        </mesh>
      )}
      <pointLight
        ref={holdLight}
        position={[0, 0, 0]}
        intensity={0}
        distance={HOLD_LIGHT_REACH}
        decay={1.6}
        color="#ffe6c4"
      />
      {/* A spotlight rather than a point light, purely so it can cast. A point light's shadow
          is a cube map — six depth passes for one lamp — where a spotlight's is a single map,
          and the lamp already only ever throws its light one way: down at the shelf. */}
      <spotLight
        ref={lamp}
        position={[universe.startX, LAMP_HEIGHT, LAMP_Z]}
        target-position={[universe.startX, LAMP_HEIGHT - 4, 0]}
        intensity={LAMP_INTENSITY}
        distance={LAMP_REACH}
        angle={LAMP_ANGLE}
        penumbra={0.75}
        decay={1.5}
        color="#ffd9ad"
        // **Deliberately not a caster.** It was, briefly, and two shadow maps is both slower
        // than this scene should be and *wrong*: a room lit through a window has one shadow
        // direction, and a second one from a picture light gave every case two shadows going
        // different ways. The room light casts; this one is the accent that picks out the bay.
      />
      {/* **There is one travelling lamp, not three. That used to be a measurement, and the
          measurement was wrong.**

          The old note here said picture lights over the neighbouring bays cost a third of the
          framerate: "1.2 fps against 1.6". Both numbers came from headless software
          rasterisation. On real hardware this scene sits at 16.7ms in every state with no
          dropped frames at all (`scripts/measure-frames.mjs`), so a third of the framerate was
          a third of a number that never described this machine. **There is room for the extra
          lights.** Anything that cites that comparison to refuse work should stop.

          One lamp stays anyway, on the half of the reasoning that was never about cost:
          `docs/05-3d-shelf.md` §2 wanted a single lamp with real falloff, because the
          neighbouring bays are meant to be *in the dark*, waiting, rather than lit for
          inspection. Reach carries them as dimly present rather than absent. That is a
          design decision and it should be argued as one — not defended with a dead number. */}
    </>
  );
}

/**
 * The engraved brass nameplate over each bay.
 *
 * This is the piece that turns twelve bookcases standing in a row into *dedicated sections* —
 * the brief's word, and the right one. Without them the room reads as one long shelf that
 * happens to change contents; with them it reads as a gallery laid out by somebody.
 *
 * One `InstancedMesh` and one draw call for all twelve, using the same per-instance atlas
 * window (`aCell`) the covers and spines use. Mounted on the face of the cabinet rather than
 * floating: `z` is the front of the boards, so a plate sits proud of the woodwork the way a
 * screwed-on plaque does.
 */
function Plaques({ bays, atlas, texture }: { bays: UniverseShelf[]; atlas: PlaqueAtlas; texture: THREE.Texture }) {
  const mesh = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(PLAQUE_WIDTH, PLAQUE_HEIGHT);
    const cells = new Float32Array(bays.length * 4);
    bays.forEach((bay, i) => {
      const cell = atlas.cells[bay.key];
      if (!cell) return;
      cells.set(
        [
          cell.x / atlas.width,
          1 - (cell.y + cell.h) / atlas.height,
          cell.w / atlas.width,
          cell.h / atlas.height,
        ],
        i * 4
      );
    });
    geometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 4));

    // Brass: hard, warm specular and very little diffuse spread, so the plate catches the bay's
    // light as a highlight rather than glowing evenly like paper.
    // Low shininess and a dark highlight: the plate's own lighting is already *painted into*
    // its texture — the gradient is described in plaques.ts as "the face catching the room's
    // lamp" — so a bright specular on top of that is the room lighting it twice.
    const material = createCoverMaterial(texture, 14, null, { specular: "#241f18" });
    const instanced = new THREE.InstancedMesh(geometry, material, bays.length);
    // A screwed-on plate stands proud of the wall, so it throws a small shadow onto it.
    instanced.castShadow = true;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const noRotation = new THREE.Quaternion();
    bays.forEach((bay, i) => {
      // Scaled to its bay rather than a fixed size. Units used to be metres wide and one
      // plate size suited all of them; spine-out a bay can be 160mm across, and a 260mm
      // nameplate over it would be wider than the bookcase it names.
      const fit = Math.min(1, ((bay.endX - bay.startX) * 0.92) / PLAQUE_WIDTH);
      position.set((bay.startX + bay.endX) / 2, bay.centreY + bay.height / 2 + PLAQUE_RISE, PLAQUE_Z);
      matrix.compose(position, noRotation, scale.set(fit, fit, 1));
      instanced.setMatrixAt(i, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    return instanced;
  }, [bays, atlas, texture]);

  useEffect(() => {
    return () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };
  }, [mesh]);

  return <primitive object={mesh} />;
}

/**
 * The room.
 *
 * `docs/05-3d-shelf.md` §3 said not to build one, and was right about the danger: walls,
 * windows and props are a great deal of work to end up looking like a bad game level. The
 * owner has overruled the conclusion, so what survives is the *reasoning* — restraint. There
 * are no windows, no props, no furniture beyond the bookcases themselves. A room reads as a
 * room because the lamp falls on real surfaces, not because things are standing about in it.
 *
 * Three draw calls for the whole thing:
 *
 * - **one inverted box** for the walls and ceiling. `BackSide` means you are inside it, so a
 *   single mesh does four walls and a lid — and its own floor face is hidden under the real
 *   floor below, which is why it can afford to be plaster all over.
 * - **one floor plane**, which is the piece doing the actual work. Boards, running the length
 *   of the gallery, are what turn a void with objects in it into a place.
 * - **one skirting board** along the back wall. The cheapest domestic cue there is: a room
 *   without one reads as a rendering, and the bookcases stand proud of it exactly as real
 *   furniture does.
 *
 * The far end of all of it is eaten by the lamp's falloff and then by fog, so most of this is
 * never seen at full brightness — which is the point. It is there to be *fallen on*.
 */
/**
 * The room, sized by the cabinets rather than by constants.
 *
 * The layout works out how much wall it needs and hands back `room`; this builds the shell
 * around it. The old version measured off case bounds and a pile of fixed margins, which was
 * fine for one flat elevation and cannot describe a U — the side walls have to land exactly
 * where the side cabinets stand or the joinery floats away from the plaster.
 */
function Room({ room }: { room: { halfWidth: number; depth: number; height: number } }) {
  const floorY = -ROOM_FLOOR_DROP;
  const ceilingY = room.height + ROOM_HEADROOM;
  const startX = -room.halfWidth - WALL_THICKNESS;
  const endX = room.halfWidth + WALL_THICKNESS;
  const width = endX - startX;
  const height = ceilingY - floorY;
  // Back wall on z = 0, opening toward the viewer, with a little beyond the front cabinets so
  // the camera at the centre stand is inside the box rather than looking through its face.
  const backZ = -WALL_THICKNESS;
  const frontZ = room.depth + ROOM_FRONT_MARGIN;
  const depth = frontZ - backZ;

  const floorTexture = useMemo(() => {
    const created = new THREE.CanvasTexture(buildRoomSurface("floor"));
    created.wrapS = THREE.RepeatWrapping;
    created.wrapT = THREE.RepeatWrapping;
    // Boards run along the gallery, so the tile repeats far more often across its length than
    // across its depth — repeating equally would give square planks, which are not floorboards.
    created.repeat.set(width / 7, depth / 7);
    created.anisotropy = 8;
    return created;
  }, [width, depth]);

  const plasterTexture = useMemo(() => {
    const created = new THREE.CanvasTexture(buildRoomSurface("plaster"));
    created.wrapS = THREE.RepeatWrapping;
    created.wrapT = THREE.RepeatWrapping;
    created.repeat.set(width / 10, height / 10);
    return created;
  }, [width, height]);

  useEffect(() => {
    const built = [floorTexture, plasterTexture];
    return () => built.forEach((t) => t.dispose());
  }, [floorTexture, plasterTexture]);

  return (
    <group>
      {/* The walls receive. This is the single most important receiveShadow in the scene:
          the run is mounted on this surface, and an object that does not darken what it hangs
          on is not in the room, whatever else is done to it. */}
      <mesh receiveShadow position={[(startX + endX) / 2, floorY + height / 2, (ROOM_BACK_Z + ROOM_FRONT) / 2]}>
        <boxGeometry args={[width, height, depth]} />
        {/* **The plaster is back, and it was a mistake to take it out.** The note here used to
            say the bump was "deliberately at the edge of perception" and so not worth two
            texture fetches per fragment. Both halves were wrong. The cost was measured through
            software rasterisation; and a wall of one flat colour is the single clearest tell
            that a room is not a room — being at the edge of perception is exactly the point of
            it, because real plaster is never uniform and the eye knows it immediately. */}
        <meshPhongMaterial
          side={THREE.BackSide}
          color={ROOM_WALL}
          shininess={2}
          specular="#2a251f"
          bumpMap={plasterTexture}
          bumpScale={ROOM_BUMP_SCALE.plaster}
        />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[(startX + endX) / 2, floorY, (ROOM_BACK_Z + ROOM_FRONT) / 2]}>
        <planeGeometry args={[width, depth]} />
        {/* Boards have a low sheen along the grain — enough that the lamp draws a soft pool on
            the floor as it travels, which is most of what sells the room. Not a gloss: a
            polished floor under one warm lamp reads as a shop, not a front room. */}
        <meshPhongMaterial
          color={ROOM_FLOOR}
          shininess={14}
          specular="#3a2f24"
          bumpMap={floorTexture}
          bumpScale={ROOM_BUMP_SCALE.floor}
        />
      </mesh>

      <mesh castShadow receiveShadow position={[(startX + endX) / 2, floorY + SKIRTING_HEIGHT / 2, backZ + SKIRTING_DEPTH / 2]}>
        <boxGeometry args={[width, SKIRTING_HEIGHT, SKIRTING_DEPTH]} />
        <meshPhongMaterial color={ROOM_SKIRTING} shininess={22} specular="#332a20" />
      </mesh>

      {/* The ceiling gets its own plane rather than taking the wall colour off the box above.
          Ceilings are painted lighter than walls almost everywhere, and in a room lit from
          below-ceiling height it is the surface that tells you there is a ceiling at all —
          without it the top of the frame reads as the wall simply running out. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[(startX + endX) / 2, ceilingY - 0.01, (ROOM_BACK_Z + ROOM_FRONT) / 2]}>
        <planeGeometry args={[width, depth]} />
        <meshPhongMaterial color={ROOM_CEILING} shininess={1} specular="#0a0a0a" />
      </mesh>

      {/* A picture rail, which is what a room like this actually has where wall meets ceiling,
          and what stops the corner being a bare seam between two flat colours. */}
      <mesh castShadow receiveShadow position={[(startX + endX) / 2, ceilingY - RAIL_DROP, backZ + SKIRTING_DEPTH / 2]}>
        <boxGeometry args={[width, RAIL_HEIGHT, SKIRTING_DEPTH]} />
        <meshPhongMaterial color={ROOM_SKIRTING} shininess={18} specular="#2b2620" />
      </mesh>
    </group>
  );
}

/**
 * Adaptive quality — the item the docs deferred "until measured on real hardware", now that
 * there is a measurement.
 *
 * The shelf is fragment-bound, not draw-call-bound: 22 draw calls is nothing, but every one of
 * those fragments runs a Phong shader with an atlas lookup, a bump chunk and, on covers, a
 * luminance gradient. That cost scales with the number of pixels, and **the number of pixels
 * scales with the square of the device pixel ratio** — a HiDPI laptop at dpr 1.5 is rendering
 * 2.25 times the work of this headless harness at dpr 1, which is precisely the hardware most
 * likely to be struggling and the hardware I cannot measure from here.
 *
 * So the scene measures itself and gives up resolution before it gives up frames. Resolution
 * is the right thing to spend: a slightly softer image that moves is strictly better than a
 * crisp one that stutters, and the artwork survives it far better than the motion does.
 *
 * `flipflops` + `onFallback` are the guard against the obvious failure — dropping quality
 * raises the framerate, which raises quality, which drops the framerate. After three
 * oscillations it stops adapting and stays low.
 */
function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  return (
    <PerformanceMonitor
      // Clamped to the screen's own ratio, never above it. Without the clamp the monitor's
      // starting factor asks a dpr-1 display to render at 1.1 — more pixels than it has,
      // which is slower *and* softer, and on exactly the machines already struggling.
      onChange={({ factor }) =>
        setDpr(Math.min(window.devicePixelRatio, DPR_MIN + (DPR_MAX - DPR_MIN) * factor))
      }
      onFallback={() => setDpr(DPR_MIN)}
      flipflops={3}
    />
  );
}

/** Prints what the brief asks to be reported: real draw calls and triangles, read from the
 * renderer after a frame has actually happened (a bare rAF can fire before the first R3F
 * render updates gl.info for this frame; a short delay is simpler than racing it). */
function PerfLogger() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const id = setTimeout(() => {
      console.log(`[shelf] draw calls: ${gl.info.render.calls}, triangles: ${gl.info.render.triangles}`);
    }, 300);
    return () => clearTimeout(id);
  }, [gl]);
  return null;
}

/**
 * Whether this browser can draw the shelf at all. Probed once, on a throwaway canvas: R3F
 * will happily mount and then fail, and a black rectangle with no explanation is worse than
 * saying so and pointing at the catalogue, which carries the same 152 titles in the DOM.
 */
function webglSupported(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * A media query is an external store, so it is read with the hook meant for one. The obvious
 * version — useState plus an effect that sets it — is a cascading render, and React's lint
 * rules reject it.
 */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );
  // The server snapshot is `false` for both queries this app asks: motion is allowed and the
  // pointer is fine unless the browser says otherwise.
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** The camera's easing is time-based motion the viewer did not ask for, so it goes when
 * reduced motion is set. The pull itself stays: it is driven by the scroll position, not by
 * a clock — it is the gesture, not an animation played at you. */
function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** Pixels of scroll per title. One flick of a trackpad brings out about two. */
const SCROLL_PER_TITLE = 260;

/** How far a drag must travel before it commits to being a walk or a bay change, and how far
 * sideways counts as a swipe. The lock distance is small enough not to feel laggy and large
 * enough that a straight-ish drag is never read as the wrong axis. */
const AXIS_LOCK_SLOP = 10;
const BAY_SWIPE_DISTANCE = 90;

/**
 * How long the chrome stays up after you stop doing anything. Long enough to cross the screen
 * and reach a control without it going away in front of you; short enough that the room is
 * what you are left looking at.
 */
const CHROME_LINGER = 2600;

export default function ShelfScene({ universes }: { universes: UniverseData[] }) {
  const [order, setOrder] = useState<"release" | "story">("release");
  const [current, setCurrent] = useState(0);
  const [active, setActive] = useState<ShelfItem | null>(null);
  /**
   * Whether the case that is out is showing its back — PLAN.md's "draw a case out, turn it,
   * read the back".
   *
   * A deliberate button (and a key) rather than a gesture. Scroll already means "walk the
   * shelf" and a click already means "open this title"; giving the turn a third gesture would
   * have to take one of those away, and the two it would take are the ones that make the
   * shelf navigable. A button also costs nothing to make keyboard-operable and announceable,
   * which a drag never is.
   */
  const [turned, setTurned] = useState(false);
  /** Standing back to see the whole bookcase. The close framing is better for reading one
   * case and worse for knowing where you are; this is the way back out. */
  const [wide, setWide] = useState(false);
  /** Arrive in the middle of the room. Picking a universe walks you to its wall; Escape
   *  brings you back, so the establishing shot is always one key away rather than something
   *  you see once and never again. */
  const [centred, setCentred] = useState(true);
  const [query, setQuery] = useState("");
  const [missed, setMissed] = useState(false);
  /**
   * Whether the chrome is showing. docs/05-3d-shelf.md §12 Q4 — **strip to nothing**; the
   * controls come back on a mouse move, a key or a scroll, and go away again when you stop.
   * Q21 puts the caption under the same rule, so there is one rule for chrome and no
   * exceptions to remember.
   *
   * Starts hidden. The room is the thing; arriving into a bare room and having the controls
   * appear the moment you move is the behaviour that was asked for, and it also means the
   * first frame anyone sees is the shelf rather than a toolbar.
   */
  const [chrome, setChrome] = useState(false);
  /** Held open: the pointer is over the bar, or focus is inside it. Hiding controls out from
   *  under a pointer that is on its way to click one is the classic version of this bug. */
  const chromeHeld = useRef(false);
  const chromeTimer = useRef<number | null>(null);
  const router = useRouter();
  const progress = useRef(0);
  const surface = useRef<HTMLDivElement>(null);

  /** Show the chrome, and set it to fade again after a pause. */
  const wakeChrome = useCallback(() => {
    setChrome(true);
    if (chromeTimer.current !== null) window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => {
      if (!chromeHeld.current) setChrome(false);
    }, CHROME_LINGER);
  }, []);

  /**
   * The state lives here but the *switch* is an attribute on <html>, because the page header
   * and the catalogue link are rendered by a Server Component one level up (`page.tsx`) and
   * cannot read this component's state. One attribute plus one rule in globals.css covers
   * every piece of chrome on the route — which is what makes Q21's "one rule for chrome, no
   * exceptions" true rather than aspirational.
   */
  useEffect(() => {
    document.documentElement.dataset.chrome = chrome ? "shown" : "hidden";
  }, [chrome]);

  useEffect(() => {
    const wake = () => wakeChrome();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("wheel", wake, { passive: true });
    // Capture phase: the search box stops key events reaching the shelf (so typing "t" does
    // not turn the case over), and without capture that would also stop the chrome noticing
    // that someone is using it.
    window.addEventListener("keydown", wake, true);
    // Q11. A keyboard user's first action is Tab, so this is the *same* reveal a mouse user
    // gets on move rather than a separate mechanism bolted on for them — and it is why a
    // conventional skip-link was rejected, which would have hidden the shelf's own controls
    // from exactly the people who most need them announced.
    window.addEventListener("focusin", wake, true);
    return () => {
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("wheel", wake);
      window.removeEventListener("keydown", wake, true);
      window.removeEventListener("focusin", wake, true);
      if (chromeTimer.current !== null) window.clearTimeout(chromeTimer.current);
      delete document.documentElement.dataset.chrome;
    };
  }, [wakeChrome]);

  /** Hold the chrome open while it is being used, and release it when it is not. */
  const holdChrome = useCallback(() => {
    chromeHeld.current = true;
    setChrome(true);
    if (chromeTimer.current !== null) window.clearTimeout(chromeTimer.current);
  }, []);
  const releaseChrome = useCallback(() => {
    chromeHeld.current = false;
    wakeChrome();
  }, [wakeChrome]);

  // The two orderings (docs/05-3d-shelf.md §4), applied within each universe: the objects are
  // unchanged, the order is not. In story order the titles with no place on a timeline lift
  // off their own unit rather than being given a year they do not have.
  const runs = useMemo<ShelfRun[]>(
    () =>
      universes.map((u) => {
        if (order === "release") return { key: u.key, label: u.label, titles: u.titles, floating: [] };
        // The object changes with the ordering, not just the order: a 1943 story becomes a
        // film can, a 5000 BC one a clay tablet. Most titles are unaffected, because a 2015
        // story shipped on 2015 media — which is the point (docs/05-3d-shelf.md §4).
        const asStory = (t: ShelfTitleData) => ({ ...t, form: formForStoryYear(t.storyYear, t.medium) });
        return {
          key: u.key,
          label: u.label,
          titles: u.titles
            .filter((t) => t.storyYear !== null)
            .sort((a, b) => a.storyYear! - b.storyYear! || a.releaseYear - b.releaseYear)
            .map(asStory),
          floating: u.titles.filter((t) => t.storyYear === null),
        };
      }),
    [universes, order]
  );

  const layout = useMemo(() => buildShelfLayout(runs, atlasCells, CELL_SIZE, ATLAS_SIZE), [runs]);

  // Off `universes` rather than off the layout: the layout is rebuilt on every reshuffle and
  // in story order it drops the 14 titles that have no place on a timeline, which would print
  // a blank spine on exactly the cases that are most worth labelling.
  const spineTitles = useMemo<SpineTitle[]>(
    () =>
      universes.flatMap((u) =>
        u.titles.map((t) => ({ slug: t.slug, label: t.label, tint: t.tint, medium: t.medium }))
      ),
    [universes]
  );
  const shelf = layout.universes[Math.min(current, layout.universes.length - 1)];

  // Measured off the room rather than assumed from LEVELS: the occupied volume runs from the
  // bottom board to the top of the tallest case standing on the top one, and the midpoint of
  // *that* is what keeps all four levels in frame.
  const wallCentreY = (layout.bounds.minY + layout.bounds.maxY) / 2;
  // Where the camera starts, before the frame loop eases it to `standBack`. It used to be
  // derived from the height of the whole wall; the shelf is browsed close now (see
  // VISIBLE_WIDTH), so a constant in the same neighbourhood is both simpler and avoids
  // opening on a long dolly in from the far side of the room.
  const cameraZ = 6.5;

  const pick = useCallback((slug: string) => router.push(`/title/${slug}`), [router]);
  const reducedMotion = usePrefersReducedMotion();
  const { progress: loaded } = useProgress();
  const [canDraw] = useState(webglSupported);

  const goToUniverse = useCallback(
    (index: number) => {
      const next = Math.min(Math.max(index, 0), layout.universes.length - 1);
      progress.current = 0;
      // You cannot carry a case you were reading to another bookcase.
      setTurned(false);
      setCurrent(next);
      // Choosing a universe walks you to its wall. This is the only thing that leaves the
      // establishing shot, so arriving and then picking is a deliberate step *into* the room.
      setCentred(false);
    },
    [layout]
  );

  /**
   * Search: type, and the best match walks itself off the shelf.
   *
   * With a locked-off camera and 152 titles across twelve bays, scrolling to a specific title
   * is a long way to travel — this is the shortcut, and it is the only way to reach a title
   * without knowing where it lives. It resolves the match to *its* bay and *its* position in
   * that bay, then leaves the walk half a step in, which is the top of the sine that draws a
   * case out: you arrive with the thing already in your hands.
   */
  const searchable = useMemo<SearchableTitle[]>(
    () =>
      layout.universes.flatMap((u) =>
        u.items.map((item) => ({
          slug: item.slug,
          label: item.label,
          universeLabel: u.label,
          releaseYear: item.releaseYear,
        }))
      ),
    [layout]
  );

  const jumpTo = useCallback(
    (query: string) => {
      const match = bestMatch(searchable, query);
      if (!match) return false;
      const bay = layout.universes.findIndex((u) => u.items.some((i) => i.slug === match.slug));
      if (bay < 0) return false;
      const index = layout.universes[bay].items.findIndex((i) => i.slug === match.slug);
      setTurned(false);
      setCurrent(bay);
      // Searching walks you to the title's wall. Without this you stayed in the middle of the
      // room while a case on a side wall turned to face whoever was standing *there* — so it
      // arrived edge-on to you, which reads as the pull-out being broken.
      setCentred(false);
      // Half a step past the title's own index is the peak of the pull.
      progress.current = index + 0.5;
      return true;
    },
    [layout, searchable]
  );

  // Scroll walks this shelf; the arrow keys do the same by whole titles, and left/right
  // change which universe you are standing in front of.
  //
  // A native listener rather than onWheel, because React registers wheel handlers passively
  // and preventDefault is a no-op inside one — without it the page scrolls behind the canvas
  // while the shelf moves, which is two things happening for one gesture.
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const walk = (delta: number) => {
      // Walking away from a case you are reading turns it back first, and that gesture is
      // spent doing so. Otherwise the shelf moves under a card you are still reading, which
      // is the same complaint as a page that scrolls while a dialog is open.
      if (turned) {
        setTurned(false);
        return;
      }
      const last = (layout.universes[current]?.items.length ?? 1) - 0.001;
      progress.current = Math.min(Math.max(progress.current + delta, 0), last);
    };
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      // deltaMode 1 is lines, not pixels (Firefox); treating them alike scrolls ~15x too far.
      walk((e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) / SCROLL_PER_TITLE);
    }
    function onKey(e: KeyboardEvent) {
      // Not while the viewer is typing somewhere, and not on top of a browser shortcut. The
      // search box also stops propagation, but this guard is the one that survives someone
      // adding another field later and not knowing they had to.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowDown") walk(0.5);
      else if (e.key === "ArrowUp") walk(-0.5);
      else if (e.key === "ArrowRight") goToUniverse(current + 1);
      else if (e.key === "ArrowLeft") goToUniverse(current - 1);
      else if (e.key === "Home") progress.current = 0;
      else if (e.key === "t" || e.key === "T") setTurned((was) => !was);
      else if (e.key === "Escape") {
        // Escape steps back rather than only putting the case down: turned case first, then
        // out to the middle of the room. Two presses always return you to the view you
        // arrived at, from anywhere.
        if (turned) setTurned(false);
        else setCentred(true);
      }
      else return;
      e.preventDefault();
    }
    /**
     * Touch and mouse-drag, sharing one rule: **vertical walks the shelf, horizontal changes
     * the bay.** The axis is decided once per gesture, at the point the movement first becomes
     * unambiguous, and then held — deciding it per event lets a diagonal drag flicker between
     * the two, which feels like the app arguing with you.
     *
     * The horizontal swipe fires once per gesture and then locks out, so one flick moves you
     * one bay. It is the same movement the arrows make, and it exists because with a locked-off
     * camera there is nothing else for a drag to mean: the old build spent it on orbiting,
     * which is exactly how the view got lost.
     */
    let dragFrom: { x: number; y: number } | null = null;
    let dragAxis: "walk" | "bay" | null = null;
    let baySwiped = false;

    const dragStart = (x: number, y: number) => {
      dragFrom = { x, y };
      dragAxis = null;
      baySwiped = false;
    };

    const dragMove = (x: number, y: number, preventDefault: () => void) => {
      if (!dragFrom) return;
      const dx = x - dragFrom.x;
      const dy = y - dragFrom.y;
      if (dragAxis === null) {
        if (Math.hypot(dx, dy) < AXIS_LOCK_SLOP) return;
        dragAxis = Math.abs(dx) > Math.abs(dy) ? "bay" : "walk";
      }
      preventDefault();
      if (dragAxis === "bay") {
        if (!baySwiped && Math.abs(dx) > BAY_SWIPE_DISTANCE) {
          baySwiped = true;
          goToUniverse(current + (dx < 0 ? 1 : -1));
        }
        return;
      }
      walk((dragFrom.y - y) / SCROLL_PER_TITLE);
      dragFrom = { x, y };
    };

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (t) dragStart(t.clientX, t.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (t) dragMove(t.clientX, t.clientY, () => e.preventDefault());
    }
    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "touch" || e.button !== 0) return;
      dragStart(e.clientX, e.clientY);
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragFrom || e.buttons === 0) return;
      dragMove(e.clientX, e.clientY, () => e.preventDefault());
    }
    function onPointerUp() {
      dragFrom = null;
      dragAxis = null;
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
    // `turned` is a dependency because the wheel and touch handlers branch on it. Re-binding
    // three listeners when it flips is nothing, and it is the honest version of the ref this
    // used to keep in sync during render — which React's lint rules reject, correctly.
  }, [layout, current, goToUniverse, turned]);

  if (!canDraw) {
    return (
      <div className="flex h-[60vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-label-mid">
          This shelf needs WebGL, which this browser has turned off or does not support.
        </p>
        <Link className="text-sm text-label-bright underline" href="/">
          Browse the same 152 titles as a catalogue
        </Link>
      </div>
    );
  }

  return (
    <div ref={surface} className="relative flex min-h-0 w-full flex-1 flex-col touch-none">
      {/* All of the shelf's chrome in one floating column, over the room rather than stacked
          above it. Stacked, stripping it left an empty band where the controls used to be —
          the room has to grow back into the space it gives up or "strip to nothing" only
          removes the ink. `top-14` clears the masthead, which floats at top-0 on this route.

          The page's own title and catalogue link live here rather than in `page.tsx` so that
          every piece of chrome is one element with one reveal, instead of two components
          guessing at each other's heights. */}
      <div
        className="shelf-chrome absolute inset-x-0 top-14 z-20 flex flex-col gap-2 px-6"
        onPointerEnter={holdChrome}
        onPointerLeave={releaseChrome}
        onFocusCapture={holdChrome}
        onBlurCapture={releaseChrome}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-display text-xs uppercase tracking-[0.2em] text-label-dim">
            The shelf — Phase 3
          </h1>
          {/* The honest accessible equivalent of a WebGL canvas is not an aria-label, it is
              the same 152 titles as text. That page exists; this is a link to it, for anyone
              who cannot use the room and for anyone who would simply rather read. */}
          <Link href="/" className="text-sm text-label-mid underline hover:text-label-bright">
            Browse the same titles as a catalogue
          </Link>
        </div>
        <div className="flex flex-wrap items-baseline gap-3">
        <button
          type="button"
          onClick={() => goToUniverse(current - 1)}
          disabled={current === 0}
          aria-label="Previous universe"
          className="rounded border border-shelf-edge px-3 py-1 font-display text-sm text-label-mid enabled:hover:text-label-bright disabled:opacity-30"
        >
          ←
        </button>
        <span className="font-display text-sm uppercase tracking-[0.16em] text-label-bright">{shelf.label}</span>
        <button
          type="button"
          onClick={() => goToUniverse(current + 1)}
          disabled={current === layout.universes.length - 1}
          aria-label="Next universe"
          className="rounded border border-shelf-edge px-3 py-1 font-display text-sm text-label-mid enabled:hover:text-label-bright disabled:opacity-30"
        >
          →
        </button>
        <span className="text-xs text-label-dim">
          {shelf.items.length} titles · shelf {current + 1} of {layout.universes.length}
        </span>

        {/* A real form, so Enter submits it and a screen reader announces it as search. The
            input stops key events reaching the shelf: without that, typing "t" in the box
            turns the case over and the arrows walk the shelf while you are trying to edit. */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setMissed(!jumpTo(query));
          }}
          className="flex items-center gap-2"
        >
          <label className="sr-only" htmlFor="shelf-search">
            Search the archive
          </label>
          <input
            id="shelf-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMissed(false);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Find a title"
            className="w-44 rounded border border-shelf-edge bg-transparent px-3 py-1 text-sm text-label-bright placeholder:text-label-dim"
          />
          <button
            type="submit"
            className="rounded border border-shelf-edge px-3 py-1 font-display text-xs uppercase tracking-[0.12em] text-label-dim hover:text-label-mid"
          >
            Find
          </button>
          {missed && (
            <span role="status" className="text-xs text-label-dim">
              Nothing matches that.
            </span>
          )}
        </form>

        <button
          type="button"
          onClick={() => setWide((was) => !was)}
          aria-pressed={wide}
          className={`rounded border px-3 py-1 font-display text-xs uppercase tracking-[0.12em] ${
            wide ? "border-label-mid text-label-bright" : "border-shelf-edge text-label-dim hover:text-label-mid"
          }`}
        >
          {wide ? "Close up" : "Whole shelf"}
        </button>

        {(["release", "story"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              // The reshuffle replaces the object in your hand — in story order a 1943 title
              // is a film can, not the Blu-ray you were just holding — so put it back first.
              setTurned(false);
              setOrder(option);
            }}
            aria-pressed={order === option}
            className={`rounded border px-3 py-1 font-display text-xs uppercase tracking-[0.12em] ${
              order === option
                ? "border-label-mid text-label-bright"
                : "border-shelf-edge text-label-dim hover:text-label-mid"
            }`}
          >
            {option === "release" ? "Release order" : "Story order"}
          </button>
        ))}
        {/* The two modes do not have the same truth status and must not wear each other's
            language (docs/05-3d-shelf.md §4). */}
        <p className="text-xs text-label-dim">
          {order === "release"
            ? "Each release's medium is worked out from its year by a fixed rule, not verified title by title."
            : "A conceit: nothing was recorded in 1943. Titles with no place on a timeline hang above their shelf."}
        </p>
        </div>
      </div>
      <Canvas
        className="min-h-0 flex-1"
        /**
         * **Shadows, finally — and the note that used to sit here called this exactly right.**
         *
         * It said: no shadow maps, because a shadow-casting light doubles every case draw call
         * on a laptop with no discrete GPU — with the *upgrade path* being "a contact shadow
         * per level **if a unit reads as floating without one**". A unit read as floating
         * without one. The owner said so in those words.
         *
         * Both halves of that note have now expired for the same reason: the cost was measured
         * through SwiftShader, and on the real machine this scene has 60fps of headroom. So it
         * gets a real shadow rather than a painted-on decal — an object that does not darken
         * the wall behind it is the single loudest way to say "this is not in the room".
         *
         * `"percentage"` names the filter explicitly. Both `"soft"` and a bare `shadows` land on
         * PCFSoftShadowMap, which three now warns is deprecated — on every frame, in the
         * console, forever. The softness here comes from the light being a broad room source
         * rather than from the filter, so nothing is lost by saying which one.
         */
        shadows="percentage"
        dpr={[DPR_MIN, DPR_MAX]}
        // Looking along the shelf at an angle, not square at it: at ~35 degrees the cases
        // read as objects with depth rather than as flat posters, which is the entire reason
        // this is 3D. Far enough back to hold all four levels of a unit.
        camera={{ position: [-4.2, wallCentreY + 0.5, cameraZ], fov: FOV }}
        // **Tone mapping, and it is the difference between "lit" and "blown out".** With none,
        // radiance above 1 is clipped flat, so a bright cover under a warm lamp turns into a
        // white hole with no detail — which is what an arc reactor, a foil title and a museum
        // spotlight all reliably produce. ACES rolls the highlights off instead of cutting
        // them, which is what makes a photograph of a bright object still look like an object.
        // The exposure is slightly under 1 because the scene is deliberately dim and the eye
        // reads a dark room with intact highlights as richer than a bright one without.
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        onCreated={({ gl }) => gl.setClearColor(ROOM_HAZE)}
      >
        {/*
          **Fog in the *room's* colour, and this was the whole of the black wide shot.**

          It used to be `#14100d` from 13 to 38 units — near-black, tuned when the room was
          near-black, where it did the second half of "no visible end": light stops reaching,
          then the air closes, and the neighbouring bays wait in the dark.

          Painting the room white did not touch it, so the far wall was still being blended to
          black. It only showed once the wide shot pulled back to 41 units — past the fog's own
          far plane — at which point *every surface in the room* resolved to the fog colour and
          the room rendered as a void with a lit case floating in it. It looked like a lighting
          failure and it was a leftover constant.

          Now the haze is the room's own tone and it starts beyond the widest standing
          distance, so it softens the far ends of the run without touching what you are
          looking at. Aerial perspective in a bright room is pale, not black.
        */}
        <fog attach="fog" args={[ROOM_HAZE, 52, 150]} />

        {/* A dim room, not a display case. The warm key is the lamp that travels with you,
            inside ShelfContent; what is left here is enough ambience that an unlit cover is
            dark rather than black, plus a cool fill for shape. */}
        {/* **A painted room bounces.** The old 0.13 was right for a near-black void where the
            lamp was the only source of anything; pale walls throw most of what hits them back,
            and without that the room reads as a white surface in a dark cave, which is the one
            thing a real room never looks like. */}
        <ambientLight intensity={0.9} color="#f4ece0" />
        {/* Sky-and-ground bounce, which is what actually separates a wall from a ceiling from a
            floor when there is no strong key light. Two colours and no shadow map — it costs a
            constant per fragment, and the real-hardware measurement leaves room for it. */}
        <hemisphereLight args={["#efe7da", "#7d6a55", 1.25]} />
        {/* The room's own daylight. Ambient and hemisphere alone left everything outside the
            picture light's cone almost black, which only showed once the wide shot pulled back
            far enough to see the room — the close shot is nearly all cone and hid it.
            It **casts**, on a wide orthographic frustum: a fill that did not would have
            softened the shelf's shadow back out of existence, and that shadow is the whole
            reason the run stopped looking stuck to the wall. Two shadow maps, and the real
            hardware has the headroom for both. */}
        <directionalLight
          position={[ROOM_LIGHT_X, ROOM_LIGHT_Y, ROOM_LIGHT_Z]}
          intensity={1.15}
          color="#f7f1e6"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-70}
          shadow-camera-right={70}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
          shadow-camera-near={1}
          shadow-camera-far={160}
          shadow-bias={-0.0008}
          shadow-normalBias={0.03}
        />
        {/* The cool fill is gone. It cost a light — every one of which Phong charges against
            every fragment — and it was working against the room: a warm mahogany gallery under
            one tungsten lamp does not want a blue rim on everything. Removing it bought roughly
            a fifth of the framerate and made the palette more single-minded, which is the rare
            change that is cheaper *and* better. */}

        <Suspense fallback={null}>
          <ShelfContent
            layout={layout}
            onPick={pick}
            universe={shelf}
            progress={progress}
            instant={reducedMotion}
            onActive={setActive}
            turnedItem={turned ? active : null}
            storyOrder={order === "story"}
            spineTitles={spineTitles}
            wide={wide}
            centred={centred}
          />
          {/* Inside the boundary deliberately: React holds every child of a Suspense
              boundary back until every suspending call within it resolves, so this only
              mounts (and starts its timer) once the atlas texture -- and therefore the
              instanced meshes -- actually exist. Outside, its timer raced the texture
              load and once logged a bare "1 draw call" ground-plane-only frame. */}
          <AdaptiveQuality />
        <PerfLogger />
        </Suspense>

        {/* Replaces the bare ground plane that used to stand in for a floor. */}
        <Room room={layout.room} />

        {/* No controls. The camera is locked off and driven entirely by the frame loop
            above — see the comment there. An OrbitControls rig used to live here; it is
            deleted rather than disabled, because leaving it configured-off is how the next
            person re-enables it and reintroduces two things writing one camera. */}
      </Canvas>
      {/* What you have just drawn off the shelf. The cover art alone does not say which
          season of Daredevil this is, nor what the object is — and 19 titles repeat. The note
          and the rest of the record stay on the title page: shipping 152 of them into this
          route's bundle would cost more than it tells you here. */}
      {active && (
        <div className="shelf-chrome pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-8">
          {/* On an opaque scrim, not a translucent one: the caption sits over whatever
              artwork happens to be behind it, and at 85% over a bright cover the dim second
              line measured 3.16:1 — under the 4.5 floor. Measured, not eyeballed; the guard
              is in scripts/contrast.test.ts. */}
          {/* The scrim is pointer-events-none so it never eats a click meant for the shelf
              behind it; the one control inside it opts back in. */}
          <div
            className="pointer-events-auto flex flex-col items-center gap-1 rounded bg-shelf-dark px-5 py-2 text-center"
            onPointerEnter={holdChrome}
            onPointerLeave={releaseChrome}
            onFocusCapture={holdChrome}
            onBlurCapture={releaseChrome}
          >
          {/* Dropped once the case is turned, for two reasons that happen to agree. It is
              redundant — the back cover prints the title, the year and the format itself, so
              this repeats in chrome what the object already says. And it is harmful: the two
              lines make the card tall enough to cover the last lines of the curated note,
              which is the most valuable and least regenerable thing in the archive
              (`PLAN.md` §6). Photographed before it was believed. */}
          {!turned && (
            <>
              <p className="font-display text-sm uppercase tracking-[0.16em] text-label-bright">{active.label}</p>
              <p className="text-xs text-label-dim">
                {order === "release" ? active.releaseYear : storyYearLabel(active.storyYear)} ·{" "}
                {FORM_NAMES[active.form]} · click to open
              </p>
            </>
          )}
          <button
            type="button"
            onClick={() => setTurned((was) => !was)}
            aria-pressed={turned}
            className="mt-1 rounded border border-shelf-edge px-3 py-1 font-display text-xs uppercase tracking-[0.12em] text-label-mid hover:text-label-bright"
          >
            {turned ? "Turn it back" : "Turn it over"}
            <span className="ml-2 text-label-dim">T</span>
          </button>
          </div>
        </div>
      )}
      {/* The atlas is 3 MB, and until it arrives the room is empty with nothing to say so —
          measured on the live site, where a cold load spends several seconds looking broken. */}
      {loaded < 100 && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-16">
          <p className="font-display text-xs uppercase tracking-[0.2em] text-label-dim">
            Building the shelf… {Math.round(loaded)}%
          </p>
        </div>
      )}
    </div>
  );
}
