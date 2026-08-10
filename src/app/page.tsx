import { shelves, spineWidth } from "@/lib/catalogue";
import ShelfWall, { type ShelfRow } from "./ShelfWall";

// A Server Component, deliberately. The wall itself needs to be interactive — it marks the
// titles you have watched — but the catalogue must not follow it into the browser, so only
// the four fields a spine actually draws with cross the boundary. See ShelfWall's Spine
// type for the measurement behind that.
const rows: ShelfRow[] = shelves.map((shelf) => ({
  medium: shelf.medium,
  label: shelf.label,
  years: shelf.years,
  spines: shelf.titles.map((title) => ({
    slug: title.slug,
    name: title.displayTitle,
    tint: title.tint,
    width: spineWidth(title.runtimeMin),
  })),
}));

export default function Home() {
  return (
    // A shelf wall wants the width of the room. Constraining this to a reading measure
    // hid two thirds of the catalogue behind a horizontal scrollbar on a 1440px screen,
    // which is the one thing the layout exists to avoid. Prose below stays narrow.
    <main className="mx-auto w-full max-w-[110rem] px-6 py-16">
      <header className="mb-16">
        <h1
          className="font-display text-4xl text-label-bright uppercase"
          style={{ fontVariationSettings: '"wdth" 84, "wght" 700' }}
        >
          Marvel Tracker
        </h1>
        <p className="mt-3 max-w-prose text-lg text-label-mid">
          Every film and series, on the shelf it shipped on.
        </p>
      </header>

      <ShelfWall rows={rows} />

      <p className="mt-16 max-w-prose text-sm text-label-dim">
        Medium — VHS, DVD, Blu-ray, steelbook or none — is worked out from each release&rsquo;s
        year by a fixed rule, not verified title by title.
      </p>
    </main>
  );
}
