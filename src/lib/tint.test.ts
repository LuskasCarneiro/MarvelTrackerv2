import { describe, expect, it } from 'vitest';
import { titleTint, tintToHsl } from './tint';
import artwork from '../../data/artwork.json';

describe('titleTint', () => {
  it('is deterministic for the same slug and medium', () => {
    expect(titleTint('iron-man-2008', 'bluray')).toBe(titleTint('iron-man-2008', 'bluray'));
  });

  it('varies by slug', () => {
    expect(titleTint('iron-man-2008', 'bluray')).not.toBe(titleTint('thor-2011', 'bluray'));
  });

  it('varies by medium for the same slug', () => {
    expect(titleTint('iron-man-2008', 'vhs')).not.toBe(titleTint('iron-man-2008', 'steel'));
  });

  it('returns a valid hsl() colour', () => {
    expect(titleTint('howard-the-duck-1986', 'vhs')).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
  });
});

describe('tintToHsl', () => {
  // The reason this function exists: three.js reads the comma form and silently returns
  // white for the space-separated form every tint in data/artwork.json actually uses.
  // A guard for a silent failure has to be checked against the real data, not a sample.
  it('parses the space-separated form the pipeline emits', () => {
    expect(tintToHsl('hsl(25 21% 37%)')).toEqual({ h: 25 / 360, s: 0.21, l: 0.37 });
  });

  it('refuses anything else rather than returning a colour', () => {
    expect(() => tintToHsl('hsl(25,21%,37%)')).toThrow();
    expect(() => tintToHsl('#725b4b')).toThrow();
    expect(() => tintToHsl('')).toThrow();
  });

  it('handles every tint actually committed, and keeps them in range', () => {
    const tints = Object.values(artwork).map((entry) => (entry as { tint: string }).tint);
    expect(tints.length).toBeGreaterThan(140);
    for (const tint of tints) {
      const { h, s, l } = tintToHsl(tint);
      for (const value of [h, s, l]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
