import { describe, expect, it } from 'vitest';
import { ROOM_BUMP_SCALE, roomSurfaceValue, type RoomSurface } from './roomSurfaces';

const SURFACES: RoomSurface[] = ['floor', 'plaster'];
const SIZE = 256;

describe('roomSurfaceValue', () => {
  it('always returns a value within 0..1', () => {
    for (const surface of SURFACES) {
      for (const [x, y] of [[0, 0], [1, 1], [255, 255], [128, 64], [64, 200], [200, 3]]) {
        const v = roomSurfaceValue(surface, x, y, SIZE);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic — same inputs, same output, every call', () => {
    for (const surface of SURFACES) {
      const a = roomSurfaceValue(surface, 37, 91, SIZE);
      const b = roomSurfaceValue(surface, 37, 91, SIZE);
      expect(a).toBe(b);
    }
  });

  it('wraps seamlessly on the x axis: x=0 matches x=size for every y sampled', () => {
    for (const surface of SURFACES) {
      for (const y of [0, 17, 64, 128, 200, 255]) {
        const left = roomSurfaceValue(surface, 0, y, SIZE);
        const right = roomSurfaceValue(surface, SIZE, y, SIZE);
        expect(right).toBeCloseTo(left, 10);
      }
    }
  });

  it('wraps seamlessly on the y axis: y=0 matches y=size for every x sampled', () => {
    for (const surface of SURFACES) {
      for (const x of [0, 17, 64, 128, 200, 255]) {
        const top = roomSurfaceValue(surface, x, 0, SIZE);
        const bottom = roomSurfaceValue(surface, x, SIZE, SIZE);
        expect(bottom).toBeCloseTo(top, 10);
      }
    }
  });

  it('wraps seamlessly across a plank column boundary, not just the tile edge', () => {
    // The long seam between plank columns is itself a periodic feature, cut into the
    // lattice at every integer column — not only at x=0/x=size. Sample either side of an
    // interior column boundary (there are 9 columns across 256px, so one lands near x=28)
    // and its mirror one full tile-width away; both must land on the same seam geometry.
    for (const y of [0, 40, 120, 255]) {
      const a = roomSurfaceValue('floor', 28, y, SIZE);
      const b = roomSurfaceValue('floor', 28 + SIZE, y, SIZE);
      expect(b).toBeCloseTo(a, 10);
    }
  });

  it('gives floor and plaster genuinely different fields, not the same noise relabelled', () => {
    const samplePoints: Array<[number, number]> = [[10, 10], [50, 120], [200, 30], [90, 200], [5, 250]];
    const floorValues = samplePoints.map(([x, y]) => roomSurfaceValue('floor', x, y, SIZE));
    const plasterValues = samplePoints.map(([x, y]) => roomSurfaceValue('plaster', x, y, SIZE));
    expect(floorValues).not.toEqual(plasterValues);
  });

  it('the floor has plank seams — sharp local transitions the plaster does not', () => {
    // A seam is a large jump between two neighbouring samples. Walk a fine-grained line
    // across the tile and track the biggest single-step delta for each surface: the floor's
    // groove pass guarantees at least one such jump per plank column crossed (9 of them
    // across this scanline), while the plaster's noise is smooth low-amplitude value noise
    // with nothing sharp built into it at all. Comparing the two surfaces' own worst-case
    // deltas is a fair, non-flaky way to assert "one has seams, the other doesn't" without
    // hard-coding a seam's exact pixel location.
    const step = 1;
    const y = 128;
    let maxFloorDelta = 0;
    let maxPlasterDelta = 0;
    let prevFloor = roomSurfaceValue('floor', 0, y, SIZE);
    let prevPlaster = roomSurfaceValue('plaster', 0, y, SIZE);
    for (let x = step; x <= SIZE; x += step) {
      const floor = roomSurfaceValue('floor', x, y, SIZE);
      const plaster = roomSurfaceValue('plaster', x, y, SIZE);
      maxFloorDelta = Math.max(maxFloorDelta, Math.abs(floor - prevFloor));
      maxPlasterDelta = Math.max(maxPlasterDelta, Math.abs(plaster - prevPlaster));
      prevFloor = floor;
      prevPlaster = plaster;
    }
    expect(maxFloorDelta).toBeGreaterThan(maxPlasterDelta * 3);
    expect(maxFloorDelta).toBeGreaterThan(0.05);
  });
});

describe('ROOM_BUMP_SCALE', () => {
  it('has a positive, plausibly small entry for both surfaces', () => {
    for (const surface of SURFACES) {
      expect(ROOM_BUMP_SCALE[surface]).toBeGreaterThan(0);
      expect(ROOM_BUMP_SCALE[surface]).toBeLessThan(0.2);
    }
  });

  it('makes the floor read stronger than the near-flat plaster, per the brief', () => {
    expect(ROOM_BUMP_SCALE.floor).toBeGreaterThan(ROOM_BUMP_SCALE.plaster);
  });
});
