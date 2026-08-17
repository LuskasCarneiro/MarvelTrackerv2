"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useProgress, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { tintToHsl } from "@/lib/tint";
import { renderBackCover } from "./backCover";
import { buildSpineAtlas, type SpineTitle } from "./spineAtlas";
import atlasManifest from "../../../data/atlas.json";
import {
  DIMENSIONS,
  CORNER_RADIUS,
  BODY_MATERIAL,
  COVER_SHININESS,
  buildShelfLayout,
  formForStoryYear,
  ROUND_FORMS,
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
  /** Spine labels are ink on a transparent sheet laid over the case, so they need alpha
   * testing; covers are opaque and must not pay for it. Alpha *test* rather than blending
   * keeps depth writes on, so a spine still occludes properly and needs no sort order. */
  options: { alphaTest?: number } = {}
): THREE.MeshPhongMaterial {
  const material = new THREE.MeshPhongMaterial({
    map,
    shininess,
    specular: new THREE.Color("#6b6259"),
    ...(options.alphaTest ? { transparent: false, alphaTest: options.alphaTest } : {}),
  });
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
 * spine to print — and `none` is a 3mm card standing in for a title that never had a physical
 * release, so giving it a printed spine would assert the opposite of what it means.
 */
const SPINE_FORMS = new Set<Form>(["vhs", "amaray", "bluray", "steel"]);

/** How far the label sheet stands off the case's own side, so it never z-fights the body. */
const SPINE_INSET = 0.002;

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
  spine: { texture: THREE.Texture; uvs: CellUv[] } | null
) {
  const count = row.bodyMatrices.length;

  const bodyGeometry = bodyGeometryFor(row.form);
  const bm = BODY_MATERIAL[row.form];
  const bodyMaterial = new THREE.MeshPhongMaterial({ color: bm.color, shininess: bm.shininess, specular: bm.specular });
  const body = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);
  row.bodyMatrices.forEach((m, i) => body.setMatrixAt(i, m));
  body.instanceMatrix.needsUpdate = true;

  const coverGeometry = coverGeometryFor(row.form);
  const cellData = new Float32Array(count * 4);
  row.coverUvs.forEach((uv, i) => cellData.set([uv.u0, uv.v0, uv.du, uv.dv], i * 4));
  coverGeometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(cellData, 4));
  const coverMaterial = createCoverMaterial(coverTexture, COVER_SHININESS[row.form]);
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
    const spineMaterial = createCoverMaterial(spine.texture, 12, { alphaTest: 0.4 });
    spineMesh = new THREE.InstancedMesh(spineGeometry, spineMaterial, count);
    row.bodyMatrices.forEach((m, i) => spineMesh!.setMatrixAt(i, m));
    spineMesh.instanceMatrix.needsUpdate = true;
  }

  return { body, cover, spine: spineMesh };
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
const WOOD_FRESH = new THREE.Color("#241d16");
const WOOD_WORN = new THREE.Color("#140f0b");
const LIP_FRESH = new THREE.Color("#33291f");
const LIP_WORN = new THREE.Color("#221b14");

function tintByWear(mesh: THREE.InstancedMesh, wear: number[], fresh: THREE.Color, worn: THREE.Color) {
  const colour = new THREE.Color();
  wear.forEach((amount, i) => mesh.setColorAt(i, colour.lerpColors(fresh, worn, amount)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function buildBoardMeshes(
  slabMatrices: THREE.Matrix4[],
  lipMatrices: THREE.Matrix4[],
  slabWear: number[],
  lipWear: number[]
) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  const slabMaterial = new THREE.MeshPhongMaterial({ color: "#ffffff", shininess: 8, specular: "#1a140f" });
  const slab = new THREE.InstancedMesh(unitBox, slabMaterial, slabMatrices.length);
  slabMatrices.forEach((m, i) => slab.setMatrixAt(i, m));
  slab.instanceMatrix.needsUpdate = true;
  tintByWear(slab, slabWear, WOOD_FRESH, WOOD_WORN);

  // A worn unit's lip has lost its sheen as well as its colour: the front edge is the one
  // surface a hand actually touches.
  const lipMaterial = new THREE.MeshPhongMaterial({ color: "#ffffff", shininess: 20, specular: "#3a2f22" });
  const lip = new THREE.InstancedMesh(unitBox, lipMaterial, lipMatrices.length);
  lipMatrices.forEach((m, i) => lip.setMatrixAt(i, m));
  lip.instanceMatrix.needsUpdate = true;
  tintByWear(lip, lipWear, LIP_FRESH, LIP_WORN);

  return { slab, lip };
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
    <mesh ref={meshRef} position={position}>
      <planeGeometry args={[size.w, size.h]} />
      <meshPhongMaterial color={color} shininess={4} specular="#1a1714" />
    </mesh>
  );
}

/** How far a title travels out of the shelf at the peak of its turn, and how far it turns. */
const PULL_Z = 1.15;
const PULL_LIFT = 0.05;
const PULL_YAW = -0.5; // negative turns the face towards the camera, which stands to the left

/** The rest of the way round, so the back faces the room. Same sign as PULL_YAW — see
 * poseCase(). How fast it gets there, in turn-fractions per second, with reduced motion
 * arriving immediately instead. */
const TURN_YAW = -Math.PI;
const TURN_SPEED = 3.4;
/** Below this the back is edge-on or facing away, so there is nothing to draw. */
const TURN_VISIBLE = 0.02;

/** Head-height over the run and standing off its face, like a picture light on a wall unit.
 * The reach is short because the falloff is the whole effect: the neighbouring universes
 * are there, in the dark, and you travel to them rather than seeing them all at once. */
const LAMP_HEIGHT = -1.2;
const LAMP_Z = 4.0;
const LAMP_INTENSITY = 95;
const LAMP_REACH = 15;

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
const FOV = 42;
const VISIBLE_WIDTH = 6;
const HEIGHT_MARGIN = 3.4;

/** How close the camera may aim to the end of a unit before it stops following. */
const EDGE_MARGIN = 3.2;

/** How much taller than the case itself the frame should be when you are reading its back —
 * a little air, not a card jammed against the edges. */
const READ_MARGIN = 1.5;

/** How far back to stand to read one case's back: far enough that its whole height fits the
 * vertical field of view, and no further. */
function readingDistance(form: Form): number {
  return (DIMENSIONS[form].h * READ_MARGIN) / 2 / Math.tan((FOV / 2) * (Math.PI / 180));
}

/** A plane's own half-turn, so the back cover faces out of the back of the case instead of
 * into it. Constant, so it is built once rather than per frame. */
const FLIP_Y = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));

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
function poseCase(item: ShelfItem, amount: number, faceZ: number, turn: number, scaleZ: number): THREE.Matrix4 {
  const { matrix, quaternion, euler, position, scale, offset } = scratch;
  quaternion.setFromEuler(euler.set(0, PULL_YAW * amount + TURN_YAW * turn, 0));
  offset.set(0, 0, faceZ).applyQuaternion(quaternion);
  position.set(
    item.x + offset.x,
    item.y + PULL_LIFT * amount + offset.y,
    item.z + PULL_Z * amount + offset.z
  );
  return matrix.compose(position, quaternion, scale.set(1, 1, scaleZ));
}

/** The body: no face offset, and Z-scaled to carry its runtime. */
const poseBody = (item: ShelfItem, amount: number, turn: number) => poseCase(item, amount, 0, turn, item.ds);
/** The printed front. */
const poseCover = (item: ShelfItem, amount: number, turn: number) =>
  poseCase(item, amount, item.coverZ, turn, 1);

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
}: {
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
          ...buildMediumMeshes(row, texture, { texture: spineTexture, uvs }),
        };
      }),
    [layout, texture, spineAtlas, spineTexture]
  );
  const meshByForm = useMemo(() => new Map(mediumMeshes.map((m) => [m.form, m])), [mediumMeshes]);
  const boards = useMemo(
    () => buildBoardMeshes(layout.boardSlabMatrices, layout.boardLipMatrices, layout.boardSlabWear, layout.boardLipWear),
    [layout]
  );

  // The three titles with no artwork carry their own plane (see ShelfLayout.blankCovers); it
  // has to travel with the case, or a pulled case leaves its blank front behind on the shelf.
  const blankRefs = useRef(new Map<string, THREE.Mesh>());

  // Where the pointer went down, so a drag that ends over a case is not read as a click on
  // it. On touch the gesture that walks the shelf ends with a finger up over a case, and
  // without this guard every swipe opens a title page.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  const size = useThree((s) => s.size);
  const lamp = useRef<THREE.PointLight>(null);
  const posed = useRef<ShelfItem | null>(null);
  const backRef = useRef<THREE.Mesh>(null);
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
  }, [turnedItem, storyOrder, universe.label]);

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
  const standBack = useMemo(() => {
    const halfFov = Math.tan((FOV / 2) * (Math.PI / 180));
    const aspect = size.width / Math.max(size.height, 1);
    const heightFit = universe.height / 2 / halfFov + HEIGHT_MARGIN;
    const widthFit = VISIBLE_WIDTH / 2 / (halfFov * Math.max(aspect, 0.1));
    return Math.max(heightFit, widthFit);
  }, [universe, size]);

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

    // Ease the turn towards whatever the DOM button last asked for. Reduced motion arrives
    // rather than travels, exactly as the camera does.
    turn.current += ((turnedItem ? 1 : 0) - turn.current) * (instant ? 1 : Math.min(1, dt * TURN_SPEED));
    if (turn.current < 0.001) turn.current = 0;

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
        mesh.body.setMatrixAt(previous.instance, poseBody(previous, 0, 0));
        mesh.cover.setMatrixAt(previous.instance, poseCover(previous, 0, 0));
        mesh.body.instanceMatrix.needsUpdate = true;
        mesh.cover.instanceMatrix.needsUpdate = true;
        if (mesh.spine) {
          mesh.spine.setMatrixAt(previous.instance, poseBody(previous, 0, 0));
          mesh.spine.instanceMatrix.needsUpdate = true;
        }
      }
      blankRefs.current.get(previous.slug)?.position.set(previous.x, previous.y, previous.z + previous.coverZ);
    }

    const mesh = meshByForm.get(item.form);
    if (mesh) {
      mesh.body.setMatrixAt(item.instance, poseBody(item, amount, turn.current));
      mesh.cover.setMatrixAt(item.instance, poseCover(item, amount, turn.current));
      mesh.body.instanceMatrix.needsUpdate = true;
      mesh.cover.instanceMatrix.needsUpdate = true;
      // The spine is a face of the body, so it takes the body's pose exactly — including the
      // turn, which is what lets you read the spine of a case as it comes round.
      if (mesh.spine) {
        mesh.spine.setMatrixAt(item.instance, poseBody(item, amount, turn.current));
        mesh.spine.instanceMatrix.needsUpdate = true;
      }
    }
    const blank = blankRefs.current.get(item.slug);
    if (blank) {
      const m = poseCover(item, amount, turn.current);
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
        const m = poseCase(item, amount, -item.coverZ, turn.current, 1);
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
    const controls = state.controls as unknown as { target: THREE.Vector3; update: () => void } | null;

    if (controls) {
      const ease = instant ? 1 : Math.min(1, dt * 3.2);
      const reading = turn.current;
      // Horizontally the camera goes where the case is; vertically it only leans towards it.
      // Following y outright swings the view a whole unit's height as the walk steps down a
      // column, which throws the shelf into a corner of the frame — the case ends up centred
      // and the furniture it belongs to ends up off screen.
      // Browsing, the view leans towards the case; reading, it looks straight at it. A card
      // of small print two metres away on the top shelf is not something you can read, and
      // "turn it over and read the back" is the whole of this interaction — the first build
      // turned the case correctly and left it a thumbnail in the corner of the frame.
      const aimY = THREE.MathUtils.lerp(universe.centreY + (item.y - universe.centreY) * 0.2, item.y, reading);
      // ...and it stays inside the unit it is looking at. Aiming squarely at the first case
      // on a shelf points a third of the frame at the empty room beside it, which is what
      // arriving at every universe looked like; a case sitting off-centre with its own
      // bookcase filling the frame reads far better than one centred against a void.
      // ...and the same applies sideways: the edge margin exists so an end-of-shelf case is
      // not centred against an empty room, which is a framing rule for browsing and exactly
      // wrong for reading one card.
      const aimX = THREE.MathUtils.lerp(
        Math.min(
          Math.max(item.x, universe.startX + EDGE_MARGIN),
          Math.max(universe.endX - EDGE_MARGIN, universe.startX + EDGE_MARGIN)
        ),
        item.x,
        reading
      );
      const dx = (aimX - controls.target.x) * ease;
      const dy = (aimY - controls.target.y) * ease;
      controls.target.x += dx;
      controls.target.y += dy;
      camera.position.x += dx;
      camera.position.y += dy;
      controls.update();
      if (lamp.current) lamp.current.position.x = controls.target.x;
      // Dolly rather than jump: moving to a smaller unit walks the camera in towards it, and
      // turning a case over walks it in much further still — close enough to read the card,
      // measured off that form's own height rather than guessed, so a 197mm VHS clamshell and
      // a 171mm Blu-ray both fill the same amount of frame.
      const readZ = item.z + PULL_Z + readingDistance(item.form);
      camera.position.z += (THREE.MathUtils.lerp(standBack, readZ, reading) - camera.position.z) * ease;
    }
  });

  return (
    <>
      {/* Instance picking. R3F raycasts an InstancedMesh for us and puts the hit index on
          the event as `instanceId`; body and cover are built from the same title order, so
          either hit resolves through the medium's slug array. stopPropagation keeps a click
          that passes through a gap from also hitting the shelf behind it. */}
      {mediumMeshes.map(({ form, slugs, body, cover, spine }) => (
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
          <primitive object={body} />
          <primitive object={cover} />
          {/* Inside the picking group deliberately: clicking the spine of a case is clicking
              the case, and the spine shares the body's instance indices so it resolves through
              the same slug array. */}
          {spine && <primitive object={spine} />}
        </group>
      ))}
      <primitive object={boards.slab} />
      <primitive object={boards.lip} />
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
        ref={lamp}
        position={[universe.startX, LAMP_HEIGHT, LAMP_Z]}
        intensity={LAMP_INTENSITY}
        distance={LAMP_REACH}
        decay={1.5}
        color="#ffd9ad"
      />
    </>
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

/** Touch devices get no wheel and no hover, so one finger walks the shelf instead of
 * orbiting it — the shelf is the thing, and looking around is the desktop luxury. */
function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

/** Pixels of scroll per title. One flick of a trackpad brings out about two. */
const SCROLL_PER_TITLE = 260;

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
  const router = useRouter();
  const progress = useRef(0);
  const surface = useRef<HTMLDivElement>(null);

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
    () => universes.flatMap((u) => u.titles.map((t) => ({ slug: t.slug, label: t.label }))),
    [universes]
  );
  const shelf = layout.universes[Math.min(current, layout.universes.length - 1)];
  const groundWidth = Math.max(layout.bounds.maxX + 12, 20);

  // Measured off the room rather than assumed from LEVELS: the occupied volume runs from the
  // bottom board to the top of the tallest case standing on the top one, and the midpoint of
  // *that* is what keeps all four levels in frame.
  const wallCentreY = (layout.bounds.minY + layout.bounds.maxY) / 2;
  const cameraZ = (layout.bounds.maxY - layout.bounds.minY) / 2 / Math.tan((FOV / 2) * (Math.PI / 180)) + 3.4;

  const pick = useCallback((slug: string) => router.push(`/title/${slug}`), [router]);
  const reducedMotion = usePrefersReducedMotion();
  const coarsePointer = useCoarsePointer();
  const { progress: loaded } = useProgress();
  const [canDraw] = useState(webglSupported);

  const goToUniverse = useCallback(
    (index: number) => {
      const next = Math.min(Math.max(index, 0), layout.universes.length - 1);
      progress.current = 0;
      // You cannot carry a case you were reading to another bookcase.
      setTurned(false);
      setCurrent(next);
    },
    [layout]
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
      // Not while the viewer is typing somewhere, and not on top of a browser shortcut.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowDown") walk(0.5);
      else if (e.key === "ArrowUp") walk(-0.5);
      else if (e.key === "ArrowRight") goToUniverse(current + 1);
      else if (e.key === "ArrowLeft") goToUniverse(current - 1);
      else if (e.key === "Home") progress.current = 0;
      else if (e.key === "t" || e.key === "T") setTurned((was) => !was);
      else if (e.key === "Escape") setTurned(false);
      else return;
      e.preventDefault();
    }
    // Touch: a vertical drag walks the shelf, at roughly the distance the finger moved.
    // Held in a closure variable rather than state — it changes on every touchmove and
    // nothing renders differently for it.
    let lastTouchY: number | null = null;
    function onTouchStart(e: TouchEvent) {
      lastTouchY = e.touches[0]?.clientY ?? null;
    }
    function onTouchMove(e: TouchEvent) {
      const y = e.touches[0]?.clientY;
      if (y === undefined || lastTouchY === null) return;
      e.preventDefault();
      walk((lastTouchY - y) / SCROLL_PER_TITLE);
      lastTouchY = y;
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
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
    <div ref={surface} className="relative h-[62vh] w-full touch-none sm:h-[85vh]">
      <div className="flex flex-wrap items-baseline gap-3 px-6 pb-3">
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
      <Canvas
        // ponytail: no shadow maps. A shadow-casting light doubles every case draw call
        // (a depth pass over each InstancedMesh, same cost as the colour pass) for 152
        // instanced objects on the no-discrete-GPU laptop this is designed for, and this
        // harness renders through SwiftShader (software GL) -- upgrade path is a single
        // baked contact-shadow decal per level if a unit reads as floating without one.
        dpr={[1, 1.5]}
        // Looking along the shelf at an angle, not square at it: at ~35 degrees the cases
        // read as objects with depth rather than as flat posters, which is the entire reason
        // this is 3D. Far enough back to hold all four levels of a unit.
        camera={{ position: [-4.2, wallCentreY + 0.5, cameraZ], fov: FOV }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => gl.setClearColor("#14100d")}
      >
        {/* Fog in the background colour, as CaseScene.tsx does. With the lamp's falloff this
            is the second half of "no visible end": light stops reaching, then the air closes,
            and the neighbouring universes wait in the dark. */}
        <fog attach="fog" args={["#14100d", 13, 38]} />

        {/* A dim room, not a display case. The warm key is the lamp that travels with you,
            inside ShelfContent; what is left here is enough ambience that an unlit cover is
            dark rather than black, plus a cool fill for shape. */}
        <ambientLight intensity={0.12} color="#f0e4d2" />
        <directionalLight position={[3.4, 0.4, 1.2]} intensity={0.18} color="#b9c2cc" />

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
          />
          {/* Inside the boundary deliberately: React holds every child of a Suspense
              boundary back until every suspending call within it resolves, so this only
              mounts (and starts its timer) once the atlas texture -- and therefore the
              instanced meshes -- actually exist. Outside, its timer raced the texture
              load and once logged a bare "1 draw call" ground-plane-only frame. */}
          <PerfLogger />
        </Suspense>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[groundWidth / 2 - 6, layout.bounds.minY - 0.08, 0]}>
          <planeGeometry args={[groundWidth, 20]} />
          <meshPhongMaterial color="#1c1713" shininess={8} />
        </mesh>

        <OrbitControls
          makeDefault
          enableZoom={false}
          enableRotate={!coarsePointer}
          enablePan={!coarsePointer}
          target={[0, wallCentreY, 0]}
          minDistance={1.5}
          maxDistance={40}
        />
      </Canvas>
      {/* What you have just drawn off the shelf. The cover art alone does not say which
          season of Daredevil this is, nor what the object is — and 19 titles repeat. The note
          and the rest of the record stay on the title page: shipping 152 of them into this
          route's bundle would cost more than it tells you here. */}
      {active && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-8">
          {/* On an opaque scrim, not a translucent one: the caption sits over whatever
              artwork happens to be behind it, and at 85% over a bright cover the dim second
              line measured 3.16:1 — under the 4.5 floor. Measured, not eyeballed; the guard
              is in scripts/contrast.test.ts. */}
          {/* The scrim is pointer-events-none so it never eats a click meant for the shelf
              behind it; the one control inside it opts back in. */}
          <div className="pointer-events-auto flex flex-col items-center gap-1 rounded bg-shelf-dark px-5 py-2 text-center">
          <p className="font-display text-sm uppercase tracking-[0.16em] text-label-bright">{active.label}</p>
          <p className="text-xs text-label-dim">
            {order === "release" ? active.releaseYear : storyYearLabel(active.storyYear)} · {FORM_NAMES[active.form]} ·
            click to open
          </p>
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
