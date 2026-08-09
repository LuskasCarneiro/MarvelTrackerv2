// Placeholder shelf. Proves the design tokens render before the real, data-driven
// catalogue is built on top of them. Replaced once data/titles.json lands.
const DEMO = [
  { title: "Howard the Duck", runtime: 110, tint: "#8C6A3F" },
  { title: "The Punisher", runtime: 89, tint: "#6B2B24" },
  { title: "Captain America", runtime: 97, tint: "#3B5C7A" },
  { title: "Blade", runtime: 120, tint: "#5A2733" },
  { title: "Blade II", runtime: 117, tint: "#43303F" },
  { title: "Hulk", runtime: 138, tint: "#4A6033" },
  { title: "Daredevil", runtime: 103, tint: "#6E2A2A" },
  { title: "Elektra", runtime: 97, tint: "#77463A" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16">
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

      <section
        className="relative rounded-sm px-6 pt-8 pb-6"
        style={{ backgroundImage: "var(--light-pool)" }}
      >
        <div className="mb-6 flex items-baseline justify-between">
          <span
            className="font-display text-xs tracking-[0.2em] text-label-dim uppercase"
            style={{ fontVariationSettings: '"wdth" 100, "wght" 500' }}
          >
            1986 – 1996 · VHS clamshell
          </span>
          <span className="data-figure text-xs text-label-dim">
            {DEMO.length} titles
          </span>
        </div>

        {/* Spine width encodes runtime. Nothing is labelled; you just feel it. */}
        <ul className="flex items-end gap-1">
          {DEMO.map((t) => (
            <li key={t.title}>
              <a
                href="#"
                className="block h-72 overflow-hidden rounded-[2px] transition-transform duration-200 hover:-translate-y-1 focus-visible:-translate-y-1"
                style={
                  {
                    "--tint": t.tint,
                    // Runtime as width. A true-to-life 7% width:height ratio is
                    // physically correct and too thin to set type in, so the encoding
                    // is exaggerated to stay legible. Legibility wins; the ordering
                    // and the relative differences are what carry the meaning.
                    width: `${Math.round(t.runtime / 3.5)}px`,
                    background:
                      "color-mix(in oklab, var(--tint) 62%, var(--color-shelf-raised))",
                  } as React.CSSProperties
                }
              >
                <span className="spine-label block h-full py-3 text-center text-[10px] text-label-bright">
                  {t.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-6 h-px w-full bg-shelf-edge" />
      </section>

      <p className="mt-16 max-w-prose text-label-mid">
        The first film based on a Marvel comic to reach cinemas. An alien duck is torn
        from his home planet and lands in Cleveland. A legendary flop at the time, a cult
        object now.
      </p>
    </main>
  );
}
