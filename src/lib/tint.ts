import type { Medium } from './catalogue';

/**
 * Deterministic per-title colour, standing in for the extracted artwork palette until
 * that pipeline runs (see docs/06-progress.md — "Artwork pass" is still the next Phase 1
 * job). Same slug, same medium -> same colour, on every build and for every viewer.
 * Never Math.random: the shelf has to look identical on every visit, not merely varied.
 *
 * Medium contributes saturation/lightness so the shelf's ageing-by-era concept reads
 * faintly even in colour — VHS-era spines sit duller than steelbook-era ones — while the
 * hash of the slug supplies the hue, so titles on the same shelf still read as distinct
 * objects rather than one flat colour per era.
 */
/**
 * Saturation is kept low on purpose. The room is dark and lit by one warm lamp, and
 * printed card in that light reads dusty — a sage, an ochre, a faded rose — not a
 * saturated hue. An earlier pass ran these at 50–65% and the shelf came out as an
 * arbitrary rainbow that could have belonged to any subject; the screenshot is what
 * showed it. Low saturation lets the full hue range stay in play, so 152 titles are
 * still distinguishable, without any of them shouting.
 *
 * Lightness carries the era: VHS card is the dullest and most handled, steelbook the
 * brightest because metal catches the lamp.
 */
const MEDIUM_TONE: Record<Medium, { s: number; l: number }> = {
  vhs: { s: 16, l: 33 },
  amaray: { s: 22, l: 37 },
  bluray: { s: 26, l: 41 },
  steel: { s: 14, l: 50 },
  none: { s: 20, l: 35 },
};

/** A plain, deterministic string hash (djb2-style). No crypto needed for a colour. */
function hashSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** A CSS colour for `--tint`, ready to be mixed over `--color-shelf-raised`. */
export function titleTint(slug: string, medium: Medium): string {
  const hue = hashSlug(slug) % 360;
  const { s, l } = MEDIUM_TONE[medium];
  return `hsl(${hue} ${s}% ${l}%)`;
}
