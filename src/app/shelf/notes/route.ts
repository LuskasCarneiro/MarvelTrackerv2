import { titles } from '@/lib/catalogue';

// Prerendered at build time: the underlying data is committed JSON, not a live source.
// Without this, a Route Handler's GET defaults to dynamic (per-request) in Next 16.
export const dynamic = 'force-static';

/**
 * `slug -> note` for all 152 titles, serving only what the back of a case draws — not the
 * rest of `Title` (poster paths, tmdbId, etc.), which nobody here reads.
 *
 * Kept out of `/shelf`'s own bundle on purpose: see `docs/06-progress.md`, "Prop or import,
 * it still ships". This module only ever runs server-side (Route Handlers are never bundled
 * for the client), so importing the full `titles` catalogue here is safe even though it
 * would not be safe from a Client Component.
 */
export async function GET() {
  const notes: Record<string, string> = {};
  for (const title of titles) {
    if (title.note) notes[title.slug] = title.note;
  }
  return Response.json(notes, {
    headers: {
      // Content only changes when the repo does (a rebuild), so it's safe to cache hard.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
