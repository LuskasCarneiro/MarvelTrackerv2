import { describe, expect, it } from 'vitest';
import { drawBackCover, formatRuntime, type BackCoverData } from './backCover';

describe('formatRuntime', () => {
  it('reports unknown for null', () => {
    expect(formatRuntime(null)).toBe('Runtime unknown');
  });

  it('guards non-finite and negative input by treating it as unknown', () => {
    expect(formatRuntime(NaN)).toBe('Runtime unknown');
    expect(formatRuntime(Infinity)).toBe('Runtime unknown');
    expect(formatRuntime(-5)).toBe('Runtime unknown');
  });

  it('shows minutes only under an hour', () => {
    expect(formatRuntime(47)).toBe('47 min');
    expect(formatRuntime(0)).toBe('0 min');
  });

  it('shows whole hours when exactly divisible by 60', () => {
    expect(formatRuntime(120)).toBe('2 h');
  });

  it('shows hours and minutes otherwise', () => {
    expect(formatRuntime(143)).toBe('2 h 23 min');
  });

  // Series runtimes in this catalogue run up to ~5025 min (episode count x length);
  // minutes stop being a useful reading at that scale, so 1000+ rounds to whole hours.
  it('rounds to whole hours at 1000 minutes and above', () => {
    expect(formatRuntime(1000)).toBe('17 h');
    expect(formatRuntime(5025)).toBe('84 h');
  });

  it('stays in minute-and-hour form just under the 1000 threshold', () => {
    expect(formatRuntime(999)).toBe('16 h 39 min');
  });
});

/**
 * A minimal recording stub of CanvasRenderingContext2D — just the calls drawBackCover
 * actually makes. There is no jsdom canvas in this project, and a full fake of the canvas
 * API would be more brittle than the code it tests, so this only records what we assert on.
 */
function makeStubCtx() {
  const fillTextCalls: Array<{ text: string; x: number; y: number }> = [];
  const stub = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    fillRect: () => {},
    fillText: (text: string, x: number, y: number) => {
      fillTextCalls.push({ text, x, y });
    },
    measureText: (text: string) => ({ width: text.length * 8 }) as TextMetrics,
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
  };
  return { ctx: stub as unknown as CanvasRenderingContext2D, fillTextCalls };
}

describe('drawBackCover', () => {
  const data: BackCoverData = {
    label: 'Agents of S.H.I.E.L.D. III',
    formName: 'DVD Amaray',
    yearLabel: '2015',
    runtimeMin: 946,
    universeLabel: 'Marvel Cinematic Universe',
    tint: 'hsl(25 21% 37%)',
  };

  it('draws the title somewhere on the card', () => {
    const { ctx, fillTextCalls } = makeStubCtx();
    drawBackCover(ctx, data, 1024, Math.round(1024 / (135 / 190)));
    const drawnText = fillTextCalls.map((c) => c.text).join(' ');
    // Long titles wrap/truncate, so check for the start of the label rather than the whole string.
    expect(drawnText).toContain('Agents of');
  });

  it('never draws text outside the canvas bounds', () => {
    const width = 1024;
    const height = Math.round(width / (135 / 190));
    const { ctx, fillTextCalls } = makeStubCtx();
    drawBackCover(ctx, data, width, height);
    expect(fillTextCalls.length).toBeGreaterThan(0);
    for (const call of fillTextCalls) {
      expect(call.x).toBeGreaterThanOrEqual(0);
      expect(call.x).toBeLessThanOrEqual(width);
      expect(call.y).toBeGreaterThanOrEqual(0);
      expect(call.y).toBeLessThanOrEqual(height);
    }
  });
});
