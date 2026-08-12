import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { shareImage, titleJsonLd } from "@/lib/seo";
import Image from "next/image";
import { getTitle, shelves, titles, tmdbImage } from "@/lib/catalogue";
import RatingControl from "./RatingControl";

export function generateStaticParams() {
  return titles.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/title/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const title = getTitle(slug);
  if (!title) return {};

  const image = shareImage(title);
  const description = title.note || `${title.displayTitle} (${title.releaseYear}) in the Marvel Tracker archive.`;

  return {
    title: title.displayTitle,
    description,
    alternates: { canonical: `/title/${title.slug}` },
    openGraph: {
      type: title.kind === "film" ? "video.movie" : "video.tv_show",
      url: `/title/${title.slug}`,
      title: title.displayTitle,
      description,
      // A backdrop is the shape a link preview wants; a poster is not, but it beats nothing.
      ...(image ? { images: [{ url: image, alt: `Artwork for ${title.displayTitle}` }] } : {}),
    },
  };
}

export default async function TitlePage({ params }: PageProps<"/title/[slug]">) {
  const { slug } = await params;
  const title = getTitle(slug);
  if (!title) notFound();

  const tint = title.tint;
  // Reuses the label already computed for the shelf this title sits on, rather than
  // keeping a second copy of the medium -> label mapping that could drift from it.
  const mediumLabel = shelves.find((s) => s.medium === title.medium)?.label ?? title.medium;

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      {/* Structured data, carrying facts only: no medium (worked out by rule, not verified
          per title) and no aggregateRating (there is nothing to aggregate). A claim made to a
          machine is a claim that gets repeated. See lib/seo.ts. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(titleJsonLd(title)) }}
      />
      <Link
        href="/"
        className="font-display text-xs uppercase tracking-[0.15em] text-label-dim transition duration-200 hover:text-tungsten"
        style={{ fontVariationSettings: '"wdth" 100, "wght" 500' }}
      >
        <span aria-hidden="true">&larr; </span>Back to the shelf
      </Link>

      {/* The back of the case: tinted throughout from this title's own colour. */}
      <article className="mt-8" style={{ "--tint": tint } as React.CSSProperties}>
        <h1
          className="font-display text-3xl text-label-bright"
          style={{ fontVariationSettings: '"wdth" 88, "wght" 700' }}
        >
          {title.displayTitle}
        </h1>

        {/* The strip of stills a real back cover carries. Decorative: the synopsis below
            says everything these say, so they are hidden from assistive tech rather than
            given invented alt text. Backdrops are chosen textless by the pipeline.
            Three titles are unreleased and have no artwork — they keep the tokened
            placeholder, which should read as "nothing yet", not as a broken image. */}
        <div aria-hidden="true" className="mt-8 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => {
            const backdrop = title.backdrops[i];
            return (
              <div
                key={i}
                className={`relative aspect-video overflow-hidden rounded-sm ${
                  // The dashed edge is the "nothing here yet" state. Drawing it around a
                  // filled image reads as a border someone forgot to remove.
                  backdrop ? "" : "border border-dashed border-label-dim/40"
                }`}
                style={{
                  background: "color-mix(in oklab, var(--tint) 12%, var(--color-shelf-raised))",
                }}
              >
                {backdrop && (
                  <Image
                    src={tmdbImage(backdrop, "w780")}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 33vw, 300px"
                    className="object-cover"
                    priority={i === 0}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-[2fr_1fr]">
          <div>
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-label-dim">
              Synopsis
            </h2>
            <p className="font-prose mt-3 text-lg leading-relaxed text-label-bright">
              {title.note}
            </p>
          </div>

          <div className="border-t border-shelf-edge pt-6 md:border-t-0 md:pt-0">
            <h2 className="sr-only">Details</h2>
            <dl>
              <DataRow
                label="Runtime"
                value={title.runtimeMin !== null ? `${title.runtimeMin} min` : null}
              />
              <DataRow label="Year" value={String(title.releaseYear)} />
              <DataRow label="Universe" value={title.universeName} />
              <DataRow label="Chronology" value={title.chrono} />
              <DataRow label="Medium" value={mediumLabel} />
            </dl>
          </div>
        </div>

        <RatingControl slug={title.slug} />

        {/* The barcode strip: decorative bars plus real text, like the back of a case. */}
        <footer className="mt-10 flex items-center justify-between gap-6 border-t border-shelf-edge pt-6">
          <div
            aria-hidden="true"
            className="h-8 w-32 shrink-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--color-label-bright) 0 2px, transparent 2px 4px, var(--color-label-mid) 4px 5px, transparent 5px 8px, var(--color-label-bright) 8px 9px, transparent 9px 11px, var(--color-label-mid) 11px 13px, transparent 13px 17px)",
            }}
          />
          <p
            className="font-display text-right text-xs uppercase tracking-[0.2em] text-label-dim"
            style={{ fontVariationSettings: '"wdth" 92, "wght" 600' }}
          >
            Marvel Tracker Archive
          </p>
        </footer>
      </article>

      <p className="mt-10 max-w-prose text-sm text-label-dim">
        Medium is worked out from this release&rsquo;s year by a fixed rule, not verified
        title by title.
      </p>
    </main>
  );
}

function DataRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-shelf-edge py-2.5 first:pt-0 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-label-dim">{label}</dt>
      <dd className="data-figure text-label-bright">
        {value ?? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not available</span>
          </>
        )}
      </dd>
    </div>
  );
}
