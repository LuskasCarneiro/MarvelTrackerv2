/**
 * When a title's story happens, as a sortable year — for the shelf's story ordering.
 *
 * `chrono` is user-facing copy first and data second: it says "Christmas 2013" and
 * "5000 BC – 2024" because those are better answers than a number. This turns the ones that
 * can be placed on a line into a year and, just as importantly, **refuses to place the ones
 * that cannot**. See docs/05-3d-shelf.md §5: the 14 titles with no place on a timeline are
 * the point, not a data problem, and assigning them a plausible year would be the one change
 * that breaks the idea.
 *
 * Every rule below was written against the 51 distinct non-year strings actually present in
 * the catalogue, not against a guess at their shape.
 */

/**
 * The five titles whose chronology is stated relative to another film. Each needs one manual
 * reference and then resolves; there is no rule that could derive these, so they are listed
 * with the reasoning rather than pretended to be parseable.
 */
const RELATIVE: Record<string, number> = {
  // Elektra — set after Daredevil (2003), whose story is contemporary with its release.
  "after Daredevil": 2004,
  // Ghost Rider: Spirit of Vengeance — "years after the first" (Ghost Rider, c. 2007).
  "years after the first": 2011,
  // The Wolverine — opens after X-Men: The Last Stand (2006).
  "shortly after X3": 2007,
  // Black Widow — falls in the gap immediately after Captain America: Civil War (2016).
  "just after Civil War": 2016,
  // Ant-Man and the Wasp — its credits scene *is* the Snap, so the film sits just before it.
  "shortly before the Snap": 2018,
};

export function storyYear(chrono: string): number | null {
  const text = chrono.trim();
  if (text in RELATIVE) return RELATIVE[text];

  // Before the plain-year rule, or "5000 BC – 2024" resolves to 2024 — the end of the story
  // rather than its beginning, which would file Eternals with the present day.
  const bc = text.match(/(\d+)\s*BC/i);
  if (bc) return -Number(bc[1]);

  // The first year mentioned, which is the start of a range ("1942–1945"), the earlier of a
  // pair ("1944 and 1962"), and the year inside a phrase ("Christmas 2013", "c. 2004").
  const year = text.match(/\b(1\d{3}|2\d{3})\b/);
  if (year) return Number(year[1]);

  // A decade, which the rule above cannot see because "1980s" has no word boundary after the
  // digits: "the 1980s", "retro 1960s", "c. 2010s".
  const decade = text.match(/(\d{4})s\b/);
  if (decade) return Number(decade[1]);

  // "multiverse", "outside time", "its own reality", "several centuries", "various eras",
  // "ambiguous", "—". Deliberately unplaceable. Do not add a fallback here.
  return null;
}
