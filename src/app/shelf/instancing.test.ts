import { describe, expect, it } from "vitest";
import {
  buildShelfLayout,
  cropCellUv,
  depthScale,
  DIMENSIONS,
  LEVELS,
  levelsForRun,
  CARCASS_PIECES,
  runtimeLogRange,
  type ShelfRun,
  type ShelfTitleData,
} from "./instancing";

const title = (slug: string, medium: ShelfTitleData["medium"], extra: Partial<ShelfTitleData> = {}): ShelfTitleData => ({
  slug,
  label: slug,
  runtimeMin: 100,
  tint: "hsl(20 20% 40%)",
  medium,
  releaseYear: 2000,
  storyYear: 2000,
  ...extra,
});

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
  const range = runtimeLogRange([
    title("a", "amaray", { runtimeMin: 24 }),
    title("b", "amaray", { runtimeMin: 5025 }),
  ]);

  it("gives a null runtime the thinnest depth, never a fabricated middle", () => {
    expect(depthScale(null, range)).toBe(depthScale(24, range));
  });

  // The range itself is a design choice and moves; what must hold is that the shortest title
  // is the thinnest object, the longest the thickest, and the spread is wide enough to see.
  it("spreads the catalogue across a visibly different range of thicknesses", () => {
    const thinnest = depthScale(24, range);
    const thickest = depthScale(5025, range);
    expect(thinnest).toBeLessThan(1);
    expect(thickest).toBeGreaterThan(1);
    expect(thickest / thinnest).toBeGreaterThan(1.6);
  });

  it("orders a typical film thicker than the shortest title without pinning it to the max", () => {
    const s = depthScale(126, range); // a typical ~2h film
    expect(s).toBeGreaterThan(depthScale(24, range));
    expect(s).toBeLessThan(depthScale(5025, range) * 0.8); // well short of the multi-season max
  });

  it("does not divide by zero when every runtime is identical", () => {
    const flat = runtimeLogRange([title("a", "amaray")]);
    expect(depthScale(100, flat)).toBeGreaterThan(0);
    expect(Number.isFinite(depthScale(100, flat))).toBe(true);
  });
});

describe("buildShelfLayout — one shelf unit per universe", () => {
  const cellSize = { w: 256, h: 360 };
  const mcu: ShelfTitleData[] = Array.from({ length: 10 }, (_, i) =>
    title(`mcu-${i}`, i < 4 ? "vhs" : "amaray", { releaseYear: 1990 + i, storyYear: 1990 + i })
  );
  const sony: ShelfTitleData[] = Array.from({ length: 3 }, (_, i) => title(`sony-${i}`, "bluray"));
  const runs: ShelfRun[] = [
    { key: "mcu", label: "MCU", titles: mcu, floating: [] },
    { key: "sony", label: "Sony / Spider-Man", titles: sony, floating: [] },
  ];
  const cells = Object.fromEntries([...mcu, ...sony].map((t, i) => [t.slug, { x: i * 256, y: 0 }]));
  const layout = buildShelfLayout(runs, cells, cellSize, 4096);

  const positionOf = (slug: string) => {
    for (const shelf of layout.universes) {
      const item = shelf.items.find((i) => i.slug === slug);
      if (item) return item;
    }
    throw new Error(`${slug} was not placed`);
  };

  it("places every title exactly once, on its own universe's shelf", () => {
    expect(layout.universes.map((u) => u.key)).toEqual(["mcu", "sony"]);
    expect(layout.universes[0].items).toHaveLength(mcu.length);
    expect(layout.universes[1].items).toHaveLength(sony.length);
    expect(layout.media.flatMap((m) => m.slugs)).toHaveLength(mcu.length + sony.length);
  });

  it("stands the units side by side with clear air between them", () => {
    const [first, second] = layout.universes;
    expect(second.startX).toBeGreaterThan(first.endX + 1);
    // ...and every case on a unit is within that unit's own span.
    for (const item of second.items) expect(item.x).toBeGreaterThan(first.endX);
  });

  it("packs a shelf left to right with the spines a hair apart", () => {
    const row = mcu.slice(0, 4).map((t) => positionOf(t.slug));
    for (let i = 1; i < row.length; i++) expect(row[i].x).toBeGreaterThan(row[i - 1].x);

    // All standing on the same board. Their *centres* differ, because a VHS is taller than an
    // Amaray, so the thing that has to match is where their feet are — which is also the bug
    // this would catch: cases hovering above the board, or sunk into it.
    const feet = row.map((p) => (p.y - DIMENSIONS[p.form].h / 2).toFixed(6));
    expect(new Set(feet).size).toBe(1);

    // Adjacent spines are exactly one gap apart. This is the whole of "spine-out and packed":
    // if the advance ever went back to using case *width* the gap here would jump to ~100mm.
    const halfThickness = (p: (typeof row)[number]) => (DIMENSIONS[p.form].d * p.ds) / 2;
    expect(row[1].x - row[0].x - halfThickness(row[0]) - halfThickness(row[1])).toBeCloseTo(0.002, 6);
  });

  it("gives a longer collection more shelves, by length rather than by title count", () => {
    // Counting titles cannot work spine-out: these are the same number of titles and a
    // five-fold difference in shelf, because a streaming card is 3mm and a clamshell 32mm.
    expect(levelsForRun(0.3)).toBe(1);
    expect(levelsForRun(20)).toBeGreaterThan(levelsForRun(2));
    expect(levelsForRun(1000)).toBe(LEVELS); // never taller than a bookcase, however big
  });

  it("gives each unit its own carcass, so a universe reads as a piece of furniture", () => {
    // Four shelves plus a top, two uprights and a back — all instances of the same box, so
    // the whole room of bookcases is still the two board draw calls it always was.
    // Units are as tall as their collection needs, so the count is whatever the layout chose
    // — asserted against the layout itself rather than re-derived, since re-deriving it here
    // would only prove the test can run the same formula twice.
    const shelves = layout.universes.map((u) => u.levels);
    expect(shelves.every((l) => l >= 1 && l <= LEVELS)).toBe(true);
    expect(layout.boardSlabMatrices).toHaveLength(shelves.reduce((n, l) => n + l + CARCASS_PIECES, 0));
    expect(layout.boardLipMatrices).toHaveLength(shelves.reduce((n, l) => n + l, 0));
  });

  // Instance index is the whole of the picking lookup and of the pull: `slugs[instanceId]`
  // for a click, `item.instance` for the case being drawn out. If those two ever disagree,
  // the wrong case slides off the shelf and the wrong page opens — plausibly, silently.
  it("ages each unit's furniture by what stands on it, oldest most worn", () => {
    const old = Array.from({ length: 4 }, (_, i) => title(`old-${i}`, "vhs", { releaseYear: 1985 + i }));
    const recent = Array.from({ length: 4 }, (_, i) => title(`new-${i}`, "none", { releaseYear: 2024 + i }));
    const aged = buildShelfLayout(
      [
        { key: "old", label: "Classic", titles: old, floating: [] },
        { key: "new", label: "Animation", titles: recent, floating: [] },
      ],
      {},
      { w: 256, h: 360 },
      4096
    );
    expect(aged.universes[0].wear).toBe(1);
    expect(aged.universes[1].wear).toBe(0);
    // Wear travels per board instance, not per material — that is what keeps twelve
    // differently-aged bookcases at two draw calls.
    expect(aged.boardSlabWear).toHaveLength(aged.boardSlabMatrices.length);
    expect(aged.boardLipWear).toHaveLength(aged.boardLipMatrices.length);
    expect(new Set(aged.boardSlabWear)).toEqual(new Set([1, 0]));
  });

  it("agrees with itself about which instance is which title", () => {
    const byForm = new Map(layout.media.map((m) => [m.form, m]));
    for (const shelf of layout.universes) {
      for (const item of shelf.items) {
        expect(byForm.get(item.form)!.slugs[item.instance]).toBe(item.slug);
      }
    }
  });

  it("stands every case on its back edge, whatever its width", () => {
    // Spine-out, a case's *width* points into the shelf, so a 110mm VHS and a 135mm Amaray
    // reach different distances forward. Real shelves are loaded back-to-back, and that is
    // what makes the fronts step in and out — a detail you can only see once width is the
    // depth axis. The bug this catches is aligning their fronts (or their centres) instead,
    // which would bury the narrow ones behind their neighbours.
    const titles = [title("wide", "amaray"), title("narrow", "vhs")];
    const mixed = buildShelfLayout([{ key: "u", label: "U", titles, floating: [] }], {}, cellSize, 4096);
    const [wide, narrow] = mixed.universes[0].items;
    const backOf = (p: (typeof mixed.universes)[number]["items"][number]) => p.z - DIMENSIONS[p.form].w / 2;
    expect(backOf(narrow)).toBeCloseTo(backOf(wide), 6);
    expect(narrow.z).toBeLessThan(wide.z); // ...so the narrower one sits further back
  });

  describe("the titles that belong outside time", () => {
    const floating = [
      title("loki", "none", { storyYear: null }),
      title("what-if", "none", { storyYear: null }),
    ];
    const withFloating = buildShelfLayout(
      [{ key: "mcu", label: "MCU", titles: mcu, floating }],
      cells,
      cellSize,
      4096
    );
    const hung = withFloating.universes[0].items.filter((i) => floating.some((f) => f.slug === i.slug));

    it("hangs them above their own unit, with no board underneath", () => {
      expect(hung).toHaveLength(2);
      // Identify the shelved ones by slug. They used to be found with `z === 0`, which was
      // only ever true while every case sat at the same depth; spine-out they each sit at
      // their own width's worth of depth, and that filter would silently match nothing and
      // compare against -Infinity — a test that passes by having nothing to check.
      const shelvedSlugs = new Set(mcu.map((t) => t.slug));
      const topOfShelf = Math.max(
        ...withFloating.universes[0].items.filter((i) => shelvedSlugs.has(i.slug)).map((i) => i.y)
      );
      for (const item of hung) expect(item.y).toBeGreaterThan(topOfShelf);
      // The unit's furniture, unchanged. Nothing was built to hold these up.
      expect(withFloating.boardSlabMatrices).toHaveLength(
        withFloating.universes[0].levels + CARCASS_PIECES
      );
    });

    it("scatters them by a hash of the slug, so the same title hangs in the same place", () => {
      const again = buildShelfLayout([{ key: "mcu", label: "MCU", titles: mcu, floating }], cells, cellSize, 4096);
      const repeat = again.universes[0].items.filter((i) => floating.some((f) => f.slug === i.slug));
      expect(repeat.map((i) => [i.x, i.y, i.z])).toEqual(hung.map((i) => [i.x, i.y, i.z]));
      expect(hung[0].y).not.toBe(hung[1].y); // ...and not in a neat row
    });
  });
});
