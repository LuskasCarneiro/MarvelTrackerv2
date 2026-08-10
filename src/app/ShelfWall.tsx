"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * What a spine needs to be drawn, and nothing else.
 *
 * This narrowing is load-bearing, not tidiness. Everything a Client Component touches
 * crosses into the browser — as bundle if imported, as RSC payload if passed as a prop —
 * and a whole `Title` drags the synopsis, the backdrop paths and the rest of the catalogue
 * join with it. Importing `shelves` here directly pulled all four data JSON files into the
 * client bundle: +137 KB uncompressed, +40 KB over the wire, for a tick on a spine.
 *
 * Measured, not guessed. If this type grows, measure it again.
 */
export type Spine = {
  slug: string;
  /** Already disambiguated with the series number where a title repeats. */
  name: string;
  tint: string;
  /** Pixels. Encodes runtime; computed on the server so the formula stays there. */
  width: number;
};

export type ShelfRow = {
  medium: string;
  label: string;
  years: string;
  spines: Spine[];
};

export default function ShelfWall({ rows }: { rows: ShelfRow[] }) {
  const [watched, setWatched] = useState<ReadonlySet<string>>(new Set());

  // One subscription and one query for the whole wall, rather than one per shelf. Gated on
  // there being a session at all, so a signed-out visitor never touches the entries table
  // and the shelf renders exactly as it did before accounts existed.
  useEffect(() => {
    const supabase = createClient();
    let fetched = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (fetched || !session) return;
      fetched = true;
      supabase
        .from("entries")
        .select("slug")
        .eq("watched", true)
        .then(({ data: rows, error }) => {
          if (error) {
            // Nothing here is worth blocking the catalogue for: the shelf is public and
            // complete without it, so a failure loses the ticks and keeps the page.
            console.error(error.message);
            return;
          }
          setWatched(new Set((rows ?? []).map((r: { slug: string }) => r.slug)));
        });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="space-y-14">
      {rows.map((shelf, i) => {
        const headingId = `shelf-${shelf.medium}`;
        return (
          <section
            key={shelf.medium}
            className="relative px-6 pt-8 pb-6"
            aria-labelledby={headingId}
          >
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
                {shelf.spines.length} titles
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
                {shelf.spines.map((spine) => (
                  <SpineItem key={spine.slug} spine={spine} watched={watched.has(spine.slug)} />
                ))}
              </ul>
            </div>
            <div className="mt-6 h-px w-full bg-shelf-edge" />
          </section>
        );
      })}
    </div>
  );
}

function SpineItem({ spine, watched }: { spine: Spine; watched: boolean }) {
  return (
    <li className="shrink-0" style={{ width: `${spine.width}px` }}>
      {/* Spine width encodes runtime, unlabelled. The visible label below is vertical,
          compressed and uppercase (.spine-label is presentational only); this link's
          accessible name is the plain title text in the DOM. */}
      <Link
        href={`/title/${spine.slug}`}
        className="relative block h-72 w-full overflow-hidden rounded-[2px] transition duration-200 hover:-translate-y-1 hover:shadow-[0_0_20px_-4px_var(--tint)] focus-visible:-translate-y-1 focus-visible:shadow-[0_0_20px_-4px_var(--tint)]"
        style={
          {
            "--tint": spine.tint,
            // 12% is the design doc's ratio for tinted *chrome*, where the tint is a hint
            // behind an interface. A spine is not chrome — it stands in for the artwork
            // and is the only thing distinguishing one title from its neighbour. At 12%
            // a whole shelf renders as identical dark bars. The tint itself is already
            // muted (see lib/tint.ts), so it can be mixed strongly without shouting.
            background: "color-mix(in oklab, var(--tint) 78%, var(--color-shelf-raised))",
          } as React.CSSProperties
        }
      >
        {watched && (
          // A filled disc — a shape, not a colour shift — so the mark survives the spine's
          // own per-title tint and never relies on colour alone. Opaque, so it stays
          // legible whatever happens to be underneath it.
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full border border-shelf-dark bg-tungsten text-[10px] leading-none text-shelf-dark"
          >
            ✓
          </span>
        )}
        <span className="spine-label block h-full py-3 text-center text-[10px] text-label-bright">
          {spine.name}
          {watched && <span className="sr-only"> — watched</span>}
        </span>
      </Link>
    </li>
  );
}
