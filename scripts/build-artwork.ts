// Artwork pipeline. Reads data/titles.json (152 records, already matched and audited —
// read-only, never written here), fetches each title's TMDB images, picks a poster / up
// to three textless backdrops / a logo, downloads the poster at w342 to extract its
// dominant meaningful colour, and conditions that colour into the room's
// saturation/lightness range (the same table as src/lib/tint.ts). Writes:
//   - data/artwork.json   keyed by slug: { poster, backdrops, logo, tint, sourceColour, contrast }
//
// Images are never committed — only TMDB CDN paths and the derived colour. See docs/PLAN.md.
//
// Run: node --env-file=.env --experimental-strip-types scripts/build-artwork.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const TITLES_PATH = resolve(ROOT, 'data/titles.json');
const OUT_PATH = resolve(ROOT, 'data/artwork.json');

const TMDB_READ_TOKEN = process.env.TMDB_READ_TOKEN;
if (!TMDB_READ_TOKEN) {
  throw new Error('TMDB_READ_TOKEN is not set. Run with --env-file=.env.');
}

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

type Kind = 'film' | 'series';
type Medium = 'vhs' | 'amaray' | 'bluray' | 'steel' | 'none';

// Only the fields this pipeline reads. titles.json carries more (title, universe, ...)
// but this script has no business knowing about them.
interface TitleRecord {
  slug: string;
  kind: Kind;
  season: number | null;
  medium: Medium;
  tmdbId: number;
}

interface TmdbImage {
  file_path: string;
  iso_639_1: string | null;
  vote_average?: number;
  vote_count?: number;
}

interface TmdbImagesResponse {
  posters?: TmdbImage[];
  backdrops?: TmdbImage[];
  logos?: TmdbImage[];
}

interface ArtworkRecord {
  poster: string | null;
  backdrops: string[];
  logo: string | null;
  tint: string;
  sourceColour: string | null;
  contrast: number;
}

// ---------------------------------------------------------------------------
// small utilities (mirrors scripts/build-data.ts — no libraries needed for these)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// TMDB client — small concurrency, 429 backoff, never logs the token
// ---------------------------------------------------------------------------

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

async function tmdbFetch(path: string): Promise<unknown> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(TMDB_BASE + path, { headers: { Authorization: `Bearer ${TMDB_READ_TOKEN}` } });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt) * 1000);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
    return res.json();
  }
  throw new Error(`TMDB kept rate-limiting: ${path}`);
}

// Movie/show images are requested once per unique tmdbId and cached by promise (not just
// by value), so the up-to-5 concurrent workers processing e.g. seven Agents of S.H.I.E.L.D.
// seasons that share one show id don't all fire the same request before the first resolves.
const movieImagesCache = new Map<number, Promise<TmdbImagesResponse | null>>();
function getMovieImages(tmdbId: number): Promise<TmdbImagesResponse | null> {
  let p = movieImagesCache.get(tmdbId);
  if (!p) {
    p = tmdbFetch(`/movie/${tmdbId}/images`) as Promise<TmdbImagesResponse | null>;
    movieImagesCache.set(tmdbId, p);
  }
  return p;
}

const showImagesCache = new Map<number, Promise<TmdbImagesResponse | null>>();
function getShowImages(tmdbId: number): Promise<TmdbImagesResponse | null> {
  let p = showImagesCache.get(tmdbId);
  if (!p) {
    p = tmdbFetch(`/tv/${tmdbId}/images`) as Promise<TmdbImagesResponse | null>;
    showImagesCache.set(tmdbId, p);
  }
  return p;
}

// Each (tmdbId, season) pair belongs to exactly one title record (checked by
// scripts/data.test.ts), so this one is never called twice for the same pair.
function getSeasonImages(tmdbId: number, season: number): Promise<{ posters?: TmdbImage[] } | null> {
  return tmdbFetch(`/tv/${tmdbId}/season/${season}/images`) as Promise<{ posters?: TmdbImage[] } | null>;
}

// ---------------------------------------------------------------------------
// picking images — see docs in the task: prefer en, then textless; rank by vote
// ---------------------------------------------------------------------------

function voteOf(img: TmdbImage): [number, number] {
  return [img.vote_average ?? 0, img.vote_count ?? 0];
}

function rankDesc(a: TmdbImage, b: TmdbImage): number {
  const [aAvg, aCount] = voteOf(a);
  const [bAvg, bCount] = voteOf(b);
  return aAvg !== bAvg ? bAvg - aAvg : bCount - aCount;
}

function bestByVote(images: TmdbImage[]): TmdbImage | null {
  if (images.length === 0) return null;
  return [...images].sort(rankDesc)[0];
}

/** English first, textless second, nothing else. Anything genuinely missing is null. */
function pickPoster(images: TmdbImage[] = []): string | null {
  const en = images.filter((i) => i.iso_639_1 === 'en');
  const pool = en.length > 0 ? en : images.filter((i) => i.iso_639_1 === null);
  return bestByVote(pool)?.file_path ?? null;
}

/** Textless only — these are the ones that work as a stills strip. Up to three. */
function pickBackdrops(images: TmdbImage[] = [], count = 3): string[] {
  const textless = images.filter((i) => i.iso_639_1 === null);
  return [...textless].sort(rankDesc).slice(0, count).map((i) => i.file_path);
}

/** English .png only — logos have transparency; .svg does not composite the same way. */
function pickLogo(images: TmdbImage[] = []): string | null {
  const pool = images.filter((i) => i.iso_639_1 === 'en' && i.file_path.toLowerCase().endsWith('.png'));
  return bestByVote(pool)?.file_path ?? null;
}

// ---------------------------------------------------------------------------
// colour — HSL <-> RGB, WCAG contrast (same formula as scripts/contrast.test.ts)
// ---------------------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
}
interface Hsl {
  h: number; // degrees, 0-360
  s: number; // percent, 0-100
  l: number; // percent, 0-100
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hue2rgb = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const hn = h / 360;
  return {
    r: Math.round(hue2rgb(hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(hn) * 255),
    b: Math.round(hue2rgb(hn - 1 / 3) * 255),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** WCAG 2.x relative luminance / contrast ratio — see scripts/contrast.test.ts. */
function linearChannel(c: number): number {
  const cn = c / 255;
  return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4);
}
function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** --color-label-bright from src/app/globals.css — the text every spine prints. */
const LABEL_BRIGHT: Rgb = { r: 0xf2, g: 0xeb, b: 0xe1 };

// ---------------------------------------------------------------------------
// dominant colour extraction
// ---------------------------------------------------------------------------

const BUCKET_STEP = 32; // 8 levels/channel — coarse on purpose, see dominantColour
const L_MIN = 8; // exclude near-black (letterboxing, credit blocks)
const L_MAX = 92; // exclude near-white (blown highlights)

/**
 * Exclude near-grey by **chroma** (max channel − min channel), not by HSL saturation.
 *
 * HSL saturation is misleading at both ends of the lightness range: #E3E6EB is 3% chroma —
 * plainly a grey — but reports 17% HSL saturation, because HSL divides by how close the
 * colour sits to mid-grey. Filtering on HSL saturation therefore let near-white smoke and
 * near-black shadow through, and their hue is numerically real but visually meaningless.
 * That produced four titles whose spine colour came from noise: Blade II from #E3E6EB,
 * Iron Man 3 from #2E2F30, X2 from #B3B9C5, Secret Invasion from #A6ADB7.
 *
 * Chroma has no such blind spot: grey is low-chroma at every lightness.
 */
const CHROMA_MIN = 26; // out of 255

/**
 * The dominant *meaningful* colour of a small RGB pixel buffer: quantise into a coarse
 * RGB histogram, skip near-black/near-white/near-grey pixels, and return the average
 * colour of the most populous bucket. Naive averaging (no filtering, no bucketing) returns
 * "dark grey" for most posters, because letterboxing and credit blocks dominate by pixel
 * count even though nobody would call them the poster's colour.
 */
function dominantColour(pixels: Buffer, channels: number): Rgb | null {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 2 < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const { l } = rgbToHsl({ r, g, b });
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (l < L_MIN || l > L_MAX || chroma < CHROMA_MIN) continue;
    const key = `${(r / BUCKET_STEP) | 0},${(g / BUCKET_STEP) | 0},${(b / BUCKET_STEP) | 0}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      // transient network error — one retry below, then give up
    }
    if (attempt === 0) await sleep(500);
  }
  return null;
}

/** Download a poster at w342 and extract its dominant colour. Null on any failure. */
async function extractPosterColour(posterPath: string): Promise<Rgb | null> {
  const buf = await fetchImageBuffer(`${TMDB_IMAGE_BASE}/w342${posterPath}`);
  if (!buf) return null;
  try {
    const { data, info } = await sharp(buf).resize(64, 64).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return dominantColour(data, info.channels);
  } catch {
    return null; // undecodable image — treat as "no extraction", not a crash
  }
}

// ---------------------------------------------------------------------------
// conditioning — hue from the artwork; saturation/lightness constrained to the room
// ---------------------------------------------------------------------------

// Same table as src/lib/tint.ts's MEDIUM_TONE. Duplicated rather than imported: this
// script must not depend on src/, and the table is small and stable.
const MEDIUM_TONE: Record<Medium, { s: number; l: number }> = {
  vhs: { s: 16, l: 33 },
  amaray: { s: 22, l: 37 },
  bluray: { s: 26, l: 41 },
  steel: { s: 14, l: 50 },
  none: { s: 20, l: 35 },
};

const SAT_CLAMP = 6;
/**
 * WCAG AA for normal text is 4.5:1, but the target here is 4.6 on purpose.
 *
 * Landing exactly on a boundary means any implementation that computes the ratio slightly
 * differently — a browser, a checker, this repo's own contrast test recomputing from the
 * rounded `hsl()` string rather than from the float — can land a hair under and fail. Four
 * titles sat at 4.49–4.50 for precisely that reason. The margin costs a percent of
 * lightness and removes the whole class of dispute.
 */
const CONTRAST_FLOOR = 4.6;

/**
 * Hue is the real per-title data and passes through untouched. Saturation is the table
 * value nudged by the extracted colour's own relative vividness, clamped to ±6 so nothing
 * escapes the room. Lightness starts at the table value; contrast is a hard floor, so if
 * #F2EBE1 doesn't read at 4.5:1 against it, lightness is reduced (never the other levers)
 * until it does — for a handful of high-luminance hues (yellow/lime) on the brighter media
 * (bluray, steel) that can move lightness further than ±6 from the table. That is the
 * floor winning on purpose, not a bug: contrast is enforced, not assumed.
 */
function conditionColour(raw: Rgb | null, medium: Medium): { tint: string; sourceColour: string | null; contrast: number } {
  const table = MEDIUM_TONE[medium];
  const rawHsl = raw ? rgbToHsl(raw) : null;
  const hue = Math.round((((rawHsl?.h ?? 0) % 360) + 360) % 360);

  // No extraction -> no vividness signal either way; sit exactly on the table value.
  const relativeSat = rawHsl ? rawHsl.s / 100 : 0.5;
  const delta = (relativeSat - 0.5) * 2 * SAT_CLAMP;
  const s = Math.round(Math.min(table.s + SAT_CLAMP, Math.max(table.s - SAT_CLAMP, table.s + delta)));

  let l = table.l;
  let contrast = contrastRatio(LABEL_BRIGHT, hslToRgb({ h: hue, s, l }));
  while (contrast < CONTRAST_FLOOR && l > 0) {
    l -= 1;
    contrast = contrastRatio(LABEL_BRIGHT, hslToRgb({ h: hue, s, l }));
  }

  return {
    tint: `hsl(${hue} ${s}% ${l}%)`,
    sourceColour: raw ? toHex(raw) : null,
    contrast: Math.round(contrast * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// per-title pipeline
// ---------------------------------------------------------------------------

interface ProcessResult {
  slug: string;
  artwork: ArtworkRecord;
  hadOwnSeasonPoster: boolean;
}

async function processTitle(record: TitleRecord): Promise<ProcessResult> {
  let poster: string | null = null;
  let backdrops: string[] = [];
  let logo: string | null = null;
  let hadOwnSeasonPoster = false;

  try {
    if (record.kind === 'film') {
      const images = await getMovieImages(record.tmdbId);
      poster = pickPoster(images?.posters);
      backdrops = pickBackdrops(images?.backdrops);
      logo = pickLogo(images?.logos);
    } else {
      // Backdrops and logos belong to the show regardless of season.
      const images = await getShowImages(record.tmdbId);
      poster = pickPoster(images?.posters);
      backdrops = pickBackdrops(images?.backdrops);
      logo = pickLogo(images?.logos);

      if (record.season != null) {
        const seasonImages = await getSeasonImages(record.tmdbId, record.season);
        const seasonPoster = pickPoster(seasonImages?.posters);
        if (seasonPoster != null) {
          poster = seasonPoster;
          hadOwnSeasonPoster = true;
        }
      }
    }
  } catch (err) {
    console.error(`  ! images fetch failed for ${record.slug}: ${(err as Error).message}`);
  }

  const raw = poster ? await extractPosterColour(poster) : null;
  const { tint, sourceColour, contrast } = conditionColour(raw, record.medium);

  return {
    slug: record.slug,
    artwork: { poster, backdrops, logo, tint, sourceColour, contrast },
    hadOwnSeasonPoster,
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const titles: TitleRecord[] = JSON.parse(readFileSync(TITLES_PATH, 'utf-8'));
  console.log(`Building artwork for ${titles.length} titles...`);

  const results = await mapLimit(titles, 5, processTitle);

  const artwork: Record<string, ArtworkRecord> = {};
  for (const r of results) artwork[r.slug] = r.artwork;

  writeFileSync(OUT_PATH, JSON.stringify(artwork, null, 2) + '\n', 'utf-8');

  const withPoster = results.filter((r) => r.artwork.poster != null).length;
  const withThreeBackdrops = results.filter((r) => r.artwork.backdrops.length === 3).length;
  const withAnyBackdrop = results.filter((r) => r.artwork.backdrops.length > 0).length;
  const withLogo = results.filter((r) => r.artwork.logo != null).length;
  const seasonRecordCount = titles.filter((t) => t.kind === 'series' && t.season != null).length;
  const ownSeasonPosterCount = results.filter((r) => r.hadOwnSeasonPoster).length;
  const lowestContrast = [...results].sort((a, b) => a.artwork.contrast - b.artwork.contrast).slice(0, 5);
  const missingPoster = results.filter((r) => r.artwork.poster == null).map((r) => r.slug);
  const missingLogo = results.filter((r) => r.artwork.logo == null).map((r) => r.slug);
  const shortBackdrops = results
    .filter((r) => r.artwork.backdrops.length < 3)
    .map((r) => `${r.slug} (${r.artwork.backdrops.length})`);

  console.log('\nDone.');
  console.log(`  poster:    ${withPoster}/${titles.length}`);
  console.log(`  backdrops: ${withThreeBackdrops}/${titles.length} got all 3, ${withAnyBackdrop}/${titles.length} got at least 1`);
  console.log(`  logo:      ${withLogo}/${titles.length}`);
  console.log(`  season posters: ${ownSeasonPosterCount}/${seasonRecordCount} seasons had their own (rest fell back to the show poster)`);
  console.log('  lowest contrast:');
  for (const r of lowestContrast) console.log(`    ${r.slug}: ${r.artwork.tint} contrast ${r.artwork.contrast}`);
  if (missingPoster.length) console.log(`  missing poster (${missingPoster.length}): ${missingPoster.join(', ')}`);
  if (missingLogo.length) console.log(`  missing logo (${missingLogo.length}): ${missingLogo.join(', ')}`);
  if (shortBackdrops.length) console.log(`  fewer than 3 backdrops (${shortBackdrops.length}): ${shortBackdrops.join(', ')}`);

  console.log(`\nWrote ${OUT_PATH}`);
}

await main();
