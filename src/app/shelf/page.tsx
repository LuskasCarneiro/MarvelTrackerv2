import { shelves } from "@/lib/catalogue";
import ShelfSceneClient from "./ShelfSceneClient";
import type { ShelfRowData } from "./instancing";

// A Server Component, deliberately -- see src/app/page.tsx's ShelfRow for the same call.
// Only the four fields the 3D scene actually draws with cross the client boundary; a
// Client Component that imported "@/lib/catalogue" directly would pull all 152 notes,
// backdrops and TMDB ids into this route's browser bundle for a scene that draws with
// none of them (see docs/06-progress.md, "Prop or import, it still ships").
const rows: ShelfRowData[] = shelves.map((shelf) => ({
  medium: shelf.medium,
  label: shelf.label,
  titles: shelf.titles.map((title) => ({
    slug: title.slug,
    runtimeMin: title.runtimeMin,
    tint: title.tint,
  })),
}));

// Spike, not a feature yet -- see CLAUDE.md / AGENTS.md. Phase 3's first real increment:
// the whole catalogue, on shelves, in 3D, in the conventions src/app/spike/case/CaseScene.tsx
// already proved out. Full navigation (pulling a case, camera fly-to) is a later increment;
// this one is look-and-orbit only.
export default function ShelfPage() {
  return (
    <main className="min-h-screen bg-shelf-dark">
      <div className="px-6 py-4">
        <h1 className="font-display text-xs uppercase tracking-[0.2em] text-label-dim">
          The shelf — Phase 3
        </h1>
        <p className="mt-1 text-sm text-label-mid">
          All 152 titles, five eras, one instanced draw call per medium for the case body and
          another for the cover. Drag to orbit, scroll to zoom, arrow keys to travel the
          shelves. Click a case to open it.
        </p>
      </div>
      <ShelfSceneClient rows={rows} />
    </main>
  );
}
