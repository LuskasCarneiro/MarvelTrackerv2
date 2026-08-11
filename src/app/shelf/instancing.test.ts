import { describe, expect, it } from "vitest";
import {
  buildShelfLayout,
  cropCellUv,
  depthScale,
  DIMENSIONS,
  LEVELS,
  runtimeLogRange,
  type ShelfTitleData,
} from "./instancing";

describe("cropCellUv", () => {
  // Atlas cells are 256x360 (aspect 0.711). Face aspects on either side of that catch both
  // crop branches.
  const cellSize = { w: 256, h: 360 };
  const atlasSize = 4096;

  it("crops width and keeps full height when the cell is relatively wider than the face (vhs)", () => {
    const faceAspect = 110 / 197; // 0.558 — narrower than the cell
    const uv = cropCellUv({ x: 512, y: 720 }, cellSize, atlasSize, faceAspect);
    expect(uv.dv).toBeCloseTo(360 / atlasSize); // full cell height kept
    expect(uv.du).toBeLessThan(256 / atlasSize); // width cropped
    expect(uv.du / uv.dv).toBeCloseTo(faceAspect, 3);
  });

  it("crops height and keeps full width when the cell is relatively taller than the face (bluray)", () => {
    const faceAspect = 135 / 171; // 0.789 — wider than the cell
    const uv = cropCellUv({ x: 512, y: 720 }, cellSize, atlasSize, faceAspect);
    expect(uv.du).toBeCloseTo(256 / atlasSize); // full cell width kept
    expect(uv.dv).toBeLessThan(360 / atlasSize); // height cropped
    expect(uv.du / uv.dv).toBeCloseTo(faceAspect, 3);
  });

  // The trap the brief calls out by name: get the v-flip backwards and every cover renders
  // upside down without any error. A cell pinned to the atlas's top-left file corner must
  // land at the TOP of v-space (v0 + dv close to 1), not the bottom.
  it("maps a cell at the top of the file to the top of UV space (v flip)", () => {
    const uv = cropCellUv({ x: 0, y: 0 }, cellSize, atlasSize, cellSize.w / cellSize.h);
    expect(uv.v0 + uv.dv).toBeCloseTo(1, 6);
    expect(uv.v0).toBeCloseTo(1 - cellSize.h / atlasSize, 6);
  });
});

describe("depthScale", () => {
  const titles: ShelfTitleData[] = [
    { slug: "a", runtimeMin: 24, tint: "", medium: "amaray", releaseYear: 2000, storyYear: 2000 },
    { slug: "b", runtimeMin: 5025, tint: "", medium: "amaray", releaseYear: 2000, storyYear: 2000 },
  ];
  const range = runtimeLogRange(titles);

  it("gives a null runtime the thinnest depth, never a fabricated middle", () => {
    expect(depthScale(null, range)).toBe(0.8);
  });

  it("puts the catalogue minimum at 0.8x and the maximum at 1.2x", () => {
    expect(depthScale(24, range)).toBeCloseTo(0.8, 6);
    expect(depthScale(5025, range)).toBeCloseTo(1.2, 6);
  });

  it("orders a typical film thicker than the shortest title without pinning it to the max", () => {
    const s = depthScale(126, range); // a typical ~2h film
    expect(s).toBeGreaterThan(0.8);
    expect(s).toBeLessThan(1.0); // well short of the multi-season-series max
  });

  it("does not divide by zero when every runtime is identical", () => {
    const flat = runtimeLogRange([{ slug: "a", runtimeMin: 100, tint: "", medium: "amaray", releaseYear: 2000, storyYear: 2000 }]);
    expect(depthScale(100, flat)).toBe(1.0);
  });
});

describe("buildShelfLayout — one continuous run, column-major", () => {
  // Two eras' worth, enough to cross a medium boundary mid-run and to fill three columns.
  const run: ShelfTitleData[] = Array.from({ length: 10 }, (_, i) => ({
    slug: `t${i}`,
    runtimeMin: 100,
    tint: "hsl(20 20% 40%)",
    medium: i < 4 ? ("vhs" as const) : ("amaray" as const),
    releaseYear: 1990 + i,
    storyYear: 1990 + i,
  }));
  const cellSize = { w: 256, h: 360 };
  const cells = Object.fromEntries(run.map((t, i) => [t.slug, { x: i * 256, y: 0 }]));
  const layout = buildShelfLayout(run, cells, cellSize, 4096);

  // Instance order within a medium is run order — that is the whole of the picking lookup,
  // so a layout change that quietly reorders instances would send a click to the wrong title.
  const positions = new Map<string, { x: number; y: number }>();
  for (const bucket of layout.media) {
    bucket.slugs.forEach((slug, i) => {
      const p = bucket.bodyMatrices[i];
      positions.set(slug, { x: p.elements[12], y: p.elements[13] });
    });
  }

  it("places every title exactly once", () => {
    expect(positions.size).toBe(run.length);
  });

  it("fills top to bottom within a column, then steps right", () => {
    const column0 = run.slice(0, LEVELS).map((t) => positions.get(t.slug)!);
    // One column is one moment in time: same x, descending y.
    expect(new Set(column0.map((p) => p.x.toFixed(6))).size).toBe(1);
    for (let i = 1; i < column0.length; i++) expect(column0[i].y).toBeLessThan(column0[i - 1].y);
    // The next column stands to the right of it, clear of the widest case in column 0.
    expect(positions.get("t4")!.x).toBeGreaterThan(column0[0].x + DIMENSIONS.vhs.w / 2);
  });

  it("reuses the same four levels for every column, rather than growing downwards", () => {
    const levels = new Set([...positions.values()].map((p) => Math.round(p.y * 1000)));
    // vhs and amaray differ in height, so a level can carry two distinct case centres; what
    // must not happen is a new level per column.
    expect(levels.size).toBeLessThanOrEqual(LEVELS * 2);
    expect(layout.boardSlabMatrices).toHaveLength(LEVELS);
  });

  it("marks where each era begins, in run order, so the buttons travel rather than jump rows", () => {
    expect(layout.landmarks.map((l) => l.medium)).toEqual(["vhs", "amaray"]);
    expect(layout.landmarks[0].startX).toBeLessThan(layout.landmarks[1].startX);
  });

  it("keeps a narrow case centred in its column instead of shifting the run", () => {
    // t3 (vhs, 110mm) shares column 0 with three other vhs; t4 starts the amaray column.
    const mixed: ShelfTitleData[] = [
      { slug: "wide", runtimeMin: 100, tint: "", medium: "amaray", releaseYear: 2000, storyYear: 2000 },
      { slug: "narrow", runtimeMin: 100, tint: "", medium: "vhs", releaseYear: 1990, storyYear: 1990 },
    ];
    const mixedLayout = buildShelfLayout(mixed, {}, cellSize, 4096);
    const xs = mixedLayout.media.flatMap((m) => m.bodyMatrices.map((b) => b.elements[12]));
    expect(new Set(xs.map((x) => x.toFixed(6))).size).toBe(1);
  });

  describe("the titles that belong outside time", () => {
    const floating: ShelfTitleData[] = [
      { slug: "loki", runtimeMin: 300, tint: "", medium: "none", releaseYear: 2021, storyYear: null },
      { slug: "what-if", runtimeMin: 300, tint: "", medium: "none", releaseYear: 2021, storyYear: null },
    ];
    const withFloating = buildShelfLayout(run, cells, cellSize, 4096, floating);
    const floatingPositions = withFloating.media
      .flatMap((m) => m.slugs.map((slug, i) => ({ slug, m: m.bodyMatrices[i] })))
      .filter((p) => floating.some((f) => f.slug === p.slug));

    it("hangs them above the run, with no board underneath", () => {
      expect(floatingPositions).toHaveLength(2);
      for (const p of floatingPositions) expect(p.m.elements[13]).toBeGreaterThan(layout.bounds.maxY);
      // Still four boards: the run's furniture, unchanged. Nothing was built to hold these up.
      expect(withFloating.boardSlabMatrices).toHaveLength(LEVELS);
    });

    it("is clickable like anything else on the run", () => {
      const slugs = withFloating.media.flatMap((m) => m.slugs);
      expect(slugs).toContain("loki");
      expect(slugs.length).toBe(run.length + floating.length);
    });

    it("scatters them by a hash of the slug, so the same title hangs in the same place", () => {
      const again = buildShelfLayout(run, cells, cellSize, 4096, floating);
      const first = floatingPositions.map((p) => p.m.elements[12]);
      const repeat = again.media
        .flatMap((m) => m.slugs.map((slug, i) => ({ slug, x: m.bodyMatrices[i].elements[12] })))
        .filter((p) => floating.some((f) => f.slug === p.slug))
        .map((p) => p.x);
      expect(repeat).toEqual(first);
      // ...and not in a neat row.
      expect(floatingPositions[0].m.elements[13]).not.toBe(floatingPositions[1].m.elements[13]);
    });
  });
});
