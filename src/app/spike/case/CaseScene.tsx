"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { tintToHsl } from "@/lib/tint";

// A real Amaray is 190 × 135 × 14 mm. 1 unit = 100 mm.
//
// The proportions are the single biggest factor in whether this reads as a DVD case rather
// than a generic box, and depth is the one people notice: a case even slightly too thick
// immediately looks like a book. So these are the real measurements, not eyeballed ones.
const W = 1.35;
const H = 1.9;
const D = 0.14;
const CORNER = 0.04; // ~4 mm, the moulded radius on the outer edges

// The printed insert sits under a clear sleeve, so it is genuinely a separate layer a
// fraction of a millimetre proud of the body — not a texture painted onto the box.
const INSET = 0.0015;

/**
 * Fill a face with a texture without distorting it: match the width and crop the overflow
 * centrally. TMDB posters are 2:3; a DVD face is 135:190. Close, but stretching a poster by
 * 6% is exactly the kind of thing that reads as "off" without anyone being able to say why.
 */
function coverFit(texture: THREE.Texture, faceAspect: number) {
  const image = texture.image as { width: number; height: number };
  const textureAspect = image.width / image.height;
  if (textureAspect > faceAspect) {
    texture.repeat.set(faceAspect / textureAspect, 1);
    texture.offset.set((1 - faceAspect / textureAspect) / 2, 0);
  } else {
    texture.repeat.set(1, textureAspect / faceAspect);
    texture.offset.set(0, (1 - textureAspect / faceAspect) / 2);
  }
}

function Case({ posterUrl, tint }: { posterUrl: string; tint: string }) {
  // Configured in useTexture's own callback rather than in an effect or a memo: it runs
  // once on load, and setting up a texture is a side effect that has no business inside a
  // hook that is supposed to be pure.
  const poster = useTexture(posterUrl, (texture) => {
    const map = Array.isArray(texture) ? texture[0] : texture;
    // Without this the artwork renders washed out — three decodes to linear otherwise.
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    coverFit(map, W / H);
  });

  // setHSL rather than a colour string: three's string parser silently returns white for
  // the CSS Color 4 form every tint in data/artwork.json uses. See tintToHsl.
  const spineColour = useMemo(() => {
    const { h, s, l } = tintToHsl(tint);
    return new THREE.Color().setHSL(h, s, l);
  }, [tint]);

  return (
    // Turned so the spine comes toward the viewer. A case shot square-on is a poster; the
    // depth and the spine are the whole reason this is 3D at all.
    <group rotation={[0, 0.5, 0]}>
      {/* The case body: opaque moulded polypropylene, nearly black, faintly glossy. */}
      <RoundedBox args={[W, H, D]} radius={CORNER} smoothness={4} castShadow receiveShadow>
        <meshPhongMaterial color="#15120f" shininess={55} specular="#3a332b" />
      </RoundedBox>

      {/* The front cover, under the sleeve. Phong with a tight specular is what gives the
          plastic-over-print look: the highlight sits on top of the artwork rather than in
          it. This is the press.stripe.com finding under test — Phong, not Physical. */}
      <mesh position={[0, 0, D / 2 + INSET]}>
        <planeGeometry args={[W - CORNER * 0.6, H - CORNER * 0.6]} />
        <meshPhongMaterial map={poster} shininess={95} specular="#6b6259" />
      </mesh>

      {/* The spine, carrying the title's own extracted colour. */}
      <mesh position={[-W / 2 - INSET, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[D - CORNER * 0.5, H - CORNER * 0.6]} />
        <meshPhongMaterial color={spineColour} shininess={80} specular="#57504a" />
      </mesh>
    </group>
  );
}

export default function CaseScene({ posterUrl, tint }: { posterUrl: string; tint: string }) {
  return (
    <div className="h-[78vh] w-full">
      <Canvas
        shadows
        // Far enough back that the whole case fits with air around it. At 1.9 units tall it
        // needs ~4.4 units of distance at this fov; closer than that and the frame crops the
        // object being judged.
        camera={{ position: [0.15, 0.6, 4.4], fov: 32 }}
        gl={{ antialias: true }}
        // The room, not a product studio: the ground is the page's own colour.
        onCreated={({ gl }) => gl.setClearColor("#14100d")}
      >
        {/*
          One warm lamp — but warm-*white*, not the tungsten token.

          The first pass lit this with `--color-tungsten` (#E8A94E) at high intensity, on the
          reasoning that tungsten is the room's lamp. Light multiplies the texture, so the
          artwork came out uniformly sepia and X2's blue-steel poster was unrecognisable. The
          token is correct for chrome *drawn* in the lamp's colour; it is far too saturated
          to be the light itself. A real tungsten bulb is much closer to white than its
          reputation, and the warmth should be visible in the highlights, not painted over
          everything.
        */}
        {/* Fog in the background colour is what turns a floating plane into a room: without
            it the ground runs to a hard horizon line across the frame. */}
        <fog attach="fog" args={["#14100d", 4.2, 11]} />

        <ambientLight intensity={0.55} color="#f0e4d2" />
        <directionalLight
          position={[-2.2, 3.0, 3.2]}
          intensity={1.5}
          color="#ffd9ad"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-normalBias={0.02}
          // A directional light's shadow camera defaults to a 10-unit box. This scene is
          // about two units across, so the default spreads the depth map thin and the
          // contact shadow comes out faint and soft-edged. Tightened to the subject.
          shadow-camera-left={-2.5}
          shadow-camera-right={2.5}
          shadow-camera-top={2.5}
          shadow-camera-bottom={-2.5}
          shadow-camera-near={0.5}
          shadow-camera-far={12}
        />
        {/* A dim, cooler bounce from the opposite side so the shadow face is readable and
            the edge of the case separates from the background. */}
        <directionalLight position={[3.4, 0.4, 1.2]} intensity={0.45} color="#b9c2cc" />

        <Suspense fallback={null}>
          <Case posterUrl={posterUrl} tint={tint} />
        </Suspense>

        {/* The shelf it stands on. A contact shadow is a large part of whether an object
            looks like it is in a place rather than floating in a void. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -H / 2 - 0.01, 0]} receiveShadow>
          <planeGeometry args={[14, 14]} />
          <meshPhongMaterial color="#1c1713" shininess={8} />
        </mesh>

        <OrbitControls enablePan={false} minDistance={1.4} maxDistance={5} target={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
