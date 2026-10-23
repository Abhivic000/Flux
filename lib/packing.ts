import { createRng } from "./random";
import { SpatialGrid } from "./spatialGrid";

/**
 * Circle packing: try random points; at each free point grow a circle until it touches
 * a neighbour or the edge, then stop. "Grow until it touches" is computed in closed form
 * (distance to the nearest surface, via the spatial grid) instead of step by step.
 *
 * Pure function of its options → runs identically on the main thread or in a worker.
 */

export interface PackOptions {
  width: number;
  height: number;
  seed: number;
  /** Target number of circles. */
  count: number;
  minR: number;
  maxR: number;
  /** Gap kept between circles. */
  padding: number;
}

export interface PackResult {
  /** Flat [x, y, r, x, y, r, …] — one transferable buffer instead of thousands of objects. */
  circles: Float32Array;
  count: number;
  /** Generation time in ms. */
  ms: number;
}

export function packCircles(o: PackOptions): PackResult {
  const t0 = performance.now();
  const rng = createRng(o.seed);
  const grid = new SpatialGrid(o.width, o.height, o.maxR * 2, o.count);
  const maxAttempts = o.count * 40;
  for (let attempt = 0; attempt < maxAttempts && grid.count < o.count; attempt++) {
    const x = rng.range(0, o.width);
    const y = rng.range(0, o.height);
    // Big circles first: the allowed maximum shrinks as attempts go on, which gives the
    // classic mix of a few large circles filled in by many small ones.
    const progress = attempt / maxAttempts;
    const cap = Math.max(o.minR, o.maxR * (1 - progress) ** 2);
    const edge = Math.min(x, y, o.width - x, o.height - y) - o.padding;
    const r = Math.min(edge, grid.freeRadius(x, y, cap, o.padding));
    if (r >= o.minR) grid.insert(x, y, r);
  }
  const circles = new Float32Array(grid.count * 3);
  for (let i = 0; i < grid.count; i++) {
    circles[i * 3] = grid.xs[i]!;
    circles[i * 3 + 1] = grid.ys[i]!;
    circles[i * 3 + 2] = grid.rs[i]!;
  }
  return { circles, count: grid.count, ms: performance.now() - t0 };
}
