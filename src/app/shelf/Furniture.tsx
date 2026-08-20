"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * The room's furniture — the owner's own models, supplied as `.glb`.
 *
 * `docs/08-future-developments.md` describes the pipeline this follows, and two of its rules
 * are the ones that matter here:
 *
 * **The owner is not asked to check scale.** glTF's spec says one unit is one metre and
 * exporters routinely ignore it; all three of these came out of Sketchfab in **centimetres**,
 * which is why a sofa measured 219 rather than 2.19. The scene works in units of 100mm, so a
 * centimetre model is scaled by 0.1 — read off the bounding box here rather than guessed, and
 * written down so the next model that arrives in the wrong unit is a one-line change.
 *
 * **Nor is the owner asked to optimise.** These arrived at 9.6 MB and ship at 1.74 MB, entirely
 * by re-encoding textures to WebP and quantising positions (`gltf-transform optimize`). Meshes
 * are quantised rather than Draco-compressed on purpose: quantisation needs no decoder, where
 * Draco fetches a WASM decoder from a CDN that this page's CSP would refuse.
 */

const SOFA = "/models/sofa.glb";
const RUG = "/models/rug.glb";
const PUFF = "/models/puff.glb";

/** Centimetres to scene units: the scene is 1 unit = 100mm, so a cm model divides by ten. */
const CM = 0.1;

/**
 * The puff arrived in no identifiable unit at all — about 18 across — and with its origin
 * *inside* the mesh rather than on its base, so it needs both a size chosen by eye against a
 * real footstool and a lift to put it on the floor.
 */
const PUFF_SCALE = 0.26;
const PUFF_LIFT = 9.93 * PUFF_SCALE;

/** A 3m x 5.2m rug in a room a little under 4m across: halved, so it reads as a rug in a room
 *  rather than as fitted carpet. */
const RUG_SCALE = 0.5;

function Piece({
  url,
  position,
  rotation = 0,
  scale,
}: {
  url: string;
  position: [number, number, number];
  rotation?: number;
  scale: number;
}) {
  const { scene } = useGLTF(url);
  // Cloned per placement: the same sofa stands twice, and two <primitive>s pointing at one
  // object would move the second on top of the first rather than drawing two.
  const object = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      // Receives, does not cast. Casting from the furniture put the screenshot harness over
      // its budget under software GL, and a sofa's own shadow is the least of what sells this
      // room — the cabinets' shadows on the plaster are doing that work already.
      child.castShadow = false;
      child.receiveShadow = true;

      // **Re-shaded from PBR to Phong, for two reasons that were both predicted.**
      //
      // `docs/08-future-developments.md` warned that PBR models would arrive looking flat
      // because this scene has no environment map, and a `MeshStandardMaterial` with nothing
      // to reflect is a dull grey object.
      //
      // And PBR costs far more per fragment than Phong. Two sofas filling the lower half of a
      // 1440x900 frame took the screenshot harness from comfortably inside its budget to over
      // it — and that is a real cost for real viewers, not only for the instrument. The rest
      // of this scene has been Phong throughout; the furniture was the one thing asking the
      // GPU to run a different, heavier shading model for no gain it could actually show.
      const source = child.material;
      if (source instanceof THREE.MeshStandardMaterial) {
        child.material = new THREE.MeshPhongMaterial({
          map: source.map,
          color: source.color,
          // Fabric, leather and wool: a broad, weak highlight, never a polished one.
          shininess: 8,
          specular: new THREE.Color("#2b2723"),
        });
        source.dispose();
      }
    });
  }, [object]);

  return <primitive object={object} position={position} rotation={[0, rotation, 0]} scale={scale} />;
}

/**
 * Where the furniture stands, derived from the room rather than typed in — the room sizes
 * itself to its contents, so anything fixed here would drift the moment a universe grows.
 */
export default function Furniture({ room }: { room: { halfWidth: number; depth: number } }) {
  // Forward of the middle, toward the viewer. Sat at 0.46 the sofa backs cut across the back
  // wall cabinet at exactly the height its posters start; brought forward they fall lower in
  // frame and the cabinets read over them, which is how the reference is composed.
  const z = room.depth * 0.66;
  // Clear of the cabinets, which are 175mm deep with cases standing proud of them.
  const inset = room.halfWidth - 8;

  return (
    <group>
      <Piece url={RUG} position={[0, 0.02, z]} scale={RUG_SCALE} />
      {/* Facing each other across the rug, as they do in the reference. */}
      <Piece url={SOFA} position={[-inset, 0, z]} rotation={Math.PI / 2} scale={CM} />
      <Piece url={SOFA} position={[inset, 0, z]} rotation={-Math.PI / 2} scale={CM} />
      <Piece url={PUFF} position={[0, PUFF_LIFT, z - 3]} scale={PUFF_SCALE} />
    </group>
  );
}

// Fetched as soon as this module is, rather than when the component first renders — the room
// is already up by then and a sofa popping in is worse than a sofa arriving late.
useGLTF.preload(SOFA);
useGLTF.preload(RUG);
useGLTF.preload(PUFF);
