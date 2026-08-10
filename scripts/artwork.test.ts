import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Reads data/titles.json and data/artwork.json off disk rather than importing them, so the
 * test sees exactly what the pipeline wrote — and reimplements HSL<->RGB and the WCAG
 * contrast formula independently of scripts/build-artwork.ts, so a bug shared between
 * producer and test can't hide behind a shared implementation. Same approach as
 * scripts/contrast.test.ts, which does this for the CSS token contrast checks.
 */

type Medium = 'vhs' | 'amaray' | 'bluray' | 'steel' | 'none';

interface TitleRecord {
  slug: string;
  medium: Medium;
}

interface ArtworkRecord {
  poster: string | null;
  backdrops: string[];
  logo: string | null;
  tint: string;
  sourceColour: string | null;
  contrast: number;
}

const titles = JSON.parse(readFileSync('data/titles.json', 'utf-8')) as TitleRecord[];
const artwork = JSON.parse(readFileSync('data/artwork.json', 'utf-8')) as Record<string, ArtworkRecord>;

// Same table src/lib/tint.ts and scripts/build-artwork.ts condition against.
const MEDIUM_TONE: Record<Medium, { s: number; l: number }> = {
  vhs: { s: 16, l: 33 },
  amaray: { s: 22, l: 37 },
  bluray: { s: 26, l: 41 },
  steel: { s: 14, l: 50 },
  none: { s: 20, l: 35 },
};
const SAT_CLAMP = 6;

// The real WCAG AA floor. The pipeline enforces its own margin above this (see
// scripts/build-artwork.ts) — that margin is the pipeline's business, not this test's, so
// it is never referenced here. Asserting the margin would fail the moment someone
// legitimately retunes it.
const CONTRAST_FLOOR = 4.5;

const CHROMA_MIN = 26; // out of 255 — see build-artwork.ts's dominantColour

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hue2rgb = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const hn = h / 360;
  return {
    r: Math.round(hue2rgb(hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(hn) * 255),
    b: Math.round(hue2rgb(hn - 1 / 3) * 255),
  };
}

function linearChannel(c: number): number {
  const cn = c / 255;
  return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4);
}
function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** --color-label-bright from src/app/globals.css — the text every spine prints. */
const LABEL_BRIGHT: Rgb = { r: 0xf2, g: 0xeb, b: 0xe1 };

function parseHsl(tint: string): { h: number; s: number; l: number } | null {
  const m = tint.match(/^hsl\((\d+) (\d+)% (\d+)%\)$/);
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

describe('artwork.json', () => {
  it('has an entry for all 152 titles, and nothing extra', () => {
    const slugs = titles.map((t) => t.slug);
    const missing = slugs.filter((s) => !(s in artwork));
    const extra = Object.keys(artwork).filter((k) => !slugs.includes(k));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('gives every title a valid hsl() tint with saturation within ±6 of its medium', () => {
    const bad: string[] = [];
    for (const t of titles) {
      const a = artwork[t.slug];
      if (!a) continue; // caught by the previous test
      const parsed = parseHsl(a.tint);
      if (!parsed) {
        bad.push(`${t.slug}: unparseable tint "${a.tint}"`);
        continue;
      }
      const table = MEDIUM_TONE[t.medium];
      if (Math.abs(parsed.s - table.s) > SAT_CLAMP) {
        bad.push(`${t.slug}: saturation ${parsed.s} not within ±${SAT_CLAMP} of ${table.s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * Lightness starts at the medium's table value and is only ever reduced, never raised —
   * that part is a hard invariant, checked below. It is deliberately NOT held to the same
   * ±6 band as saturation: contrast is a hard floor (build-artwork.ts's conditionColour),
   * and for high-luminance hues on the brighter media — steel most of all, whose table
   * lightness of 50 sits closest to the label colour — clearing it needs a bigger drop. In
   * this catalogue that is dozens of titles, not a rare exception, so asserting a strict
   * ±6 here would be asserting something false about correct behaviour. The escape rate is
   * logged for a human to sanity-check; the thing that must always hold — contrast actually
   * clearing the floor — has its own test below.
   */
  it('never raises lightness above the medium table value', () => {
    const bad: string[] = [];
    let escapedBand = 0;
    let maxDrop = 0;
    for (const t of titles) {
      const a = artwork[t.slug];
      if (!a) continue;
      const parsed = parseHsl(a.tint);
      if (!parsed) continue; // caught by the previous test
      const table = MEDIUM_TONE[t.medium];
      if (parsed.l > table.l) bad.push(`${t.slug}: lightness ${parsed.l} exceeds table value ${table.l}`);
      const drop = table.l - parsed.l;
      if (drop > SAT_CLAMP) escapedBand++;
      if (drop > maxDrop) maxDrop = drop;
    }
    console.log(
      `lightness dropped more than ±${SAT_CLAMP} from its medium table value on ${escapedBand}/${titles.length} ` +
        `titles (max drop ${maxDrop}) — the contrast floor overriding the table on purpose, not a bug`,
    );
    expect(bad).toEqual([]);
  });

  it('clears the real WCAG floor (4.5:1) against --color-label-bright, recomputed independently', () => {
    const bad: string[] = [];
    for (const t of titles) {
      const a = artwork[t.slug];
      if (!a) continue;
      const parsed = parseHsl(a.tint);
      if (!parsed) continue;
      const ratio = contrastRatio(LABEL_BRIGHT, hslToRgb(parsed.h, parsed.s, parsed.l));
      if (ratio < CONTRAST_FLOOR) {
        bad.push(`${t.slug}: ${a.tint} -> ${ratio.toFixed(2)}:1 (recorded ${a.contrast})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('never takes a near-grey source colour as the extracted signal', () => {
    const bad: string[] = [];
    for (const t of titles) {
      const src = artwork[t.slug]?.sourceColour;
      if (!src) continue;
      const { r, g, b } = hexToRgb(src);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (chroma < CHROMA_MIN) bad.push(`${t.slug}: ${src} chroma ${chroma}`);
    }
    expect(bad).toEqual([]);
  });

  it('gives every non-null path a leading slash', () => {
    const bad: string[] = [];
    for (const t of titles) {
      const a = artwork[t.slug];
      if (!a) continue;
      if (a.poster && !a.poster.startsWith('/')) bad.push(`${t.slug}.poster: ${a.poster}`);
      if (a.logo && !a.logo.startsWith('/')) bad.push(`${t.slug}.logo: ${a.logo}`);
      a.backdrops.forEach((p, i) => {
        if (!p.startsWith('/')) bad.push(`${t.slug}.backdrops[${i}]: ${p}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('records how many titles are missing a poster, backdrop or logo', () => {
    const missingPoster = titles.filter((t) => artwork[t.slug]?.poster === null).length;
    const noBackdrops = titles.filter((t) => artwork[t.slug]?.backdrops.length === 0).length;
    const shortBackdrops = titles.filter((t) => (artwork[t.slug]?.backdrops.length ?? 0) < 3).length;
    const missingLogo = titles.filter((t) => artwork[t.slug]?.logo === null).length;
    console.log(
      `artwork gaps — poster: ${missingPoster}, logo: ${missingLogo}, ` +
        `backdrops: ${noBackdrops} with none, ${shortBackdrops} with fewer than 3 (of ${titles.length} titles)`,
    );
    // Missing art on an unreleased title or a niche special is real, not a bug — so this
    // only guards against wholesale pipeline failure (e.g. a bad token silently nulling
    // everything), not against any individual gap.
    const ceiling = Math.ceil(titles.length * 0.15);
    expect(missingPoster, 'suspiciously many missing posters').toBeLessThan(ceiling);
    expect(missingLogo, 'suspiciously many missing logos').toBeLessThan(ceiling);
    expect(noBackdrops, 'suspiciously many titles with zero backdrops').toBeLessThan(ceiling);
  });
});
