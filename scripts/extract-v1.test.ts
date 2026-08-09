import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface SourceData {
  filmUniverses: Record<string, { name: string }>;
  seriesUniverses: Record<string, { name: string }>;
  films: Array<{ u: string; t: string; r: number; s: string; d: string }>;
  series: Array<{ u: string; t: string; r: number; s: string; d: string }>;
}

let data: SourceData;

beforeAll(() => {
  const dataPath = resolve(__dirname, '../data/v1-source.json');
  const content = readFileSync(dataPath, 'utf-8');
  data = JSON.parse(content);
});

describe('v1-source.json extraction', () => {
  it('should have exactly 82 films', () => {
    expect(data.films.length).toBe(82);
  });

  it('should have exactly 70 series', () => {
    expect(data.series.length).toBe(70);
  });

  it('all films should have required keys: u, t, r, s, d', () => {
    data.films.forEach((film) => {
      expect(film).toHaveProperty('u');
      expect(film).toHaveProperty('t');
      expect(film).toHaveProperty('r');
      expect(film).toHaveProperty('s');
      expect(film).toHaveProperty('d');
    });
  });

  it('all series should have required keys: u, t, r, s, d', () => {
    data.series.forEach((series) => {
      expect(series).toHaveProperty('u');
      expect(series).toHaveProperty('t');
      expect(series).toHaveProperty('r');
      expect(series).toHaveProperty('s');
      expect(series).toHaveProperty('d');
    });
  });

  it('all films should have r as an integer', () => {
    data.films.forEach((film) => {
      expect(typeof film.r).toBe('number');
      expect(Number.isInteger(film.r)).toBe(true);
    });
  });

  it('all series should have r as an integer', () => {
    data.series.forEach((series) => {
      expect(typeof series.r).toBe('number');
      expect(Number.isInteger(series.r)).toBe(true);
    });
  });

  it('all films should have non-empty t and d', () => {
    data.films.forEach((film) => {
      expect(typeof film.t).toBe('string');
      expect(film.t.length).toBeGreaterThan(0);
      expect(typeof film.d).toBe('string');
      expect(film.d.length).toBeGreaterThan(0);
    });
  });

  it('all series should have non-empty t and d', () => {
    data.series.forEach((series) => {
      expect(typeof series.t).toBe('string');
      expect(series.t.length).toBeGreaterThan(0);
      expect(typeof series.d).toBe('string');
      expect(series.d.length).toBeGreaterThan(0);
    });
  });

  it('all film u values should resolve in filmUniverses', () => {
    data.films.forEach((film) => {
      expect(data.filmUniverses).toHaveProperty(film.u);
    });
  });

  it('all series u values should resolve in seriesUniverses', () => {
    data.series.forEach((series) => {
      expect(data.seriesUniverses).toHaveProperty(series.u);
    });
  });

  it('first film should be Howard the Duck (1986)', () => {
    const first = data.films[0];
    expect(first.t).toBe('Howard the Duck');
    expect(first.r).toBe(1986);
    expect(first.d.startsWith('O primeiro filme baseado numa banda desenhada')).toBe(true);
  });
});
