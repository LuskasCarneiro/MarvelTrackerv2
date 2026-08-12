import { tmdbImage, type Title } from "./catalogue";

/**
 * The canonical origin. One constant rather than an env var: this archive has exactly one
 * public home, Vercel preview builds should not advertise themselves as canonical, and a
 * wrong `metadataBase` is the kind of fault that only shows up in somebody else's link
 * preview weeks later.
 */
export const SITE_URL = "https://marvel-trackerv2.vercel.app";

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/**
 * The image a shared link should show. A backdrop is the right shape for a link preview
 * (roughly 16:9); a poster is not, but it beats nothing, and three titles have neither.
 * `w1280` rather than `original` because a link preview is not a wallpaper and some
 * scrapers give up on multi-megabyte images.
 */
export function shareImage(title: Title): string | null {
  const backdrop = title.backdrops[0];
  if (backdrop) return tmdbImage(backdrop, "w1280");
  return title.poster ? tmdbImage(title.poster, "w780") : null;
}

/**
 * Schema.org for one title, as JSON-LD.
 *
 * **Only facts go in here.** The medium is worked out from the release year by a fixed rule
 * and is not verified title by title, so it is not asserted; there are no ratings to
 * aggregate, so `aggregateRating` is absent rather than invented; and the note is the owner's
 * own writing, which is what `description` is for and nothing more. Structured data is a
 * claim made to a machine that will repeat it, and this project's stated rule is that the UI
 * must not present derived things as facts.
 */
export function titleJsonLd(title: Title): Record<string, unknown> {
  const image = shareImage(title);
  return {
    "@context": "https://schema.org",
    "@type": title.kind === "film" ? "Movie" : "TVSeries",
    name: title.displayTitle,
    url: absoluteUrl(`/title/${title.slug}`),
    ...(title.note ? { description: title.note } : {}),
    ...(image ? { image } : {}),
    // A four-digit year is a valid ISO 8601 date, and it is all this catalogue knows — a
    // fabricated month and day would be a claim it cannot support.
    datePublished: String(title.releaseYear),
    ...(title.runtimeMin ? { timeRequired: `PT${title.runtimeMin}M` } : {}),
    ...(title.season !== null ? { seasonNumber: title.season } : {}),
    inLanguage: "en",
  };
}
