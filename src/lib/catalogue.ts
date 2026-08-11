import titlesJson from '../../data/titles.json';
import notesJson from '../../data/notes-en.json';
import sourceJson from '../../data/v1-source.json';
import artworkJson from '../../data/artwork.json';
import { titleTint } from './tint';
import { storyYear } from './chronology';

export type Medium = 'vhs' | 'amaray' | 'bluray' | 'steel' | 'none';
export type Kind = 'film' | 'series';

export type Title = {
  slug: string;
  title: string;
  /**
   * What to print on the spine and the case. 19 titles repeat across the catalogue —
   * Agents of S.H.I.E.L.D. appears seven times — so a bare title puts four identical
   * labels next to each other on one shelf. A real boxset spine carries the season, and
   * so does this one.
   */
  displayTitle: string;
  kind: Kind;
  universe: string;
  universeName: string;
  releaseYear: number;
  season: number | null;
  chrono: string;
  /**
   * `chrono` as a sortable year, for the shelf's story ordering — null for the 14 titles
   * that have no place on a timeline, which is deliberate. See lib/chronology.ts.
   */
  storyYear: number | null;
  runtimeMin: number | null;
  medium: Medium;
  tmdbId: number;
  /** The owner's hand-written note, translated into UK English. */
  note: string;
  /**
   * The title's own colour: hue taken from its poster, saturation and lightness set by the
   * room and by contrast. See docs/02-design-system.md. Three unreleased titles have no
   * artwork on TMDB and fall back to the deterministic hash.
   */
  tint: string;
  /** TMDB CDN paths, not URLs — build one with `tmdbImage()`. Null where none exists. */
  poster: string | null;
  backdrops: string[];
  logo: string | null;
};

type ArtworkEntry = {
  poster: string | null;
  backdrops: string[];
  logo: string | null;
  tint: string;
  sourceColour: string | null;
  contrast: number;
};

const artwork: Record<string, ArtworkEntry> = artworkJson;

/**
 * Artwork is served from TMDB's public CDN, which needs no API key, rather than committed
 * to this repo — see docs/03-data-pipeline.md. `next.config.ts` allows exactly this host
 * and path prefix.
 */
export function tmdbImage(path: string, size: string): string {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export type Shelf = {
  medium: Medium;
  /** What the object was, e.g. "VHS clamshell". Presentational only. */
  label: string;
  /** Rendered span of the titles actually on this shelf, e.g. "1986 – 1996". */
  years: string;
  titles: Title[];
};

/**
 * The eras, in order. The medium is derived from release year BY RULE — it is not
 * verified per title, and the UI must not present it as a fact about a specific release.
 * See docs/02-design-system.md.
 */
const SHELVES: { medium: Medium; label: string }[] = [
  { medium: 'vhs', label: 'VHS clamshell' },
  { medium: 'amaray', label: 'DVD Amaray' },
  { medium: 'bluray', label: 'Blu-ray case' },
  { medium: 'steel', label: 'Steelbook' },
  { medium: 'none', label: 'No physical release' },
];

const notes: Record<string, string> = notesJson.notes;
const universeNames: Record<Kind, Record<string, string>> = {
  film: notesJson.filmUniverses,
  series: notesJson.seriesUniverses,
};

/**
 * `chrono` is user-facing copy and most of it is bare years, but 17 of the 152 carry a
 * written phrase that was still in Portuguese — "Natal de 2013", "pouco antes do estalar".
 * Only the phrases are mapped; a year or a "c. 2004" is already correct in English.
 *
 * titles.json holds the facts as extracted and matched; notes-en.json holds the English
 * copy layer. Translating here keeps that split rather than mutating the facts file.
 */
const chronoEn: Record<string, string> = notesJson.chrono;

/**
 * titles.json carries no prose — the notes live separately and join on the original
 * title string, which is why v1's titles were verified unique before this was written.
 * Series records reuse a title across seasons, so the note is shared by design.
 */
function sourceKeyFor(record: (typeof titlesJson)[number]): string {
  const source = [...sourceJson.films, ...sourceJson.series].find(
    (s) => s.r === record.releaseYear && (s.t === record.title || s.t.startsWith(record.title))
  );
  return source?.t ?? record.title;
}

export const titles: Title[] = titlesJson.map((r) => {
  const kind = r.kind as Kind;
  const medium = r.medium as Medium;
  const art = artwork[r.slug];
  const chrono = chronoEn[r.chrono] ?? r.chrono;
  return {
    ...r,
    kind,
    displayTitle: r.season === null ? r.title : `${r.title} · Series ${r.season}`,
    medium,
    universeName: universeNames[kind][r.universe] ?? r.universe,
    chrono,
    storyYear: storyYear(chrono),
    note: notes[sourceKeyFor(r)] ?? '',
    tint: art?.tint ?? titleTint(r.slug, medium),
    poster: art?.poster ?? null,
    backdrops: art?.backdrops ?? [],
    logo: art?.logo ?? null,
  };
});

const bySlug = new Map(titles.map((t) => [t.slug, t]));

export function getTitle(slug: string): Title | undefined {
  return bySlug.get(slug);
}

/** Chronological within a shelf, so scrolling a shelf moves forward through time. */
export const shelves: Shelf[] = SHELVES.map(({ medium, label }) => {
  const onShelf = titles
    .filter((t) => t.medium === medium)
    .sort((a, b) => a.releaseYear - b.releaseYear || a.title.localeCompare(b.title));

  const years = onShelf.length
    ? `${onShelf[0].releaseYear} – ${onShelf[onShelf.length - 1].releaseYear}`
    : '';

  return { medium, label, years, titles: onShelf };
}).filter((s) => s.titles.length > 0);

/**
 * Spine width in pixels, encoding runtime. Deliberately not the true 7% width:height
 * ratio of a real case — at this height that is a few pixels and no type fits in it.
 * The encoding is exaggerated so it stays legible; the ordering and the relative
 * differences are what carry the meaning. See docs/02-design-system.md.
 *
 * Unreleased titles have no runtime and get the narrowest spine rather than a fabricated
 * width, which reads honestly as "nothing here yet".
 */
export function spineWidth(runtimeMin: number | null): number {
  if (runtimeMin === null) return 18;
  return Math.round(Math.min(Math.max(runtimeMin / 3.5, 22), 64));
}
