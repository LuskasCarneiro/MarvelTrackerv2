// TMDB matching pipeline. Reads data/v1-source.json (152 titles, PT source text),
// matches every one against TMDB, and writes:
//   - data/titles.json            the metadata record for each title (no `note` field)
//   - data/tmdb-match-report.md   a human-auditable report, worst matches first
//
// Run: node --env-file=.env --experimental-strip-types scripts/build-data.ts
//
// Artwork, palette extraction and spine composites are a separate job — out of scope here.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE_PATH = resolve(ROOT, 'data/v1-source.json');
const OVERRIDES_PATH = resolve(ROOT, 'data/tmdb-overrides.json');
const TITLES_OUT_PATH = resolve(ROOT, 'data/titles.json');
const REPORT_OUT_PATH = resolve(ROOT, 'data/tmdb-match-report.md');

const TMDB_READ_TOKEN = process.env.TMDB_READ_TOKEN;
if (!TMDB_READ_TOKEN) {
  throw new Error('TMDB_READ_TOKEN is not set. Run with --env-file=.env.');
}

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

type Kind = 'film' | 'series';
type Medium = 'vhs' | 'amaray' | 'bluray' | 'steel' | 'none';
type Confidence = 'exact' | 'fuzzy' | 'override' | 'none';
type TmdbType = 'movie' | 'tv';

interface SourceItem {
  u: string;
  t: string;
  r: number;
  s: string;
  d: string;
}

interface SourceData {
  filmUniverses: Record<string, { name: string }>;
  seriesUniverses: Record<string, { name: string }>;
  films: SourceItem[];
  series: SourceItem[];
}

interface Override {
  tmdbId: number;
  season?: number | null;
  tmdbType?: TmdbType;
}

interface TitleRecord {
  slug: string;
  title: string;
  kind: Kind;
  universe: string;
  releaseYear: number;
  season: number | null;
  chrono: string;
  runtimeMin: number | null;
  medium: Medium;
  tmdbId: number | null;
  matchConfidence: Confidence;
}

// The report needs more than what ships in titles.json: what TMDB thinks the
// title/year actually are, and why a match earned a second look.
interface MatchAudit {
  record: TitleRecord;
  rawTitle: string;
  matchedTitle: string | null;
  matchedYear: number | null;
  runnerUp: { title: string; year: number | null; score: number } | null;
}

// TMDB API response types — narrowed to only the fields we use
interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
}

interface TmdbSearchResponse {
  results?: TmdbSearchResult[];
}

interface TmdbEpisode {
  runtime?: number;
}

interface TmdbSeason {
  season_number?: number;
  air_date?: string;
  episodes?: TmdbEpisode[];
}

interface TmdbMovieDetail {
  id?: number;
  title?: string;
  release_date?: string;
  runtime?: number;
}

interface TmdbTvDetail {
  id?: number;
  name?: string;
  first_air_date?: string;
  seasons?: TmdbSeason[];
}

// ---------------------------------------------------------------------------
// small utilities (no libraries — this is all a few lines each)
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

function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['".:]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Strip a trailing " S<n>" season marker and/or a trailing "(...)" disambiguator. */
function parseSourceTitle(raw: string): { cleanTitle: string; season: number | null } {
  let title = raw;
  let season: number | null = null;

  const seasonMatch = title.match(/\s+S(\d+)$/);
  if (seasonMatch) {
    season = Number(seasonMatch[1]);
    title = title.slice(0, seasonMatch.index);
  }

  const parenMatch = title.match(/\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    title = title.slice(0, parenMatch.index).trim();
  }

  return { cleanTitle: title.trim(), season };
}

function mediumFor(year: number): Medium {
  if (year <= 1996) return 'vhs';
  if (year <= 2005) return 'amaray';
  if (year <= 2012) return 'bluray';
  if (year <= 2018) return 'steel';
  return 'none';
}

// ---------------------------------------------------------------------------
// TMDB client — small concurrency, 429 backoff, never logs the token
// ---------------------------------------------------------------------------

const TMDB_BASE = 'https://api.themoviedb.org/3';

async function tmdbFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(TMDB_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TMDB_READ_TOKEN}` } });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt) * 1000);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path} ${JSON.stringify(params)}`);
    return res.json();
  }
  throw new Error(`TMDB kept rate-limiting: ${path}`);
}

async function searchMovie(query: string): Promise<TmdbSearchResult[]> {
  const data = (await tmdbFetch('/search/movie', { query, include_adult: 'false' })) as TmdbSearchResponse | null;
  return data?.results ?? [];
}
async function searchTv(query: string): Promise<TmdbSearchResult[]> {
  const data = (await tmdbFetch('/search/tv', { query, include_adult: 'false' })) as TmdbSearchResponse | null;
  return data?.results ?? [];
}
async function movieDetail(id: number): Promise<TmdbMovieDetail | null> {
  return (await tmdbFetch(`/movie/${id}`)) as TmdbMovieDetail | null;
}
async function tvDetail(id: number): Promise<TmdbTvDetail | null> {
  return (await tmdbFetch(`/tv/${id}`)) as TmdbTvDetail | null;
}
async function tvSeasonDetail(id: number, season: number): Promise<TmdbSeason | null> {
  return (await tmdbFetch(`/tv/${id}/season/${season}`)) as TmdbSeason | null;
}

// ---------------------------------------------------------------------------
// scoring — title text similarity + year proximity, never "take result #1"
// ---------------------------------------------------------------------------

function titleSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const setA = new Set(na.split(' '));
  const setB = new Set(nb.split(' '));
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : (intersection / union) * 0.7;
}

function yearScore(diff: number): number {
  if (diff === 0) return 1;
  if (diff === 1) return 0.9;
  if (diff <= 3) return 0.7;
  if (diff <= 7) return 0.45;
  return 0.2;
}

function combinedScore(sim: number, ourYear: number, candYear: number | null): number {
  const diff = candYear == null ? Infinity : Math.abs(ourYear - candYear);
  return sim * 0.7 + yearScore(diff) * 0.3;
}

interface Scored {
  id: number;
  title: string;
  year: number | null;
  sim: number;
  score: number;
}

function scoreCandidates(
  candidates: TmdbSearchResult[],
  ourTitle: string,
  ourYear: number,
  titleField: 'title' | 'name',
  dateField: 'release_date' | 'first_air_date',
): Scored[] {
  return candidates
    .map((c) => {
      const title = (c[titleField] as string | undefined) ?? '';
      const year = (c[dateField] as string | undefined) ? Number(String(c[dateField]).slice(0, 4)) : null;
      const sim = titleSimilarity(ourTitle, title);
      return { id: c.id, title, year, sim, score: combinedScore(sim, ourYear, year) };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// runtime lookups
// ---------------------------------------------------------------------------

/** Sum a single season's episode runtimes. Null (not 0) if any episode's runtime is unknown. */
async function seasonRuntime(showId: number, seasonNumber: number): Promise<{ runtime: number | null; airYear: number | null }> {
  const data = await tvSeasonDetail(showId, seasonNumber);
  const episodes = (data?.episodes ?? []) as TmdbEpisode[];
  const airYear = data?.air_date ? Number(String(data.air_date).slice(0, 4)) : null;
  if (episodes.length === 0) return { runtime: null, airYear };
  let sum = 0;
  for (const ep of episodes) {
    if (typeof ep.runtime !== 'number' || ep.runtime <= 0) return { runtime: null, airYear };
    sum += ep.runtime;
  }
  return { runtime: sum, airYear };
}

/** No season suffix in the source = the whole show. Sum every real season (skip season 0 specials). */
async function wholeShowRuntime(showId: number, show: TmdbTvDetail): Promise<number | null> {
  const seasons = ((show?.seasons ?? []) as TmdbSeason[]).filter((s: TmdbSeason) => (s.season_number ?? 0) > 0);
  if (seasons.length === 0) return null;
  let total = 0;
  for (const s of seasons) {
    const { runtime } = await seasonRuntime(showId, s.season_number ?? 0);
    if (runtime == null) return null;
    total += runtime;
  }
  return total;
}

// ---------------------------------------------------------------------------
// matching one source item
// ---------------------------------------------------------------------------

interface WorkItem {
  source: SourceItem;
  kind: Kind;
}

async function matchOne(item: WorkItem, overrides: Record<string, Override>): Promise<MatchAudit> {
  const { source, kind } = item;
  const override = overrides[source.t];
  const { cleanTitle, season: parsedSeason } = parseSourceTitle(source.t);
  const tmdbType: TmdbType = override?.tmdbType ?? (kind === 'film' ? 'movie' : 'tv');
  const season = override && override.season !== undefined ? override.season : parsedSeason;

  let tmdbId: number | null = null;
  let confidence: Confidence = 'none';
  let runnerUp: MatchAudit['runnerUp'] = null;

  if (override) {
    tmdbId = override.tmdbId;
    confidence = 'override';
  } else if (tmdbType === 'movie') {
    const candidates = await searchMovie(cleanTitle);
    const scored = scoreCandidates(candidates, cleanTitle, source.r, 'title', 'release_date');
    if (scored.length > 0) {
      const best = scored[0];
      tmdbId = best.id;
      confidence = best.sim === 1 && Math.abs(source.r - (best.year ?? -9999)) <= 1 ? 'exact' : best.score >= 0.55 ? 'fuzzy' : 'none';
      if (scored[1]) runnerUp = { title: scored[1].title, year: scored[1].year, score: scored[1].score };
      if (confidence !== 'none' && scored[1] && best.score - scored[1].score < 0.08) {
        // Close call between two real candidates — force a human look even if the
        // top score alone looked confident. (Empirically necessary: TMDB carries
        // duplicate-titled entries, e.g. two unrelated shows both called "The Gifted".)
        confidence = 'fuzzy';
      }
    }
  } else {
    const candidates = await searchTv(cleanTitle);
    const scored = scoreCandidates(candidates, cleanTitle, source.r, 'name', 'first_air_date');
    if (scored.length > 0) {
      const best = scored[0];
      tmdbId = best.id;
      confidence = best.sim === 1 && Math.abs(source.r - (best.year ?? -9999)) <= 1 ? 'exact' : best.score >= 0.55 ? 'fuzzy' : 'none';
      if (scored[1]) runnerUp = { title: scored[1].title, year: scored[1].year, score: scored[1].score };
      if (confidence !== 'none' && scored[1] && best.score - scored[1].score < 0.08) {
        confidence = 'fuzzy';
      }
    }
  }

  let matchedTitle: string | null = null;
  let matchedYear: number | null = null;
  let runtimeMin: number | null = null;

  if (tmdbId != null) {
    try {
      if (tmdbType === 'movie') {
        const detail = await movieDetail(tmdbId);
        if (!detail) throw new Error(`movie ${tmdbId} not found`);
        matchedTitle = detail.title ?? null;
        matchedYear = detail.release_date ? Number(String(detail.release_date).slice(0, 4)) : null;
        runtimeMin = typeof detail.runtime === 'number' && detail.runtime > 0 ? detail.runtime : null;
      } else {
        const show = await tvDetail(tmdbId);
        if (!show) throw new Error(`tv ${tmdbId} not found`);
        matchedTitle = show.name ?? null;
        if (season != null) {
          const { runtime, airYear } = await seasonRuntime(tmdbId, season);
          if (runtime == null && show.seasons?.every((s: TmdbSeason) => s.season_number !== season)) {
            throw new Error(`show ${tmdbId} has no season ${season}`);
          }
          runtimeMin = runtime;
          matchedYear = airYear ?? (show.first_air_date ? Number(String(show.first_air_date).slice(0, 4)) : null);
        } else {
          runtimeMin = await wholeShowRuntime(tmdbId, show);
          matchedYear = show.first_air_date ? Number(String(show.first_air_date).slice(0, 4)) : null;
        }
      }
    } catch (err) {
      console.error(`  ! detail fetch failed for "${source.t}" (tmdbId ${tmdbId}): ${(err as Error).message}`);
      confidence = 'none';
      matchedTitle = null;
      matchedYear = null;
      runtimeMin = null;
    }
  }

  const record: TitleRecord = {
    slug: '', // filled in by the caller once every title is known, to guard collisions
    title: cleanTitle,
    kind,
    universe: source.u,
    releaseYear: source.r,
    season,
    chrono: source.s,
    runtimeMin,
    medium: mediumFor(source.r),
    tmdbId,
    matchConfidence: confidence,
  };

  return { record, rawTitle: source.t, matchedTitle, matchedYear, runnerUp };
}

// ---------------------------------------------------------------------------
// slugs — always title + year (unique in this catalogue; checked, not assumed)
// ---------------------------------------------------------------------------

function assignSlugs(audits: MatchAudit[]): void {
  const used = new Set<string>();
  for (const audit of audits) {
    const base = `${kebab(audit.record.title)}-${audit.record.releaseYear}`;
    let slug = base;
    const suffix = audit.record.season != null ? `-s${audit.record.season}` : '';
    if (used.has(slug) && suffix) slug = base + suffix;
    let n = 2;
    while (used.has(slug)) slug = `${base}${suffix}-${n++}`;
    used.add(slug);
    audit.record.slug = slug;
  }
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK: Record<Confidence, number> = { none: 0, fuzzy: 1, override: 2, exact: 3 };

function flagReason(audit: MatchAudit): string | null {
  const reasons: string[] = [];
  const { record, matchedTitle, matchedYear, runnerUp } = audit;
  if (record.matchConfidence === 'none') reasons.push('**unresolved — no confident match**');
  if (matchedTitle != null && normalize(matchedTitle) !== normalize(record.title)) reasons.push('title differs');
  if (matchedYear != null && Math.abs(matchedYear - record.releaseYear) > 1) {
    reasons.push(`year off by ${Math.abs(matchedYear - record.releaseYear)}`);
  }
  if (runnerUp && record.matchConfidence !== 'override') {
    reasons.push(`close runner-up: "${runnerUp.title}" (${runnerUp.year ?? '?'})`);
  }
  return reasons.length > 0 ? reasons.join('; ') : null;
}

function reportRow(audit: MatchAudit): string {
  const { record, matchedTitle, matchedYear } = audit;
  const ours = `${record.title} (${record.releaseYear})${record.season != null ? ` S${record.season}` : ''}`;
  const matched = matchedTitle ? `${matchedTitle} (${matchedYear ?? '?'})` : '*no match*';
  return `| ${ours} | ${record.kind} | ${matched} | ${record.tmdbId ?? '—'} | ${record.matchConfidence} |`;
}

function buildReport(audits: MatchAudit[]): string {
  const sorted = [...audits].sort((a, b) => {
    const rankDiff = CONFIDENCE_RANK[a.record.matchConfidence] - CONFIDENCE_RANK[b.record.matchConfidence];
    if (rankDiff !== 0) return rankDiff;
    if (a.record.releaseYear !== b.record.releaseYear) return a.record.releaseYear - b.record.releaseYear;
    return a.record.title.localeCompare(b.record.title);
  });

  const flagged = sorted.filter((a) => flagReason(a) != null);
  const flaggedSet = new Set(flagged);
  const rest = sorted.filter((a) => !flaggedSet.has(a));

  const counts: Record<Confidence, number> = { exact: 0, fuzzy: 0, override: 0, none: 0 };
  for (const a of audits) counts[a.record.matchConfidence]++;

  const lines: string[] = [];
  lines.push('# TMDB match report');
  lines.push('');
  lines.push(
    `${audits.length} records — ${counts.exact} exact, ${counts.fuzzy} fuzzy, ${counts.override} override, ${counts.none} unresolved.`,
  );
  lines.push('');
  lines.push('## Needs eyes');
  lines.push('');
  lines.push(
    'Matched title differs from ours, matched year is off by more than one, unresolved, ' +
      'or the runner-up candidate scored too close to call. Sorted worst-confidence-first.',
  );
  lines.push('');
  if (flagged.length === 0) {
    lines.push('*Nothing flagged.*');
  } else {
    lines.push('| Our title (year) | Kind | Matched | TMDB ID | Confidence | Why |');
    lines.push('|---|---|---|---|---|---|');
    for (const a of flagged) {
      lines.push(`${reportRow(a).slice(0, -1)} ${flagReason(a)} |`);
    }
  }
  lines.push('');
  lines.push(`## All other matches (${rest.length}, worst-confidence-first)`);
  lines.push('');
  lines.push('| Our title (year) | Kind | Matched | TMDB ID | Confidence |');
  lines.push('|---|---|---|---|---|');
  for (const a of rest) lines.push(reportRow(a));
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const source: SourceData = JSON.parse(readFileSync(SOURCE_PATH, 'utf-8'));
  const overrides: Record<string, Override> = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8'));

  const items: WorkItem[] = [
    ...source.films.map((s) => ({ source: s, kind: 'film' as const })),
    ...source.series.map((s) => ({ source: s, kind: 'series' as const })),
  ];

  console.log(`Matching ${items.length} titles against TMDB (${Object.keys(overrides).length} overrides loaded)...`);

  const audits = await mapLimit(items, 5, async (item) => {
    try {
      return await matchOne(item, overrides);
    } catch (err) {
      console.error(`  ! matching failed entirely for "${item.source.t}": ${(err as Error).message}`);
      return {
        record: {
          slug: '',
          title: parseSourceTitle(item.source.t).cleanTitle,
          kind: item.kind,
          universe: item.source.u,
          releaseYear: item.source.r,
          season: parseSourceTitle(item.source.t).season,
          chrono: item.source.s,
          runtimeMin: null,
          medium: mediumFor(item.source.r),
          tmdbId: null,
          matchConfidence: 'none' as const,
        },
        rawTitle: item.source.t,
        matchedTitle: null,
        matchedYear: null,
        runnerUp: null,
      };
    }
  });

  assignSlugs(audits);

  const titles = audits.map((a) => a.record);
  writeFileSync(TITLES_OUT_PATH, JSON.stringify(titles, null, 2) + '\n', 'utf-8');
  writeFileSync(REPORT_OUT_PATH, buildReport(audits), 'utf-8');

  const counts: Record<Confidence, number> = { exact: 0, fuzzy: 0, override: 0, none: 0 };
  for (const a of audits) counts[a.record.matchConfidence]++;
  const nullRuntimes = titles.filter((t) => t.runtimeMin == null);

  console.log('\nDone.');
  console.log(`  exact: ${counts.exact}  fuzzy: ${counts.fuzzy}  override: ${counts.override}  none: ${counts.none}`);
  console.log(`  runtimeMin null: ${nullRuntimes.length}`);
  if (counts.none > 0) {
    console.log('\n  UNRESOLVED (need an override):');
    for (const a of audits) {
      if (a.record.matchConfidence === 'none') console.log(`    - "${a.rawTitle}" (${a.record.releaseYear}, ${a.record.kind})`);
    }
  }
  console.log(`\nWrote ${TITLES_OUT_PATH}`);
  console.log(`Wrote ${REPORT_OUT_PATH}`);
}

await main();
