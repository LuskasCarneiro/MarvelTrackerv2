// Client-side accessor for /shelf/notes. Fetched once and memoised for the page's
// lifetime, so turning ten cases over makes one request, not ten — and a fetch that is
// already in flight is shared rather than duplicated.
let cache: Promise<Record<string, string>> | null = null;

/**
 * Fetches the slug -> note map once. Fails soft: a rejected fetch resolves to an empty
 * map rather than throwing, because a case back missing its blurb is a small loss and a
 * throw inside the WebGL frame loop takes the whole scene down (see docs/06-progress.md,
 * the shared masthead that did exactly that).
 */
export function loadNotes(): Promise<Record<string, string>> {
  if (!cache) {
    cache = fetch('/shelf/notes')
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return cache;
}
