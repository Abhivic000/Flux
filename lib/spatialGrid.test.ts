import { describe, expect, it } from "vitest";
import { packCircles } from "./packing";
import { createRng } from "./random";
import { SpatialGrid } from "./spatialGrid";

describe("SpatialGrid.query", () => {
  it("matches a brute-force scan on random circles", () => {
    const rng = createRng(3);
    const W = 800;
    const H = 600;
    const grid = new SpatialGrid(W, H, 40, 8); // small capacity also exercises grow()
    const circles: [number, number, number][] = [];
    for (let i = 0; i < 600; i++) {
      const c: [number, number, number] = [rng.range(0, W), rng.range(0, H), rng.range(1, 20)];
      circles.push(c);
      grid.insert(...c);
    }
    for (let q = 0; q < 300; q++) {
      const x = rng.range(-20, W + 20);
      const y = rng.range(-20, H + 20);
      const r = rng.range(0, 30);
      const brute = circles
        .map(([cx, cy, cr], id) => ({ id, hit: Math.hypot(cx - x, cy - y) < r + cr }))
        .filter((c) => c.hit)
        .map((c) => c.id)
        .sort((a, b) => a - b);
      expect(grid.query(x, y, r).sort((a, b) => a - b)).toEqual(brute);
    }
  });

  it("finds circles in neighbouring cells, not just its own", () => {
    const grid = new SpatialGrid(100, 100, 10);
    const id = grid.insert(19, 5, 4); // cell (1, 0)
    expect(grid.query(11, 5, 4.5)).toEqual([id]); // query centred in same cell
    expect(grid.query(8, 5, 8)).toEqual([id]); // query centred in cell (0, 0)
    expect(grid.query(8, 5, 6)).toEqual([]); // just out of reach: 11 ≥ 6 + 4
  });

  it("freeRadius is the distance to the nearest surface", () => {
    const grid = new SpatialGrid(100, 100, 20);
    grid.insert(50, 50, 10);
    expect(grid.freeRadius(70, 50, 100)).toBeCloseTo(10);
    expect(grid.freeRadius(52, 50, 100)).toBeLessThan(0);
    expect(grid.freeRadius(5, 5, 3)).toBe(3);
  });
});

describe("packCircles", () => {
  it("never overlaps and is deterministic per seed", () => {
    const opts = { width: 500, height: 400, seed: 11, count: 800, minR: 2, maxR: 30, padding: 1 };
    const a = packCircles(opts);
    const b = packCircles(opts);
    expect(Array.from(a.circles)).toEqual(Array.from(b.circles));
    const c = a.circles;
    for (let i = 0; i < a.count; i++) {
      for (let j = i + 1; j < a.count; j++) {
        const d = Math.hypot(c[i * 3]! - c[j * 3]!, c[i * 3 + 1]! - c[j * 3 + 1]!);
        expect(d + 1e-3).toBeGreaterThanOrEqual(c[i * 3 + 2]! + c[j * 3 + 2]!);
      }
    }
    expect(a.count).toBeGreaterThan(300);
  });
});
