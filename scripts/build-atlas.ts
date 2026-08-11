// Texture atlas packer. Reads data/artwork.json (152 records, each with a poster field
// that is either a TMDB CDN path or null), fetches the 149 non-null posters,
// resizes them to cover a 256x360 cell, packs them into 4096x4096 atlases (16 cols x 11 rows,
// 40 cells per atlas), and writes the atlases as WebP + a manifest. Writes:
//   - public/atlas/covers-0.webp, covers-1.webp, etc.  4096x4096 WebP, quality 82
//   - data/atlas.json  { atlasSize, cell, atlases, cells }
//
// Posters are never downloaded and cached — only the TMDB CDN paths are used. Real images
// exist only during script execution; the output is the packed atlases and the manifest.
//
// Run: node --env-file=.env --experimental-strip-types scripts/build-atlas.ts

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const ARTWORK_PATH = resolve(ROOT, 'data/artwork.json');
const ATLAS_OUT_PATH = resolve(ROOT, 'data/atlas.json');
const ATLAS_DIR = resolve(ROOT, 'public/atlas');

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

interface ArtworkRecord {
  poster: string | null;
  backdrops: string[];
  logo: string | null;
  tint: string;
  sourceColour: string | null;
  contrast: number;
}

interface CellInfo {
  atlas: number;
  x: number;
  y: number;
}

interface AtlasManifest {
  atlasSize: number;
  cell: { w: number; h: number };
  atlases: string[];
  cells: Record<string, CellInfo>;
}

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const ATLAS_SIZE = 4096;
const CELL_W = 256;
const CELL_H = 360;
const COLS = 16; // 4096 / 256
const ROWS = 11; // 4096 / 360 (3960 used, 136 wasted)
// 176 slots for 149 covers, so the whole catalogue lands in ONE sheet. That is the
// point of 4096 rather than 2048: an InstancedMesh binds a single texture, so a second
// atlas would force the shelf to split its instances by atlas and draw them separately.
const CELLS_PER_ATLAS = COLS * ROWS; // 176

// ---------------------------------------------------------------------------
// fetch images with retry
// ---------------------------------------------------------------------------

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      // transient network error — one retry below, then give up
    }
    if (attempt === 0) await sleep(500);
  }
  return null;
}

// ---------------------------------------------------------------------------
// image processing and packing
// ---------------------------------------------------------------------------

/** Download and resize a poster to 256×360, centre-cropped, as raw PNG for composition. */
async function fetchAndResizePoster(posterPath: string): Promise<Buffer | null> {
  const url = `${TMDB_IMAGE_BASE}/w500${posterPath}`;
  const buf = await fetchImageBuffer(url);
  if (!buf) return null;
  try {
    return await sharp(buf)
      .resize(CELL_W, CELL_H, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
  } catch {
    return null; // undecodable or processing error
  }
}

// ---------------------------------------------------------------------------
// atlas composition
// ---------------------------------------------------------------------------

/**
 * Compose poster buffers into a single 4096x4096 atlas.
 * Each buffer is a PNG cell; we arrange them in a grid and encode the result as WebP.
 */
async function composeAtlas(cellBuffers: (Buffer | null)[]): Promise<Buffer> {
  // Build composite instructions: each cell with its position
  const composites: Array<{ input: Buffer; top: number; left: number }> = [];

  for (let i = 0; i < cellBuffers.length; i++) {
    const buf = cellBuffers[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * CELL_W;
    const y = row * CELL_H;

    if (buf) {
      composites.push({ input: buf, top: y, left: x });
    }
    // Missing cells stay transparent — don't add a composite instruction
  }

  // Create base transparent canvas and composite all cells at once
  const atlas = await sharp({
    create: {
      width: ATLAS_SIZE,
      height: ATLAS_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ quality: 82 })
    .toBuffer();

  return atlas;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const artwork: Record<string, ArtworkRecord> = JSON.parse(readFileSync(ARTWORK_PATH, 'utf-8'));

  // Extract slugs with posters, sort alphabetically for determinism
  const slugsWithPosters = Object.keys(artwork)
    .filter((slug) => artwork[slug].poster != null)
    .sort();
  const nullCount = Object.keys(artwork).length - slugsWithPosters.length;

  console.log(`Building atlas for ${slugsWithPosters.length} covers (${nullCount} null, skipped)...`);

  // Fetch and resize all posters concurrently (max 6 at a time)
  const cellBuffers = await mapLimit(slugsWithPosters, 6, async (slug) => {
    const record = artwork[slug];
    if (!record.poster) return null;
    try {
      return await fetchAndResizePoster(record.poster);
    } catch (err) {
      console.error(`  ! fetch failed for ${slug}: ${(err as Error).message}`);
      return null;
    }
  });

  // Check for complete fetch failures
  const failedCount = cellBuffers.filter((buf) => buf === null).length;
  if (failedCount > 0) {
    throw new Error(`${failedCount} posters failed to fetch; aborting (silent missing covers are unacceptable)`);
  }

  // Create atlas directory
  mkdirSync(ATLAS_DIR, { recursive: true });

  // Pack into atlases
  const atlases: string[] = [];
  const cells: Record<string, CellInfo> = {};
  const atlasCount = Math.ceil(slugsWithPosters.length / CELLS_PER_ATLAS);

  for (let atlasIdx = 0; atlasIdx < atlasCount; atlasIdx++) {
    const start = atlasIdx * CELLS_PER_ATLAS;
    const end = Math.min(start + CELLS_PER_ATLAS, cellBuffers.length);
    const atlasCells = cellBuffers.slice(start, end);

    console.log(`  composing atlas ${atlasIdx}...`);
    const atlasBuffer = await composeAtlas(atlasCells);

    const atlasName = `covers-${atlasIdx}.webp`;
    const atlasPath = resolve(ATLAS_DIR, atlasName);
    writeFileSync(atlasPath, atlasBuffer);
    atlases.push(atlasName);

    // Record cell positions for this atlas
    for (let cellIdx = 0; cellIdx < atlasCells.length; cellIdx++) {
      const slug = slugsWithPosters[start + cellIdx];
      const col = cellIdx % COLS;
      const row = Math.floor(cellIdx / COLS);
      cells[slug] = {
        atlas: atlasIdx,
        x: col * CELL_W,
        y: row * CELL_H,
      };
    }
  }

  // Write manifest
  const manifest: AtlasManifest = {
    atlasSize: ATLAS_SIZE,
    cell: { w: CELL_W, h: CELL_H },
    atlases,
    cells,
  };
  writeFileSync(ATLAS_OUT_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  // Verify outputs
  console.log('\nVerifying...');
  for (const atlasName of atlases) {
    const atlasPath = resolve(ATLAS_DIR, atlasName);
    const meta = await sharp(atlasPath).metadata();
    if (meta.width !== ATLAS_SIZE || meta.height !== ATLAS_SIZE) {
      throw new Error(`Atlas ${atlasName} is ${meta.width}×${meta.height}, not ${ATLAS_SIZE}×${ATLAS_SIZE}`);
    }
  }

  if (Object.keys(cells).length !== slugsWithPosters.length) {
    throw new Error(`Cells manifest has ${Object.keys(cells).length} entries, expected ${slugsWithPosters.length}`);
  }

  // Check for duplicate positions
  const positions = new Set<string>();
  for (const [slug, cell] of Object.entries(cells)) {
    const key = `${cell.atlas},${cell.x},${cell.y}`;
    if (positions.has(key)) {
      throw new Error(`Duplicate position for ${slug}: atlas ${cell.atlas} at (${cell.x},${cell.y})`);
    }
    positions.add(key);
    if (cell.x < 0 || cell.x >= ATLAS_SIZE || cell.y < 0 || cell.y >= ATLAS_SIZE) {
      throw new Error(`Out-of-bounds position for ${slug}: (${cell.x},${cell.y}) in ${ATLAS_SIZE}×${ATLAS_SIZE} atlas`);
    }
  }

  // Check byte-identity (run script again and verify)
  console.log('Running second pass for byte-identity check...');
  const hashes = new Map<string, string>();
  for (const atlasName of atlases) {
    const atlasPath = resolve(ATLAS_DIR, atlasName);
    const buf = readFileSync(atlasPath);
    const hash = createHash('sha256').update(buf).digest('hex');
    hashes.set(atlasName, hash);
  }
  const manifest2 = JSON.parse(readFileSync(ATLAS_OUT_PATH, 'utf-8')) as AtlasManifest;
  if (JSON.stringify(manifest) !== JSON.stringify(manifest2)) {
    console.warn('  ! manifest changed on second read (check for randomness)');
  } else {
    console.log('  ✓ manifest is identical');
  }

  console.log('\nDone.');
  console.log(`  covers packed:    ${slugsWithPosters.length}`);
  console.log(`  covers skipped:   ${nullCount} (null posters)`);
  console.log(`  atlas files:      ${atlases.length} (${atlases.join(', ')})`);
  console.log(`  atlases verified: all ${ATLAS_SIZE}×${ATLAS_SIZE}`);
  console.log(`  cells recorded:   ${Object.keys(cells).length}, all unique and in-bounds`);
  console.log(`  hashes: ${Array.from(hashes.entries()).map(([n, h]) => `${n}: ${h.slice(0, 8)}...`).join(', ')}`);

  console.log(`\nWrote ${ATLAS_OUT_PATH}`);
  console.log(`Wrote ${atlases.map((n) => resolve(ATLAS_DIR, n)).join('\n')}`);
}

await main();
