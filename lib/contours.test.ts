import { describe, expect, it } from "vitest";
import { marchingSquares, marchingSquaresLevels } from "./contours";

describe("marchingSquares", () => {
  it("traces a circle on a radial field", () => {
    const cols = 41;
    const rows = 41;
    const cell = 1;
    const field = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) field[j * cols + i] = Math.hypot(i - 20, j - 20);

    let length = 0;
    let segments = 0;
    marchingSquares(field, cols, rows, cell, 10, (x1, y1, x2, y2) => {
      segments++;
      length += Math.hypot(x2 - x1, y2 - y1);
      // Every endpoint lies on the circle of radius 10 (within interpolation error).
      expect(Math.abs(Math.hypot(x1 - 20, y1 - 20) - 10)).toBeLessThan(0.1);
    });
    expect(segments).toBeGreaterThan(40);
    expect(length).toBeGreaterThan(2 * Math.PI * 10 * 0.97);
    expect(length).toBeLessThan(2 * Math.PI * 10 * 1.03);
  });

  it("emits nothing when the level is outside the field", () => {
    const field = new Float32Array([0, 0, 0, 0]);
    let n = 0;
    marchingSquares(field, 2, 2, 10, 1, () => n++);
    expect(n).toBe(0);
  });
});

describe("marchingSquaresLevels", () => {
  it("emits the same segments as one single-level pass per level", () => {
    const cols = 30;
    const rows = 20;
    const field = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++)
        field[j * cols + i] = 0.5 + 0.45 * Math.sin(i * 0.3) * Math.cos(j * 0.4);
    const count = 9;
    const multi: string[] = [];
    marchingSquaresLevels(field, cols, rows, 5, count, (k, a, b, c, d) =>
      multi.push(`${k}:${a.toFixed(3)},${b.toFixed(3)},${c.toFixed(3)},${d.toFixed(3)}`),
    );
    const single: string[] = [];
    for (let k = 1; k <= count; k++) {
      marchingSquares(field, cols, rows, 5, k / (count + 1), (a, b, c, d) =>
        single.push(`${k}:${a.toFixed(3)},${b.toFixed(3)},${c.toFixed(3)},${d.toFixed(3)}`),
      );
    }
    expect(multi.sort()).toEqual(single.sort());
    expect(multi.length).toBeGreaterThan(100);
  });
});
