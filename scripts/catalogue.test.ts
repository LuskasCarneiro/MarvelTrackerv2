import { describe, expect, it } from 'vitest';
import { shelves, spineWidth, titles, getTitle } from '@/lib/catalogue';

/**
 * These import the real module rather than re-implementing its logic, so they fail if
 * the join breaks — not if a copy of the join breaks.
 */
describe('catalogue', () => {
  it('exposes all 152 titles', () => {
    expect(titles).toHaveLength(152);
  });

  /**
   * The note join is the fragile part: titles.json carries no prose, so each record is
   * matched back to its original v1 title string to find the translation. If the pipeline
   * ever changes how it writes `title`, this is what breaks — silently, leaving blank
   * paragraphs on 152 pages rather than throwing.
   */
  it('joins a non-empty note onto every title', () => {
    const blank = titles.filter((t) => !t.note || t.note.trim().length === 0);
    expect(blank.map((t) => `${t.title} (${t.releaseYear})`)).toEqual([]);
  });

  it('gives every title a resolved universe label, not a raw key', () => {
    const unresolved = titles.filter((t) => t.universeName === t.universe);
    expect(unresolved.map((t) => t.title)).toEqual([]);
  });

  it('puts every title on exactly one shelf', () => {
    const onShelves = shelves.flatMap((s) => s.titles);
    expect(onShelves).toHaveLength(titles.length);
    expect(new Set(onShelves.map((t) => t.slug)).size).toBe(titles.length);
  });

  it('orders each shelf chronologically', () => {
    for (const shelf of shelves) {
      const years = shelf.titles.map((t) => t.releaseYear);
      expect(years, shelf.medium).toEqual([...years].sort((a, b) => a - b));
    }
  });

  it('finds a title by slug, and nothing by a bad one', () => {
    expect(getTitle('howard-the-duck-1986')?.title).toBe('Howard the Duck');
    expect(getTitle('not-a-real-slug')).toBeUndefined();
  });

  it('keeps spine widths legible, and encodes longer runtimes as wider', () => {
    expect(spineWidth(null)).toBeGreaterThan(0);
    expect(spineWidth(89)).toBeLessThan(spineWidth(181));
    for (const t of titles) {
      const w = spineWidth(t.runtimeMin);
      expect(w, `${t.title} width`).toBeGreaterThanOrEqual(18);
      expect(w, `${t.title} width`).toBeLessThanOrEqual(64);
    }
  });
});
