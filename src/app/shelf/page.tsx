import { titles } from "@/lib/catalogue";
import ShelfSceneClient from "./ShelfSceneClient";
import type { UniverseData } from "./instancing";

// A Server Component, deliberately -- see src/app/page.tsx's ShelfRow for the same call.
// Only the fields the 3D scene actually draws with cross the client boundary; a Client
// Component that imported "@/lib/catalogue" directly would pull all 152 notes, backdrops and
// TMDB ids into this route's browser bundle for a scene that draws with none of them (see
// docs/06-progress.md, "Prop or import, it still ships").
//
// One shelf unit per universe, standing side by side in one room, each chronological within
// itself -- so a unit still ages along its own length (the MCU's runs DVD to Blu-ray to
// steelbook to nothing-physical) while the room as a whole is browsable by universe.
const order = new Map<string, UniverseData>();
for (const title of [...titles].sort((a, b) => a.releaseYear - b.releaseYear || a.title.localeCompare(b.title))) {
  const universe = order.get(title.universe) ?? { key: title.universe, label: title.universeName, titles: [] };
  universe.titles.push({
    slug: title.slug,
    runtimeMin: title.runtimeMin,
    tint: title.tint,
    medium: title.medium,
    releaseYear: title.releaseYear,
    storyYear: title.storyYear,
  });
  order.set(title.universe, universe);
}

// Biggest first, so the shelf you land on is the one with the most on it.
const universes: UniverseData[] = [...order.values()].sort((a, b) => b.titles.length - a.titles.length);

// Spike, not a feature yet -- see CLAUDE.md / AGENTS.md.
export default function ShelfPage() {
  return (
    <main className="min-h-screen bg-shelf-dark">
      <div className="px-6 py-4">
        <h1 className="font-display text-xs uppercase tracking-[0.2em] text-label-dim">
          The shelf — Phase 3
        </h1>
        <p className="mt-1 text-sm text-label-mid">
          One shelf per universe, four levels tall. Scroll or swipe to draw a title out of the
          shelf and put it back; the arrows move to the next universe.{" "}
          <span className="hidden sm:inline">Drag to look around, and click a case to open it.</span>
        </p>
      </div>
      <ShelfSceneClient universes={universes} />
    </main>
  );
}
