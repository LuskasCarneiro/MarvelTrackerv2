import Link from "next/link";
import { shelves, spineWidth, type Title } from "@/lib/catalogue";
import { titleTint } from "@/lib/tint";

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

      <div className="space-y-14">
        {shelves.map((shelf, i) => {
          const headingId = `shelf-${shelf.medium}`;
          return (
            <section key={shelf.medium} className="relative px-6 pt-8 pb-6" aria-labelledby={headingId}>
              {/* The one animated moment in the app: light pools fade up in sequence,
                  top shelf first. Purely decorative, so it's hidden from assistive tech
                  and never affects the content's own opacity. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 animate-[shelf-lights-up_400ms_ease-out_both]"
                style={{ backgroundImage: "var(--light-pool)", animationDelay: `${i * 80}ms` }}
              />

              <div className="mb-6 flex items-baseline justify-between gap-4">
                <span className="data-figure shrink-0 whitespace-nowrap text-xs text-label-dim">
                  {shelf.years}
                </span>
                <h2
                  id={headingId}
                  className="min-w-0 flex-1 text-center font-display text-xs tracking-[0.2em] text-label-mid uppercase"
                  style={{ fontVariationSettings: '"wdth" 100, "wght" 500' }}
                >
                  {shelf.label}
                </h2>
                <span className="data-figure shrink-0 whitespace-nowrap text-xs text-label-dim">
                  {shelf.titles.length} titles
                </span>
              </div>

              {/* Up to ~40 spines on a shelf: this row scrolls inside itself so the page
                  body never scrolls sideways. tabIndex + a label make it reachable and
                  operable from the keyboard, not just by mouse drag or trackpad. */}
              <div
                tabIndex={0}
                role="group"
                aria-labelledby={headingId}
                className="overflow-x-auto overscroll-x-contain [mask-image:linear-gradient(to_right,black_calc(100%-4rem),transparent)]"
              >
                <ul className="flex items-end gap-1 pb-1">
                  {shelf.titles.map((title) => (
                    <Spine key={title.slug} title={title} />
                  ))}
                </ul>
              </div>
              <div className="mt-6 h-px w-full bg-shelf-edge" />
            </section>
          );
        })}
      </div>

      <p className="mt-16 max-w-prose text-sm text-label-dim">
        Medium — VHS, DVD, Blu-ray, steelbook or none — is worked out from each release&rsquo;s
        year by a fixed rule, not verified title by title.
      </p>
    </main>
  );
}

function Spine({ title }: { title: Title }) {
  const tint = titleTint(title.slug, title.medium);
  return (
    <li className="shrink-0" style={{ width: `${spineWidth(title.runtimeMin)}px` }}>
      {/* Spine width encodes runtime, unlabelled. The visible label below is vertical,
          compressed and uppercase (.spine-label is presentational only); this link's
          accessible name is the plain title text in the DOM. */}
      <Link
        href={`/title/${title.slug}`}
        className="block h-72 w-full overflow-hidden rounded-[2px] transition duration-200 hover:-translate-y-1 hover:shadow-[0_0_20px_-4px_var(--tint)] focus-visible:-translate-y-1 focus-visible:shadow-[0_0_20px_-4px_var(--tint)]"
        style={
          {
            "--tint": tint,
            // 12% is the design doc's ratio for tinted *chrome*, where the tint is a hint
            // behind an interface. A spine is not chrome — it stands in for the artwork
            // and is the only thing distinguishing one title from its neighbour. At 12%
            // a whole shelf renders as identical dark bars. The tint itself is already
            // muted (see lib/tint.ts), so it can be mixed strongly without shouting.
            background: "color-mix(in oklab, var(--tint) 78%, var(--color-shelf-raised))",
          } as React.CSSProperties
        }
      >
        <span className="spine-label block h-full py-3 text-center text-[10px] text-label-bright">
          {title.displayTitle}
        </span>
      </Link>
    </li>
  );
}
