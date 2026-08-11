import { getTitle, tmdbImage } from "@/lib/catalogue";
import CaseSpikeClient from "./CaseSpikeClient";

// Spike, not a feature — see CLAUDE.md / AGENTS.md. Answers one question: does a
// procedurally generated Amaray case read as a physical object, and does the
// press.stripe.com Phong + shader-injection approach reproduce? Not linked from
// anywhere in the app, and named so nobody mistakes it for product surface.
const SLUG = "x2-x-men-united-2003";

export default function CaseSpikePage() {
  // Reuses the same join `/title/[slug]` reads from, rather than re-importing
  // data/artwork.json directly — this is the real pipeline (titles.json + artwork.json
  // merged in src/lib/catalogue.ts), not a second copy of it built for this page.
  const title = getTitle(SLUG);
  if (!title || !title.poster) {
    throw new Error(`Spike: no artwork for "${SLUG}" in data/artwork.json`);
  }

  return (
    <main className="min-h-screen bg-shelf-dark">
      <div className="px-6 py-4">
        <h1 className="font-display text-xs uppercase tracking-[0.2em] text-label-dim">
          Spike — not a feature
        </h1>
        <p className="mt-1 text-sm text-label-mid">
          {title.displayTitle} ({title.releaseYear}) as one procedurally generated DVD
          Amaray case. Cover art and tint both come from data/artwork.json.
        </p>
      </div>
      <CaseSpikeClient posterUrl={tmdbImage(title.poster, "w780")} tint={title.tint} />
    </main>
  );
}
