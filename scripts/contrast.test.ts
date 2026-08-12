import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface ColorTokens {
  [key: string]: string;
}

let colors: ColorTokens;

/**
 * Parse hex color to RGB [0-1]
 */
function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = parseInt(cleaned.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Convert RGB channel [0-1] to linear RGB per WCAG 2.x
 */
function toLinearRgb(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Calculate relative luminance per WCAG 2.x
 */
function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const r_lin = toLinearRgb(r);
  const g_lin = toLinearRgb(g);
  const b_lin = toLinearRgb(b);
  return 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin;
}

/**
 * Calculate contrast ratio between two colors per WCAG 2.x
 * Returns ratio to one decimal place
 */
function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 10) / 10;
}

beforeAll(() => {
  const cssPath = resolve(__dirname, '../src/app/globals.css');
  const content = readFileSync(cssPath, 'utf-8');

  // Parse @theme block to extract color tokens
  const themeMatch = content.match(/@theme\s*\{([^}]+)\}/);
  if (!themeMatch) {
    throw new Error('Could not find @theme block in globals.css');
  }

  const themeBlock = themeMatch[1];
  colors = {};

  // Match lines like: --color-label-bright: #f2ebe1;
  const tokenRegex = /--(color-[\w-]+):\s*(#[0-9a-f]{6})/gi;
  let match;
  while ((match = tokenRegex.exec(themeBlock)) !== null) {
    const tokenName = match[1];
    const hexValue = match[2];
    colors[tokenName] = hexValue;
  }

  if (Object.keys(colors).length === 0) {
    throw new Error('No color tokens found in @theme block');
  }
});

describe('WCAG contrast ratios', () => {
  it('--color-label-bright on --color-shelf-dark should be ≥4.5:1', () => {
    const ratio = getContrastRatio(
      colors['color-label-bright'],
      colors['color-shelf-dark']
    );
    console.log(
      `label-bright on shelf-dark: ${ratio}:1 (claimed 16.0:1)`
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('--color-label-mid on --color-shelf-dark should be ≥4.5:1', () => {
    const ratio = getContrastRatio(
      colors['color-label-mid'],
      colors['color-shelf-dark']
    );
    console.log(
      `label-mid on shelf-dark: ${ratio}:1 (claimed 10.1:1)`
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('--color-label-dim on --color-shelf-dark should be ≥4.5:1', () => {
    const ratio = getContrastRatio(
      colors['color-label-dim'],
      colors['color-shelf-dark']
    );
    console.log(
      `label-dim on shelf-dark: ${ratio}:1 (claimed 5.0:1)`
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('--color-label-dim on --color-shelf-raised should be ≥4.5:1', () => {
    const ratio = getContrastRatio(
      colors['color-label-dim'],
      colors['color-shelf-raised']
    );
    console.log(
      `label-dim on shelf-raised: ${ratio}:1 (claimed 4.7:1)`
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The shelf caption is the one piece of text in this app that does not sit on a known
   * background: it floats over a WebGL canvas showing whatever cover art happens to be
   * behind it. Its scrim is therefore the background, and any transparency in that scrim
   * lets the artwork through.
   *
   * This is not hypothetical. The scrim shipped at 85% for an afternoon, and against a
   * bright cover the dim second line measured **3.16:1** — under the floor, invisible to the
   * token tests above, and invisible to a screenshot taken over a dark poster. The opacity
   * is read out of the component rather than restated here, so lowering it fails this test.
   */
  it('the shelf caption sits on a scrim opaque enough for its own text', () => {
    const scene = readFileSync(resolve(__dirname, '../src/app/shelf/ShelfScene.tsx'), 'utf-8');
    const scrim = scene.match(/rounded bg-shelf-dark(\/(\d+))?\s/);
    expect(scrim, 'the caption scrim was renamed; this test no longer guards it').not.toBeNull();

    const alpha = scrim![2] ? Number(scrim![2]) / 100 : 1;
    // Worst case is white artwork directly behind the caption.
    const behind = [1, 1, 1] as const;
    const scrimRgb = hexToRgb(colors['color-shelf-dark']).map(
      (channel, i) => alpha * channel + (1 - alpha) * behind[i]
    ) as [number, number, number];
    const scrimLuminance =
      0.2126 * toLinearRgb(scrimRgb[0]) + 0.7152 * toLinearRgb(scrimRgb[1]) + 0.0722 * toLinearRgb(scrimRgb[2]);

    // The caption's two lines: label-bright for the name, label-dim for the year and form.
    for (const token of ['color-label-bright', 'color-label-dim']) {
      const textLuminance = getLuminance(colors[token]);
      const ratio =
        (Math.max(textLuminance, scrimLuminance) + 0.05) / (Math.min(textLuminance, scrimLuminance) + 0.05);
      expect(ratio, `${token} on the caption scrim at ${alpha * 100}% over white artwork`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('--color-tungsten on --color-shelf-dark should be ≥4.5:1', () => {
    const ratio = getContrastRatio(
      colors['color-tungsten'],
      colors['color-shelf-dark']
    );
    console.log(
      `tungsten on shelf-dark: ${ratio}:1 (claimed 9.2:1)`
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
