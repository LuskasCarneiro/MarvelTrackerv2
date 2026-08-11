"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { tintToHsl } from "@/lib/tint";
import atlasManifest from "../../../data/atlas.json";
import {
  DIMENSIONS,
  CORNER_RADIUS,
  BODY_MATERIAL,
  COVER_SHININESS,
  buildShelfLayout,
  type ShelfTitleData,
  type EraLabel,
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

// Mirrors --color-shelf-raised / --color-shelf-edge in globals.css. Not read live via
// getComputedStyle: three materials want plain colours, this file has no other reason to
// touch the DOM, and both values are contrast-checked in CI against their CSS source, so a
// commented, hardcoded mirror is simpler than a runtime dependency on layout timing.
const SHELF_RAISED = "#1c1713";
const SHELF_EDGE = "#2a231c";

/**
 * The technical crux (see the brief): an InstancedMesh shares one material, so which atlas
 * cell each instance's cover shows has to travel as a per-instance attribute (aCell, set on
 * the geometry in buildMediumMeshes) and be applied here rather than through the material's
 * own repeat/offset. Verbatim from the brief's shader recipe -- three 0.185 names the
 * varying vMapUv, not vUv, and #include <map_fragment> only exists once material.map is set.
 */
function createCoverMaterial(map: THREE.Texture, shininess: number): THREE.MeshPhongMaterial {
  const material = new THREE.MeshPhongMaterial({ map, shininess, specular: new THREE.Color("#6b6259") });
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

type MediumRow = {
  medium: ShelfTitleData["medium"];
  bodyMatrices: THREE.Matrix4[];
  coverMatrices: THREE.Matrix4[];
  coverUvs: CellUv[];
};

/** One InstancedMesh for the case body, one for the cover -- two draw calls per medium,
 * regardless of how many titles that medium contributes to the run. */
function buildMediumMeshes(row: MediumRow, coverTexture: THREE.Texture) {
  const dims = DIMENSIONS[row.medium];
  const count = row.bodyMatrices.length;

  const bodyGeometry = new RoundedBoxGeometry(dims.w, dims.h, dims.d, 2, CORNER_RADIUS);
  const bm = BODY_MATERIAL[row.medium];
  const bodyMaterial = new THREE.MeshPhongMaterial({ color: bm.color, shininess: bm.shininess, specular: bm.specular });
  const body = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);
  row.bodyMatrices.forEach((m, i) => body.setMatrixAt(i, m));
  body.instanceMatrix.needsUpdate = true;

  // Shrunk off the true face size the same amount the spike shrinks its poster plane, so
  // the printed insert sits within the moulded corner radius instead of poking past it.
  const coverGeometry = new THREE.PlaneGeometry(dims.w - CORNER_RADIUS * 0.6, dims.h - CORNER_RADIUS * 0.6);
  const cellData = new Float32Array(count * 4);
  row.coverUvs.forEach((uv, i) => cellData.set([uv.u0, uv.v0, uv.du, uv.dv], i * 4));
  coverGeometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(cellData, 4));
  const coverMaterial = createCoverMaterial(coverTexture, COVER_SHININESS[row.medium]);
  const cover = new THREE.InstancedMesh(coverGeometry, coverMaterial, count);
  row.coverMatrices.forEach((m, i) => cover.setMatrixAt(i, m));
  cover.instanceMatrix.needsUpdate = true;

  return { body, cover };
}

/** Both boards (the slab and its brighter front lip) are one InstancedMesh each across all
 * five rows -- a unit box, scaled per instance, same trick as the case bodies' thickness. */
function buildBoardMeshes(slabMatrices: THREE.Matrix4[], lipMatrices: THREE.Matrix4[]) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  const slabMaterial = new THREE.MeshPhongMaterial({ color: SHELF_RAISED, shininess: 8, specular: "#1a140f" });
  const slab = new THREE.InstancedMesh(unitBox, slabMaterial, slabMatrices.length);
  slabMatrices.forEach((m, i) => slab.setMatrixAt(i, m));
  slab.instanceMatrix.needsUpdate = true;

  const lipMaterial = new THREE.MeshPhongMaterial({ color: SHELF_EDGE, shininess: 20, specular: "#3a2f22" });
  const lip = new THREE.InstancedMesh(unitBox, lipMaterial, lipMatrices.length);
  lipMatrices.forEach((m, i) => lip.setMatrixAt(i, m));
  lip.instanceMatrix.needsUpdate = true;

  return { slab, lip };
}

type Layout = ReturnType<typeof buildShelfLayout>;

function BlankCover({
  position,
  tint,
  size,
}: {
  position: readonly [number, number, number];
  tint: string;
  size: { w: number; h: number };
}) {
  // = CaseScene.tsx's spine colour, exactly: setHSL, never Color.setStyle() (see tint.ts --
  // three's string parser silently returns white for this project's space-separated hsl()).
  const color = useMemo(() => {
    const { h, s, l } = tintToHsl(tint);
    return new THREE.Color().setHSL(h, s, l);
  }, [tint]);

  return (
    <mesh position={position}>
      <planeGeometry args={[size.w, size.h]} />
      <meshPhongMaterial color={color} shininess={4} specular="#1a1714" />
    </mesh>
  );
}

function ShelfContent({ layout, onPick }: { layout: Layout; onPick: (slug: string) => void }) {
  const texture = useTexture(ATLAS_PATH, (t) => {
    const map = Array.isArray(t) ? t[0] : t;
    // Without this the atlas renders washed out -- three decodes to linear otherwise.
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
  });

  const mediumMeshes = useMemo(
    () => layout.media.map((row) => ({ medium: row.medium, slugs: row.slugs, ...buildMediumMeshes(row, texture) })),
    [layout, texture]
  );

  const boards = useMemo(() => buildBoardMeshes(layout.boardSlabMatrices, layout.boardLipMatrices), [layout]);

  return (
    <>
      {/* Instance picking. R3F raycasts an InstancedMesh for us and puts the hit index on
          the event as `instanceId`; body and cover are built from the same title order, so
          either hit resolves through the row's slug array. stopPropagation keeps a click
          that passes through a gap from also hitting the row behind it. Pointer events on
          an InstancedMesh cost a raycast per move, which is why the cursor change lives on
          the group rather than on 152 separate objects. */}
      {mediumMeshes.map(({ medium, slugs, body, cover }) => (
        <group
          key={medium}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (e.instanceId === undefined) return;
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
        </group>
      ))}
      <primitive object={boards.slab} />
      <primitive object={boards.lip} />
      {layout.blankCovers.map((blank) => (
        <BlankCover
          key={blank.slug}
          position={[blank.position.x, blank.position.y, blank.position.z]}
          tint={blank.tint}
          size={blank.size}
        />
      ))}
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
 * Travel, and the lamp that travels with you.
 *
 * The run is ~50 units long and orbiting is no way to cross it, so the era buttons and the
 * arrow keys set one focus point and this eases the camera to it. It moves the camera and
 * the orbit target by the *same* delta, which preserves the framing angle and the zoom the
 * viewer chose — jumping the target alone swings the camera round the wall and loses the
 * aisle view the default framing exists to give.
 *
 * The lamp rides along at the focus. docs/05-3d-shelf.md §2: the infinite feeling comes from
 * light with real falloff, not from looping the geometry, which would lie — 1977 must not
 * follow 2026. A fixed lamp cannot do that job on a run this long; travel would simply take
 * you out of the light and leave the far end evenly dim.
 */
function CameraRig({ focus }: { focus: { x: number; y: number } }) {
  const camera = useThree((s) => s.camera);
  // makeDefault on OrbitControls publishes it here; typed loosely because R3F's default
  // controls slot is a union across every controls implementation.
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  const delta = useRef(new THREE.Vector3());
  const lamp = useRef<THREE.PointLight>(null);

  useFrame((_, dt) => {
    if (lamp.current) {
      // Eased on x only: the lamp is a fixture in the room, at a fixed height and a fixed
      // distance off the shelf face, and only the section it stands over changes.
      lamp.current.position.x += (focus.x - lamp.current.position.x) * Math.min(1, dt * 3.5);
    }
    if (!controls) return;
    delta.current.set(focus.x - controls.target.x, focus.y - controls.target.y, 0);
    if (delta.current.lengthSq() < 1e-6) return;
    delta.current.multiplyScalar(Math.min(1, dt * 3.5));
    controls.target.add(delta.current);
    camera.position.add(delta.current);
    controls.update();
  });

  return (
    <pointLight
      ref={lamp}
      position={[focus.x, LAMP_HEIGHT, LAMP_Z]}
      intensity={LAMP_INTENSITY}
      distance={LAMP_REACH}
      decay={1.5}
      color="#ffd9ad"
    />
  );
}

/** Head-height over the run and standing off its face, like a picture light on a wall unit.
 * The reach is deliberately short — about eight columns each way — because the falloff is
 * the whole effect: travel far enough and what you came from is genuinely dark. */
const LAMP_HEIGHT = -1.2;
const LAMP_Z = 4.0;
const LAMP_INTENSITY = 95;
const LAMP_REACH = 15;

const HOME_X = 9;
const STEP_X = 2.8; // ~2 columns per arrow press

export default function ShelfScene({ titles, eras }: { titles: ShelfTitleData[]; eras: EraLabel[] }) {
  const layout = useMemo(() => buildShelfLayout(titles, atlasCells, CELL_SIZE, ATLAS_SIZE), [titles]);
  const groundWidth = Math.max(layout.bounds.maxX + 12, 20);
  const router = useRouter();

  // Measured off the run rather than assumed from LEVELS: the occupied volume runs from the
  // bottom board to the top of the tallest case standing on the top one, and the midpoint of
  // *that* is what keeps all four levels in frame. Deriving it from the level pitch alone
  // aims at the middle of the boards, which sits a case-height too low and crops the top row.
  const wallCentreY = (layout.bounds.minY + layout.bounds.maxY) / 2;
  const wallHeight = layout.bounds.maxY - layout.bounds.minY;
  // Far enough back that the full height fits at this fov, with a little air.
  const cameraZ = (wallHeight / 2) / Math.tan((42 / 2) * (Math.PI / 180)) + 2.5;
  const homeFocus = useMemo(() => ({ x: HOME_X, y: wallCentreY }), [wallCentreY]);
  const [focus, setFocus] = useState(homeFocus);

  const pick = useCallback((slug: string) => router.push(`/title/${slug}`), [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const dx = e.key === "ArrowRight" ? STEP_X : e.key === "ArrowLeft" ? -STEP_X : 0;
      const dy = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
      if (!dx && !dy && e.key !== "Home") return;
      e.preventDefault();
      setFocus((f) => {
        if (e.key === "Home") return homeFocus;
        if (dx) return { ...f, x: Math.min(layout.bounds.maxX, Math.max(0, f.x + dx)) };
        return { ...f, y: Math.min(layout.bounds.maxY, Math.max(layout.bounds.minY, f.y + dy)) };
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout]);

  // The era's own name, from catalogue.ts, against the x where that era begins. Eras are
  // landmarks along one run now, not rows to select, so these travel rather than jump levels.
  const landmarks = layout.landmarks.map((l) => ({
    ...l,
    label: eras.find((e) => e.medium === l.medium)?.label ?? l.medium,
  }));

  return (
    <div className="h-[85vh] w-full">
      <div className="flex flex-wrap gap-2 px-6 pb-3">
        {landmarks.map((landmark) => (
          <button
            key={landmark.medium}
            type="button"
            onClick={() => setFocus({ x: landmark.startX + 2, y: wallCentreY })}
            className="rounded border border-shelf-edge px-3 py-1 font-display text-xs uppercase tracking-[0.12em] text-label-mid hover:text-label-bright"
          >
            {landmark.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFocus(homeFocus)}
          className="rounded border border-shelf-edge px-3 py-1 font-display text-xs uppercase tracking-[0.12em] text-label-dim hover:text-label-bright"
        >
          Reset view
        </button>
      </div>
      <Canvas
        // ponytail: no shadow maps. A shadow-casting light doubles every case draw call
        // (a depth pass over each InstancedMesh, same cost as the colour pass) for 152
        // instanced objects on the no-discrete-GPU laptop this is designed for, and this
        // harness renders through SwiftShader (software GL) -- upgrade path is a single
        // baked contact-shadow decal per level if the run reads as floating without one.
        dpr={[1, 1.5]}
        // Looking down the run at an angle, not square at it.
        //
        // The first framing sat almost on the wall normal — about 10 degrees off — and every
        // case read as a flat poster. That throws away the entire reason this is 3D: you
        // could not see that a VHS clamshell is chunky and a Blu-ray case is thin, nor that
        // thickness varies with runtime, because none of the depth faced the camera. At ~35
        // degrees the run recedes like a video shop aisle and the objects read as objects.
        //
        // Far enough back to hold all four levels: the era change is a vertical band sweeping
        // the full height, and framing one shelf at a time would hide the one thing the
        // column-major layout exists to show.
        camera={{ position: [HOME_X - 5.5, wallCentreY + 0.7, cameraZ], fov: 42 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => gl.setClearColor("#14100d")}
      >
        {/* Fog in the background colour, as CaseScene.tsx does. With the lamp's falloff this
            is the second half of "no visible end": light stops reaching, then the air closes. */}
        <fog attach="fog" args={["#14100d", 13, 38]} />

        {/* A dim room, not a display case. The warm key is now the travelling lamp in
            CameraRig; what is left here is enough ambience that an unlit cover is dark rather
            than black, plus a cool fill for shape -- not --color-tungsten, which is the colour
            of chrome drawn in lamplight, not the lamp itself. */}
        <ambientLight intensity={0.12} color="#f0e4d2" />
        <directionalLight position={[3.4, 0.4, 1.2]} intensity={0.18} color="#b9c2cc" />

        <Suspense fallback={null}>
          <ShelfContent layout={layout} onPick={pick} />
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

        <OrbitControls makeDefault target={[homeFocus.x, homeFocus.y, 0]} minDistance={1.5} maxDistance={40} />
        <CameraRig focus={focus} />
      </Canvas>
    </div>
  );
}
