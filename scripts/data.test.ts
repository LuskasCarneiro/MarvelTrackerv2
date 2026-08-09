import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * These read the JSON off disk rather than importing it, so the test sees exactly what
 * the pipeline wrote. JSON.parse returns `any`, so the shapes are declared here — the
 * repo typechecks under `strict`, and `next build` sweeps this file too.
 */
type SourceRecord = { u: string; t: string; r: number; s: string; d: string };
type TitleRecord = {
  slug: string;
  title: string;
  kind: 'film' | 'series';
  universe: string;
  releaseYear: number;
  season: number | null;
  chrono: string;
  runtimeMin: number | null;
  medium: string;
  tmdbId: number;
  matchConfidence: string;
};

const src = JSON.parse(readFileSync('data/v1-source.json', 'utf-8')) as {
  filmUniverses: Record<string, { name: string }>;
  seriesUniverses: Record<string, { name: string }>;
  films: SourceRecord[];
  series: SourceRecord[];
};
const titles = JSON.parse(readFileSync('data/titles.json', 'utf-8')) as TitleRecord[];
const notesFile = JSON.parse(readFileSync('data/notes-en.json', 'utf-8')) as {
  notes: Record<string, string>;
  filmUniverses: Record<string, string>;
  seriesUniverses: Record<string, string>;
};

const sourceRecords = [...src.films, ...src.series];
const notes = notesFile.notes;

/** The medium is derived from release year BY RULE — see docs/02-design-system.md. */
function mediumFor(year: number): string {
  if (year <= 1996) return 'vhs';
  if (year <= 2005) return 'amaray';
  if (year <= 2012) return 'bluray';
  if (year <= 2018) return 'steel';
  return 'none';
}

describe('titles.json', () => {
  it('has one record per source title', () => {
    expect(titles).toHaveLength(152);
  });

  it('has unique, non-empty slugs', () => {
    const slugs = titles.map((r) => r.slug);
    expect(slugs.every((s: string) => typeof s === 'string' && s.length > 0)).toBe(true);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('derives medium from release year by the rule', () => {
    const wrong = titles.filter((r) => r.medium !== mediumFor(r.releaseYear));
    expect(wrong.map((r) => `${r.title} ${r.releaseYear} -> ${r.medium}`)).toEqual([]);
  });

  it('resolves every universe key', () => {
    const bad = titles.filter((r) => {
      const map = r.kind === 'film' ? src.filmUniverses : src.seriesUniverses;
      return !(r.universe in map);
    });
    expect(bad.map((r) => `${r.title}: ${r.universe}`)).toEqual([]);
  });

  it('leaves no match unresolved', () => {
    const unresolved = titles.filter((r) => r.matchConfidence === 'none' || !r.tmdbId);
    expect(unresolved.map((r) => r.title)).toEqual([]);
  });

  it('has a positive integer runtime or an honest null', () => {
    const bad = titles.filter(
      (r) => r.runtimeMin !== null && (!Number.isInteger(r.runtimeMin) || r.runtimeMin <= 0)
    );
    expect(bad.map((r) => `${r.title}=${r.runtimeMin}`)).toEqual([]);
  });

  it('never carries the Portuguese note through', () => {
    expect(titles.filter((r) => 'note' in r || 'd' in r)).toEqual([]);
  });

  /**
   * The regression that motivated this file. Four Agents of S.H.I.E.L.D. seasons matched
   * "Agents of S.H.I.E.L.D.: Slingshot" (a 6-episode webseries), two What If...? seasons
   * matched an unrelated 2024 show, and Runaways S3 matched a different Runaways from
   * 2012. Each was a real show with a plausible name, so nothing failed loudly — the
   * seasons just came back with no runtime.
   *
   * A show cannot be two different TMDB ids. That is the invariant.
   */
  it('gives every multi-season show exactly one tmdbId', () => {
    const idsByTitle = new Map<string, Set<number>>();
    for (const r of titles) {
      if (r.kind !== 'series') continue;
      if (!idsByTitle.has(r.title)) idsByTitle.set(r.title, new Set());
      idsByTitle.get(r.title)!.add(r.tmdbId);
    }
    const split = [...idsByTitle.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([title, ids]) => `${title}: ${[...ids].join(', ')}`);
    expect(split).toEqual([]);
  });

  it('distinguishes the seasons of a show that shares a tmdbId', () => {
    const seen = new Set<string>();
    const collisions: string[] = [];
    for (const r of titles) {
      const key = `${r.tmdbId}:${r.season ?? 'none'}`;
      if (seen.has(key)) collisions.push(`${r.title} (${r.releaseYear}) ${key}`);
      seen.add(key);
    }
    expect(collisions).toEqual([]);
  });
});

describe('notes-en.json', () => {
  it('translates every source title, and invents none', () => {
    const missing = sourceRecords.filter((r) => !(r.t in notes)).map((r) => r.t);
    const extra = Object.keys(notes).filter((k) => !sourceRecords.some((r) => r.t === k));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('leaves no untranslated Portuguese', () => {
    const giveaways = [' e ', ' de ', ' que ', ' para ', ' com ', 'ção', 'ões', ' uma ', ' não '];

    // Nobiliary particles inside proper names are not untranslated Portuguese —
    // "Valentina Allegra de Fontaine" keeps its "de" in English too. Drop the particle
    // when it sits between two capitalised words before testing.
    const withoutNameParticles = (s: string) =>
      s.replace(/(?<=\b[A-Z][a-z]+\s)(?:de|del|della|di|du|van|von|la|le)(?=\s[A-Z])/g, '');

    const offenders = Object.entries(notes)
      .filter(([, v]) =>
        giveaways.some((g) => withoutNameParticles(v).toLowerCase().includes(g))
      )
      .map(([t, v]) => `${t}: ${v.slice(0, 60)}`);
    expect(offenders).toEqual([]);
  });

  /**
   * The guard against rewriting rather than translating. These paragraphs are the
   * owner's, hand-written, and are being carried across — a "better" sentence is wrong.
   */
  it('keeps each note the same shape as the original', () => {
    const sentences = (s: string) => (s.match(/[.!?]+(\s|$)/g) || []).length;
    const drifted = sourceRecords
      .filter((r) => Math.abs(sentences(notes[r.t]) - sentences(r.d)) > 1)
      .map((r) => `${r.t}: pt=${sentences(r.d)} en=${sentences(notes[r.t])}`);
    expect(drifted).toEqual([]);
  });

  it('translates every universe label', () => {
    for (const key of Object.keys(src.filmUniverses)) {
      expect(notesFile.filmUniverses[key], `film universe ${key}`).toBeTruthy();
    }
    for (const key of Object.keys(src.seriesUniverses)) {
      expect(notesFile.seriesUniverses[key], `series universe ${key}`).toBeTruthy();
    }
  });
});
