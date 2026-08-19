import type { Metadata } from "next";
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
    label: title.displayTitle,
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

export const metadata: Metadata = {
  title: "The shelf in 3D",
  description:
    "All 152 Marvel films and series as home-video releases on twelve shelves, one per universe. Scroll to draw a title off the shelf.",
  alternates: { canonical: "/shelf" },
  openGraph: {
    url: "/shelf",
    title: "The shelf in 3D · Marvel Tracker",
    description:
      "All 152 Marvel films and series as home-video releases on twelve shelves, one per universe.",
  },
};

// Spike, not a feature yet -- see CLAUDE.md / AGENTS.md.
export default function ShelfPage() {
  return (
    <main className="flex h-dvh flex-col bg-shelf-dark">
      {/* The title and the catalogue link moved into ShelfScene, so that every piece of this
          route's chrome is one floating element with one reveal (§12 Q4/Q21) rather than a
          Server Component and a Client Component stacked above the room and guessing at each
          other's heights. */}
      <ShelfSceneClient universes={universes} />
    </main>
  );
}
