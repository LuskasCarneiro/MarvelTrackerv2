export type SearchableTitle = {
  slug: string;
  /** Display title, e.g. "Avengers: Infinity War" or "Agents of S.H.I.E.L.D. III". */
  label: string;
  /** The universe's display name, e.g. "Marvel Cinematic Universe". */
  universeLabel: string;
  releaseYear: number;
};

/**
 * Normalisation decisions — this is the part most likely to be wrong in an interesting way.
 *
 * - Lower-case and fold accents (NFD, strip combining marks) so "pantera" doesn't crash or
 *   mangle on accented input, even though it isn't expected to match anything here.
 * - A hyphen usually separates two words a viewer thinks of separately ("Spider-Man",
 *   "X-Men") — turned into a space so "man" and "men" are still word starts.
 * - A full stop is different: inside an acronym like "S.H.I.E.L.D." it's not a word
 *   separator at all, it's just punctuation glued to the letters either side. Turning it
 *   into a space would produce "s h i e l d", which defeats prefix/word matching for a
 *   query of "shield". So full stops (and every other punctuation mark — colons,
 *   apostrophes, asterisks, the "…" ellipsis, "?", "'") are simply dropped, not replaced
 *   with a space.
 * - Whitespace is collapsed and trimmed last, since the punctuation removal step can leave
 *   runs of spaces (e.g. around a dropped colon).
 */
function normalise(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining diacritical marks left by NFD
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Score tiers, highest first. The gap between tiers matters more than the exact numbers:
// nothing in a lower tier can ever outrank something in a higher one, tie-breaks aside.
const SCORE_EXACT = 1000;
const SCORE_PREFIX = 800;
const SCORE_WORD_PREFIX = 600;
const SCORE_SUBSTRING = 400;
const SCORE_ALL_WORDS = 200;
// Deliberately far below every title-based tier, and only ever awarded when no title-based
// rule matched at all (see below). A query of "marvel" should surface a title actually
// called "Marvel" — if one existed — before it surfaces every MCU title merely because they
// share a universe. Universe matching exists purely as a last-resort fallback for browsing
// by franchise, not as a competitor to a real title match.
const SCORE_UNIVERSE = 50;

/**
 * Pure and exported so the ranking is testable directly. Higher is better; 0 means no
 * match, and callers must treat 0 as "exclude", not "rank last".
 */
export function scoreTitle(title: SearchableTitle, query: string): number {
  const q = normalise(query);
  if (!q) return 0;

  const label = normalise(title.label);
  if (!label) return 0;

  if (label === q) return SCORE_EXACT;
  if (label.startsWith(q)) return SCORE_PREFIX;

  const words = label.split(' ');
  if (words.some((w) => w.startsWith(q))) return SCORE_WORD_PREFIX;
  if (label.includes(q)) return SCORE_SUBSTRING;

  const queryWords = q.split(' ');
  if (queryWords.every((qw) => label.includes(qw))) return SCORE_ALL_WORDS;

  const universe = normalise(title.universeLabel);
  if (universe && universe.includes(q)) return SCORE_UNIVERSE;

  return 0;
}

/**
 * Ranked matches, best first. Empty query returns an empty array — there is no sensible
 * "best" match for nothing typed, and returning the whole catalogue would look like a
 * match to the viewer.
 *
 * Tie-break after score: shorter label first (a query that is most of the title is a
 * better match than a fragment of a long one), then earlier release year, then slug — so
 * the order is stable across runs given the same input.
 */
export function searchTitles(
  titles: SearchableTitle[],
  query: string,
  limit = 10
): SearchableTitle[] {
  return titles
    .map((title) => ({ title, score: scoreTitle(title, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.title.label.length !== b.title.label.length) {
        return a.title.label.length - b.title.label.length;
      }
      if (a.title.releaseYear !== b.title.releaseYear) {
        return a.title.releaseYear - b.title.releaseYear;
      }
      return a.title.slug.localeCompare(b.title.slug);
    })
    .slice(0, limit)
    .map(({ title }) => title);
}

/** The single best match, or null. */
export function bestMatch(titles: SearchableTitle[], query: string): SearchableTitle | null {
  return searchTitles(titles, query, 1)[0] ?? null;
}
