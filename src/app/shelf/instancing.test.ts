import { describe, expect, it } from "vitest";
import {
  buildShelfLayout,
  cropCellUv,
  depthScale,
  carcassPieceCount,
  WALL_YAW,
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

describe("buildShelfLayout — one continuous run", () => {
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

  it("places every title exactly once, on its own universe's shelf", () => {
    expect(layout.universes.map((u) => u.key)).toEqual(["mcu", "sony"]);
    expect(layout.universes[0].items).toHaveLength(mcu.length);
    expect(layout.universes[1].items).toHaveLength(sony.length);
    expect(layout.media.flatMap((m) => m.slugs)).toHaveLength(mcu.length + sony.length);
  });

  it("puts every universe on a wall, and faces its cases the way the wall faces", () => {
    // Replaces an assertion that sections were adjacent along one run. They are not adjacent
    // any more — they are on three different walls — and the invariant that matters now is
    // that a bay and everything standing in it agree about which way is out of the wall. Get
    // this wrong and a whole universe faces into the plaster, silently.
    for (const u of layout.universes) {
      expect(WALL_YAW[u.wall]).toBeCloseTo(u.yaw, 6);
      for (const item of u.items) expect(item.yaw).toBeCloseTo(u.yaw, 6);
    }
    for (const u of layout.universes) expect([0, 1, 2]).toContain(u.wall);
  });

  it("spreads a full catalogue across all three walls", () => {
    // The two-universe fixture above quite correctly puts both on the back wall, either side
    // of the arch — so it cannot see whether the side walls are ever used. This one can, and
    // an empty side wall is exactly the bug that shipped: splitting the rest by their index
    // either side of the biggest left one wall bare whenever the biggest came first.
    const many: ShelfRun[] = Array.from({ length: 7 }, (_, i) => ({
      key: `u${i}`,
      label: `U${i}`,
      titles: Array.from({ length: 10 - i }, (_, j) => title(`u${i}-${j}`, "amaray")),
      floating: [],
    }));
    const wide = buildShelfLayout(many, {}, cellSize, 4096);
    expect(new Set(wide.universes.map((u) => u.wall))).toEqual(new Set([0, 1, 2]));
    // ...and neither side wall is left empty.
    for (const wall of [1, 2]) {
      expect(wide.universes.filter((u) => u.wall === wall).length).toBeGreaterThan(0);
    }
  });

  it("stands the cases at an even pitch along each shelf", () => {
    const bay = layout.universes[0];
    const along = (i: (typeof bay.items)[number]) => (bay.wall === 0 ? i.x : i.z);
    const byShelf = new Map<string, typeof bay.items>();
    for (const item of bay.items) {
      const foot = item.y.toFixed(4);
      byShelf.set(foot, [...(byShelf.get(foot) ?? []), item]);
    }
    const row = [...byShelf.values()].sort((a, b) => b.length - a.length)[0];
    if (row.length < 3) return; // nothing to say about a shelf holding one or two

    const at = row.map(along).sort((a, b) => a - b);
    const gaps = at.slice(1).map((v, i) => v - at[i]);
    // Evenly spaced, without naming the pitch — the number is a layout choice and will move,
    // but that the spacing is *uniform* is what must not. Uneven gaps mean the shelf index and
    // the column index have come apart, which reads as a few cases mysteriously bunched up.
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);
  });

  it("builds one run's worth of joinery, not one carcass per universe", () => {
    // Per section a board, a top and a back; then two ends for the whole run and a divider
    // between each pair. All instances of the same box, so the run is still the two board
    // draw calls it always was however many sections it grows.
    // At least the joinery. The brackets that hold the run on the wall are spaced by *length*
    // rather than by section, so they cannot be derived from the run count here — what must
    // hold is that every piece the layout emits has a wear value to go with it.
    expect(layout.boardSlabMatrices.length).toBeGreaterThanOrEqual(carcassPieceCount(runs.length));
    expect(layout.boardSlabWear).toHaveLength(layout.boardSlabMatrices.length);
    // One lip per board, and **more than one board per bay** — which is the whole of "it is a
    // cabinet, not a ledge". Every bay gets the same number, or the cabinet has a stepped top.
    expect(layout.boardLipMatrices.length % runs.length).toBe(0);
    expect(layout.boardLipMatrices.length / runs.length).toBeGreaterThan(1);
    expect(layout.boardLipWear).toHaveLength(layout.boardLipMatrices.length);
  });

  it("ages the run along its length rather than as one object", () => {
    // The point of one run over twelve bookcases: the wear gradient has to travel *through*
    // it. If every board took the same value the concept would be gone while the picture
    // looked identical, which is exactly the kind of regression a screenshot cannot catch.
    expect(new Set(layout.boardSlabWear).size).toBeGreaterThan(1);
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
    // Wear travels per board instance, not per material — that is what keeps a run whose
    // every section is a different age at two draw calls.
    expect(aged.boardSlabWear).toHaveLength(aged.boardSlabMatrices.length);
    expect(aged.boardLipWear).toHaveLength(aged.boardLipMatrices.length);
    // Each bay's joinery carries that bay's own age, and there is nothing between them to
    // take a middle value — the bays stand on walls now, not butted along one run.
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

  it("stands every case the same distance out from its own wall", () => {
    // Face-out, cases sit against the carcass rather than backs-aligned by width, so what has
    // to hold is that a bay's cases share one depth off their wall. A case drifting forward of
    // its shelf is the tell that a wall transform was applied twice, or not at all.
    for (const u of layout.universes) {
      const shelved = u.items.filter((i) => i.y < u.centreY + u.height);
      if (!shelved.length) continue;
      const depth = shelved.map((i) => (u.wall === 0 ? i.z : Math.abs(i.x)));
      expect(Math.max(...depth) - Math.min(...depth)).toBeLessThan(0.6);
    }
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
      // Nothing was built to hold these up — that is what "outside time" means here, and a
      // shelf appearing under them would quietly assert the opposite. Asserted by comparing
      // the same run with and without them, rather than against a count that has to be kept in
      // step with every piece of joinery the run grows.
      const without = buildShelfLayout(
        [{ key: "mcu", label: "MCU", titles: mcu, floating: [] }],
        cells,
        cellSize,
        4096
      );
      expect(withFloating.boardSlabMatrices).toHaveLength(without.boardSlabMatrices.length);
    });

    it("scatters them by a hash of the slug, so the same title hangs in the same place", () => {
      const again = buildShelfLayout([{ key: "mcu", label: "MCU", titles: mcu, floating }], cells, cellSize, 4096);
      const repeat = again.universes[0].items.filter((i) => floating.some((f) => f.slug === i.slug));
      expect(repeat.map((i) => [i.x, i.y, i.z])).toEqual(hung.map((i) => [i.x, i.y, i.z]));
      expect(hung[0].y).not.toBe(hung[1].y); // ...and not in a neat row
    });
  });
});
