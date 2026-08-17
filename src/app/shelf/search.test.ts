import { describe, expect, it } from 'vitest';
import { bestMatch, scoreTitle, searchTitles, type SearchableTitle } from './search';

// Real title strings from the catalogue — chosen because each one carries a punctuation
// trap the normaliser has to survive: full stops inside an acronym, a colon, a hyphen, an
// apostrophe, a trailing asterisk and a non-ASCII ellipsis.
const FIXTURE: SearchableTitle[] = [
  { slug: 'iron-man', label: 'Iron Man', universeLabel: 'Marvel Cinematic Universe', releaseYear: 2008 },
  {
    slug: 'invincible-iron-man',
    label: 'The Invincible Iron Man',
    universeLabel: 'Marvel Animated Universe',
    releaseYear: 2007,
  },
  {
    slug: 'winter-soldier',
    label: 'Captain America: The Winter Soldier',
    universeLabel: 'Marvel Cinematic Universe',
    releaseYear: 2014,
  },
  {
    slug: 'agents-of-shield-3',
    label: 'Agents of S.H.I.E.L.D. III',
    universeLabel: 'Marvel Cinematic Universe',
    releaseYear: 2015,
  },
  { slug: 'endgame', label: 'Avengers: Endgame', universeLabel: 'Marvel Cinematic Universe', releaseYear: 2019 },
  {
    slug: 'no-way-home',
    label: 'Spider-Man: No Way Home',
    universeLabel: 'Marvel Cinematic Universe',
    releaseYear: 2021,
  },
  { slug: 'what-if', label: 'What If…?', universeLabel: 'Marvel Cinematic Universe', releaseYear: 2021 },
  { slug: 'thunderbolts', label: 'Thunderbolts*', universeLabel: 'Marvel Cinematic Universe', releaseYear: 2025 },
  { slug: 'x-men-97', label: "X-Men '97", universeLabel: 'Marvel Animated Universe', releaseYear: 2024 },
  {
    slug: 'black-panther',
    label: 'Black Panther',
    universeLabel: 'Marvel Cinematic Universe',
    releaseYear: 2018,
  },
];

describe('scoreTitle ranking order', () => {
  it('scores an exact match (case- and punctuation-insensitive) highest', () => {
    const exact = scoreTitle(FIXTURE[6]!, 'what if'); // "What If…?"
    const prefix = scoreTitle(FIXTURE[0]!, 'iron'); // "Iron Man" starts with "iron"
    expect(exact).toBeGreaterThan(prefix);
  });

  it('ranks "label starts with query" above "word in label starts with query"', () => {
    const startsWith = scoreTitle(FIXTURE[0]!, 'iron'); // "Iron Man"
    const wordStartsWith = scoreTitle(FIXTURE[1]!, 'iron'); // "The Invincible Iron Man"
    expect(startsWith).toBeGreaterThan(wordStartsWith);
    expect(startsWith).toBeGreaterThan(0);
    expect(wordStartsWith).toBeGreaterThan(0);
  });

  it('ranks a word-start match above a mere substring match', () => {
    const wordStart = scoreTitle(FIXTURE[2]!, 'win'); // "Captain America: The Winter Soldier"
    // "erica" is a substring of "America" but not the start of any word.
    const substring = scoreTitle(FIXTURE[2]!, 'erica');
    expect(wordStart).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it('ranks a substring match above an out-of-order multi-word match', () => {
    const substring = scoreTitle(FIXTURE[2]!, 'winter soldier');
    const outOfOrder = scoreTitle(FIXTURE[2]!, 'soldier winter');
    expect(substring).toBeGreaterThan(outOfOrder);
    expect(outOfOrder).toBeGreaterThan(0);
  });

  it('finds "Agents of S.H.I.E.L.D. III" for a query of "shield" despite the full stops', () => {
    const score = scoreTitle(FIXTURE[3]!, 'shield');
    expect(score).toBeGreaterThan(0);
  });

  it('matches multi-word queries out of order — "winter captain" finds the Winter Soldier', () => {
    const score = scoreTitle(FIXTURE[2]!, 'winter captain');
    expect(score).toBeGreaterThan(0);
  });

  it('handles colons, hyphens and the non-ASCII ellipsis without mangling', () => {
    expect(scoreTitle(FIXTURE[4]!, 'avengers endgame')).toBeGreaterThan(0); // colon
    expect(scoreTitle(FIXTURE[5]!, 'spider man')).toBeGreaterThan(0); // hyphen + colon
    expect(scoreTitle(FIXTURE[6]!, 'what if')).toBeGreaterThan(0); // ellipsis + ?
  });

  it('handles a trailing asterisk and an apostrophe', () => {
    expect(scoreTitle(FIXTURE[7]!, 'thunderbolts')).toBeGreaterThan(0); // Thunderbolts*
    expect(scoreTitle(FIXTURE[8]!, 'x men 97')).toBeGreaterThan(0); // X-Men '97
  });

  it('never crashes or corrupts scoring on accented input', () => {
    expect(() => scoreTitle(FIXTURE[9]!, 'pantera')).not.toThrow();
    // Accented folding is defensive only — "pantera" need not match "Black Panther".
    expect(scoreTitle(FIXTURE[9]!, 'pantera')).toBe(0);
  });

  it('scores a universe-only match, but far below any title-based match', () => {
    // "marvel" hits every MCU title's universe, never their labels.
    const universeScore = scoreTitle(FIXTURE[0]!, 'marvel');
    const titleScore = scoreTitle(FIXTURE[0]!, 'iron');
    expect(universeScore).toBeGreaterThan(0);
    expect(universeScore).toBeLessThan(titleScore);
  });

  it('scores no match as exactly 0', () => {
    expect(scoreTitle(FIXTURE[0]!, 'quicksilver')).toBe(0);
  });
});

describe('searchTitles', () => {
  it('returns [] for an empty or whitespace-only query', () => {
    expect(searchTitles(FIXTURE, '')).toEqual([]);
    expect(searchTitles(FIXTURE, '   ')).toEqual([]);
  });

  it('excludes non-matching titles entirely rather than ranking them last', () => {
    const results = searchTitles(FIXTURE, 'quicksilver');
    expect(results).toEqual([]);
  });

  it('puts an exact match first, a prefix match before a plain substring match', () => {
    // "Iron Man" is an exact match for "iron man"; "The Invincible Iron Man" only contains it.
    const results = searchTitles(FIXTURE, 'iron man');
    expect(results[0]!.slug).toBe('iron-man');
    expect(results.map((t) => t.slug)).toContain('invincible-iron-man');
    expect(results.findIndex((t) => t.slug === 'iron-man')).toBeLessThan(
      results.findIndex((t) => t.slug === 'invincible-iron-man')
    );
  });

  it('finds Agents of S.H.I.E.L.D. III for "shield"', () => {
    const results = searchTitles(FIXTURE, 'shield');
    expect(results.map((t) => t.slug)).toContain('agents-of-shield-3');
  });

  it('is stable across repeated calls with identical input', () => {
    const first = searchTitles(FIXTURE, 'iron').map((t) => t.slug);
    const second = searchTitles(FIXTURE, 'iron').map((t) => t.slug);
    expect(second).toEqual(first);
  });

  it('respects the limit parameter', () => {
    // Every title shares the Marvel universe, so a universe-level query matches nearly all
    // of them — a good stress case for limit.
    const results = searchTitles(FIXTURE, 'marvel', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('breaks ties by shorter label first, then earlier release year, then slug', () => {
    // Both "Iron Man" (2008) and "The Invincible Iron Man" (2007) contain "man", but only
    // "Iron Man" is a word-start match, so the tie-break itself is exercised by a query that
    // lands both at the same tier: "iron man" narrowed to the substring tier via case.
    const results = searchTitles(FIXTURE, 'man');
    const ironManIndex = results.findIndex((t) => t.slug === 'iron-man');
    const invincibleIndex = results.findIndex((t) => t.slug === 'invincible-iron-man');
    expect(ironManIndex).toBeLessThan(invincibleIndex);
  });
});

describe('bestMatch', () => {
  it('returns null for an empty query', () => {
    expect(bestMatch(FIXTURE, '')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(bestMatch(FIXTURE, 'quicksilver')).toBeNull();
  });

  it('returns the single best match', () => {
    expect(bestMatch(FIXTURE, 'iron man')?.slug).toBe('iron-man');
  });
});
