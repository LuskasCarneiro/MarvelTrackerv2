"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
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
  type ShelfRowData,
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
  medium: ShelfRowData["medium"];
  bodyMatrices: THREE.Matrix4[];
  coverMatrices: THREE.Matrix4[];
  coverUvs: CellUv[];
};

/** One InstancedMesh for the case body, one for the cover -- two draw calls per medium,
 * regardless of how many titles are on that shelf. */
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

function ShelfContent({ layout }: { layout: Layout }) {
  const texture = useTexture(ATLAS_PATH, (t) => {
    const map = Array.isArray(t) ? t[0] : t;
    // Without this the atlas renders washed out -- three decodes to linear otherwise.
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
  });

  const mediumMeshes = useMemo(
    () => layout.media.map((row) => ({ medium: row.medium, ...buildMediumMeshes(row, texture) })),
    [layout, texture]
  );

  const boards = useMemo(() => buildBoardMeshes(layout.boardSlabMatrices, layout.boardLipMatrices), [layout]);

  return (
    <>
      {mediumMeshes.map(({ medium, body, cover }) => (
        <group key={medium}>
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

export default function ShelfScene({ rows }: { rows: ShelfRowData[] }) {
  const layout = useMemo(() => buildShelfLayout(rows, atlasCells, CELL_SIZE, ATLAS_SIZE), [rows]);
  const groundWidth = Math.max(layout.bounds.maxX + 6, 20);

  return (
    <div className="h-[85vh] w-full">
      <Canvas
        // ponytail: no shadow maps. A shadow-casting light doubles every case draw call
        // (a depth pass over each InstancedMesh, same cost as the colour pass) for 152
        // instanced objects on the no-discrete-GPU laptop this is designed for, and this
        // harness renders through SwiftShader (software GL) -- upgrade path is a single
        // baked contact-shadow decal per row if the wall reads as floating without one.
        dpr={[1, 1.5]}
        // Looking down the rows at an angle, not square at them.
        //
        // The first framing sat almost on the wall normal — about 10 degrees off — and every
        // case read as a flat poster. That throws away the entire reason this is 3D: you
        // could not see that a VHS clamshell is chunky and a Blu-ray case is thin, nor that
        // thickness varies with runtime, because none of the depth faced the camera. At ~40
        // degrees the rows recede like a video shop aisle and the objects read as objects.
        //
        // Rows are 7/13/16/50/66 titles, so this is a readable section rather than the whole
        // wall; OrbitControls explores the rest.
        camera={{ position: [-1.6, 1.1, 6.4], fov: 42 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => gl.setClearColor("#14100d")}
      >
        {/* Fog in the background colour, as CaseScene.tsx does -- it's what keeps the far
            end of a 90-unit-wide catalogue from reading as a hard-edged void. */}
        <fog attach="fog" args={["#14100d", 7, 26]} />

        {/* Warm-white key + dim cool fill, straight from CaseScene.tsx -- not
            --color-tungsten, which is the colour of chrome drawn in lamplight, not the
            lamp itself; using it as a light source drowns every cover in sepia. */}
        <ambientLight intensity={0.55} color="#f0e4d2" />
        <directionalLight position={[-2.2, 3.0, 3.2]} intensity={1.5} color="#ffd9ad" />
        <directionalLight position={[3.4, 0.4, 1.2]} intensity={0.45} color="#b9c2cc" />

        <Suspense fallback={null}>
          <ShelfContent layout={layout} />
          {/* Inside the boundary deliberately: React holds every child of a Suspense
              boundary back until every suspending call within it resolves, so this only
              mounts (and starts its timer) once the atlas texture -- and therefore the
              instanced meshes -- actually exist. Outside, its timer raced the texture
              load and once logged a bare "1 draw call" ground-plane-only frame. */}
          <PerfLogger />
        </Suspense>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[groundWidth / 2 - 3, layout.bounds.minY - 0.08, 0]}>
          <planeGeometry args={[groundWidth, 20]} />
          <meshPhongMaterial color="#1c1713" shininess={8} />
        </mesh>

        <OrbitControls target={[5.2, -0.9, 0]} minDistance={1.5} maxDistance={40} />
      </Canvas>
    </div>
  );
}
