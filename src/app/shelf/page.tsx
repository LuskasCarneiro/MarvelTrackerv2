import type { Metadata } from "next";
import Link from "next/link";
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
    <main className="min-h-screen bg-shelf-dark">
      <div className="px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-display text-xs uppercase tracking-[0.2em] text-label-dim">
            The shelf — Phase 3
          </h1>
          {/* The honest accessible equivalent of a WebGL canvas is not an aria-label, it is
              the same 152 titles as text. That page exists; this is a link to it, for anyone
              who cannot use the room and for anyone who would simply rather read. */}
          <Link href="/" className="text-sm text-label-mid underline hover:text-label-bright">
            Browse the same titles as a catalogue
          </Link>
        </div>
        <p className="mt-1 text-sm text-label-mid">
          One shelf per universe, each as tall as its collection needs. Scroll or swipe to draw a title out of the
          shelf and put it back; the arrows move to the next universe. Turn a case over to read its back, or stand back to see the whole shelf.{" "}
          <span className="hidden sm:inline">Drag to look around, and click a case to open it.</span>
        </p>
      </div>
      <ShelfSceneClient universes={universes} />
    </main>
  );
}
