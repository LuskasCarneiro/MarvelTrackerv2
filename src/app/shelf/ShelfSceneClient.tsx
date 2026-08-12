"use client";

import dynamic from "next/dynamic";
import type { UniverseData } from "./instancing";

// three.js belongs to this route alone. `ssr: false` because WebGL needs a canvas that
// does not exist on the server, and next/dynamic's docs are explicit that ssr:false has to
// be called from a Client Component -- a Server Component importing a Client Component
// this way does not code-split. Same pattern as the case spike's CaseSpikeClient.tsx.
const ShelfScene = dynamic(() => import("./ShelfScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[85vh] items-center justify-center text-sm text-label-dim">
      Building the shelf…
    </div>
  ),
});

export default function ShelfSceneClient({ universes }: { universes: UniverseData[] }) {
  return <ShelfScene universes={universes} />;
}
