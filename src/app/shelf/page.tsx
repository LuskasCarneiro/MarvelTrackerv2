import { shelves, titles } from "@/lib/catalogue";
import ShelfSceneClient from "./ShelfSceneClient";
import type { EraLabel, ShelfTitleData } from "./instancing";

// A Server Component, deliberately -- see src/app/page.tsx's ShelfRow for the same call.
// Only the four fields the 3D scene actually draws with cross the client boundary; a
// Client Component that imported "@/lib/catalogue" directly would pull all 152 notes,
// backdrops and TMDB ids into this route's browser bundle for a scene that draws with
// none of them (see docs/06-progress.md, "Prop or import, it still ships").
//
// One continuous run, release order end to end -- not five era bins. The medium changes
// underfoot as the years pass, which is the whole idea (docs/05-3d-shelf.md §1). Sorted by
// the same rule the DOM shelves use, so the two orders never disagree.
const run: ShelfTitleData[] = [...titles]
  .sort((a, b) => a.releaseYear - b.releaseYear || a.title.localeCompare(b.title))
  .map((title) => ({
    slug: title.slug,
    runtimeMin: title.runtimeMin,
    tint: title.tint,
    medium: title.medium,
  }));

// The era names, for the landmark buttons. catalogue.ts owns this copy.
const eras: EraLabel[] = shelves.map((shelf) => ({ medium: shelf.medium, label: shelf.label }));

// Spike, not a feature yet -- see CLAUDE.md / AGENTS.md. Phase 3's structural increment:
// the whole catalogue as one continuous run you travel along, in the conventions
// src/app/spike/case/CaseScene.tsx already proved out. Pull-and-turn is a later increment.
export default function ShelfPage() {
  return (
    <main className="min-h-screen bg-shelf-dark">
      <div className="px-6 py-4">
        <h1 className="font-display text-xs uppercase tracking-[0.2em] text-label-dim">
          The shelf — Phase 3
        </h1>
        <p className="mt-1 text-sm text-label-mid">
          All 152 titles in one run, oldest to newest, four shelves tall — the medium changes
          as the years pass. Drag to orbit, scroll to zoom, arrow keys to travel. Click a case
          to open it.
        </p>
      </div>
      <ShelfSceneClient titles={run} eras={eras} />
    </main>
  );
}
