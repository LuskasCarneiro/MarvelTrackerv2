import { describe, expect, it } from "vitest";
import { cropCellUv, depthScale, runtimeLogRange, type ShelfRowData } from "./instancing";

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
  const rows: ShelfRowData[] = [
    { medium: "amaray", label: "DVD Amaray", titles: [{ slug: "a", runtimeMin: 24, tint: "" }, { slug: "b", runtimeMin: 5025, tint: "" }] },
  ];
  const range = runtimeLogRange(rows);

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
    const flat = runtimeLogRange([{ medium: "amaray", label: "DVD Amaray", titles: [{ slug: "a", runtimeMin: 100, tint: "" }] }]);
    expect(depthScale(100, flat)).toBe(1.0);
  });
});
