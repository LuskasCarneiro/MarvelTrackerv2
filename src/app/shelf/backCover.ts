import { tintToHsl } from '../../lib/tint';

/** Case-face aspect ratio (width:height), matching the 3D geometry. */
const CASE_ASPECT = 135 / 190;

export type BackCoverData = {
  label: string; // display title, e.g. "Iron Man" or "Agents of S.H.I.E.L.D. III"
  formName: string; // e.g. "DVD Amaray", "35mm film can", "No physical release"
  yearLabel: string; // already formatted, e.g. "2008", "5000 BC", "Outside time"
  runtimeMin: number | null;
  universeLabel: string; // e.g. "Marvel Cinematic Universe"
  tint: string; // a CSS hsl() string in this project's space-separated form
};

/**
 * Pure. Minutes -> UK English duration.
 *
 * Series in this catalogue can carry huge runtimes (episode count x length, up to
 * ~5025 minutes for a season). Below 1000 minutes we still show the minute remainder
 * ("2 h 23 min") because it reads like a film; at and above 1000 the minutes are noise
 * a reader can't use, so we round to the nearest hour ("84 h") instead.
 */
export function formatRuntime(runtimeMin: number | null): string {
  if (runtimeMin === null || !Number.isFinite(runtimeMin) || runtimeMin < 0) {
    return 'Runtime unknown';
  }
  if (runtimeMin < 60) return `${runtimeMin} min`;
  if (runtimeMin >= 1000) return `${Math.round(runtimeMin / 60)} h`;
  const h = Math.floor(runtimeMin / 60);
  const min = runtimeMin % 60;
  return min === 0 ? `${h} h` : `${h} h ${min} min`;
}

/** CSS `hsl(H, S%, L%)` (comma form — canvas accepts this natively). */
function tintToCanvasColor(tint: string): string {
  const { h, s, l } = tintToHsl(tint);
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

/** Truncates a string to fit `maxWidth` on `ctx`, appending an ellipsis if it had to cut. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${text.slice(0, mid)}…`;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

/** Wraps `text` onto lines no wider than `maxWidth`, capped at `maxLines` (last line truncates). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  const last = lines[lines.length - 1];
  if (last !== undefined) lines[lines.length - 1] = fitText(ctx, last, maxWidth);
  return lines;
}

/**
 * Draws the back cover filling the whole canvas. Pure side effect on ctx.
 *
 * Font stacks are plain generics (sans-serif/serif) rather than next/font — this module
 * runs on a raw canvas outside React's render tree and has no access to font loading.
 */
export function drawBackCover(
  ctx: CanvasRenderingContext2D,
  data: BackCoverData,
  width: number,
  height: number
): void {
  const margin = width * 0.08;
  const contentWidth = width - margin * 2;
  const accent = tintToCanvasColor(data.tint);

  // Ground.
  ctx.fillStyle = '#1c1713';
  ctx.fillRect(0, 0, width, height);

  // Tint band at the top, the one splash of colour on the card.
  const bandHeight = height * 0.1;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, width, bandHeight);

  let y = bandHeight + height * 0.09;

  // Title.
  ctx.fillStyle = '#f2ebe1';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${Math.round(width * 0.065)}px sans-serif`;
  const titleLines = wrapText(ctx, data.label, contentWidth, 2);
  const titleLineHeight = width * 0.075;
  for (const line of titleLines) {
    ctx.fillText(line, margin, y);
    y += titleLineHeight;
  }

  // Thin rule under the title, in the tint.
  y += height * 0.02;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, width * 0.004);
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(width - margin, y);
  ctx.stroke();

  // Metadata block: labelled rows.
  y += height * 0.05;
  const rows: Array<[string, string]> = [
    ['Format', data.formName],
    ['Year', data.yearLabel],
    ['Runtime', formatRuntime(data.runtimeMin)],
    ['Universe', data.universeLabel],
  ];
  // The rows are spread across the space they actually have rather than set at a fixed
  // height. At a fixed height they finished a quarter of the way down and left the rest of
  // the card empty — which only shows up when you look at the thing rendered at the size a
  // reader sees it, never in the code. A real case back fills this area with a synopsis; this
  // one deliberately carries facts only (see ShelfScene's backTexture), so the facts have to
  // be what fills it.
  const labelFontSize = Math.round(width * 0.026);
  const valueFontSize = Math.round(width * 0.038);
  const rowsBottom = height * 0.8; // clear of the small print at 0.86
  const rowHeight = Math.max((rowsBottom - y) / rows.length, height * 0.055);
  for (const [label, value] of rows) {
    ctx.font = `${labelFontSize}px sans-serif`;
    ctx.fillStyle = '#8e8272';
    ctx.fillText(label.toUpperCase(), margin, y);
    ctx.font = `${valueFontSize}px sans-serif`;
    ctx.fillStyle = '#c8bcac';
    const valueText = fitText(ctx, value, contentWidth);
    // Off the label by the type size, not by a fraction of the row: the row now stretches to
    // fill the card, and a fraction of it would drift the value further from its own label
    // the taller the card gets.
    ctx.fillText(valueText, margin, y + valueFontSize * 1.3);
    // A hairline under each row, the way a spec block on real packaging is ruled off.
    ctx.strokeStyle = '#2a231c';
    ctx.lineWidth = Math.max(1, width * 0.002);
    ctx.beginPath();
    ctx.moveTo(margin, y + rowHeight * 0.72);
    ctx.lineTo(width - margin, y + rowHeight * 0.72);
    ctx.stroke();
    y += rowHeight;
  }

  // Statutory-small-print line, honest rather than a fake legal notice.
  const printY = height * 0.86;
  ctx.font = `${Math.round(width * 0.02)}px serif`;
  ctx.fillStyle = '#8e8272';
  const printText = 'Archive entry, not a retail release. Compiled for reference only.';
  ctx.fillText(fitText(ctx, printText, contentWidth), margin, printY);

  // Barcode: the strongest "this is the back of a case" signal.
  const barY = height * 0.9;
  const barHeight = height * 0.07;
  const barAreaWidth = contentWidth;
  ctx.fillStyle = '#f2ebe1';
  // Deterministic bar pattern from the label, so the same title always draws the same code.
  let seed = 0;
  for (let i = 0; i < data.label.length; i++) seed = (seed * 31 + data.label.charCodeAt(i)) | 0;
  seed = Math.abs(seed);
  let x = margin;
  const barCount = 40;
  const slot = barAreaWidth / barCount;
  for (let i = 0; i < barCount; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const barWidth = slot * (0.3 + (seed % 100) / 200); // 0.3–0.8 of the slot
    ctx.fillRect(x, barY, barWidth, barHeight);
    x += slot;
  }
}

/** Creates an offscreen canvas, draws, and returns it. */
export function renderBackCover(data: BackCoverData, width = 1024): HTMLCanvasElement {
  const height = Math.round(width / CASE_ASPECT);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('renderBackCover: 2D context unavailable');
  drawBackCover(ctx, data, width, height);
  return canvas;
}
