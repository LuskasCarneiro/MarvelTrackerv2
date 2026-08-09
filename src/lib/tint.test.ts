import { describe, expect, it } from 'vitest';
import { titleTint } from './tint';

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
