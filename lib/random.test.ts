import { describe, expect, it } from "vitest";
import { createNoise, createRng, hashFloat, mulberry32 } from "./random";

describe("mulberry32", () => {
  it("gives the same sequence for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 1000 }, a);
    const seqB = Array.from({ length: 1000 }, b);
    expect(seqA).toEqual(seqB);
  });

  it("gives different sequences for different seeds", () => {
    const a = Array.from({ length: 10 }, mulberry32(1));
    const b = Array.from({ length: 10 }, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it("stays in [0, 1) and is roughly uniform", () => {
    const r = mulberry32(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]!++;
    }
    for (const count of buckets) expect(count).toBeGreaterThan(9_000);
  });
});

describe("createRng helpers", () => {
  it("range, int and pick are deterministic and in bounds", () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 500; i++) {
      const x = a.range(-5, 5);
      expect(x).toBe(b.range(-5, 5));
      expect(x).toBeGreaterThanOrEqual(-5);
      expect(x).toBeLessThan(5);
      const n = a.int(1, 6);
      expect(n).toBe(b.int(1, 6));
      expect(Number.isInteger(n) && n >= 1 && n <= 6).toBe(true);
      expect(a.pick(["x", "y", "z"])).toBe(b.pick(["x", "y", "z"]));
    }
  });

  it("gaussian has the right mean and spread", () => {
    const r = createRng(9);
    const xs = Array.from({ length: 20_000 }, () => r.gaussian(10, 2));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(10, 1);
    expect(sd).toBeCloseTo(2, 1);
  });
});

describe("seeded noise", () => {
  it("is deterministic per seed and smooth", () => {
    const n1 = createNoise(5);
    const n2 = createNoise(5);
    const n3 = createNoise(6);
    expect(n1.noise2(1.3, 2.7)).toBe(n2.noise2(1.3, 2.7));
    expect(n1.noise2(1.3, 2.7)).not.toBe(n3.noise2(1.3, 2.7));
    // Smooth: a tiny step changes the value only a little.
    const d = Math.abs(n1.noise3(4.2, 1.1, 0.3) - n1.noise3(4.201, 1.1, 0.3));
    expect(d).toBeLessThan(0.01);
  });
});

describe("hashFloat", () => {
  it("is stable and in [0, 1)", () => {
    expect(hashFloat(10, 3)).toBe(hashFloat(10, 3));
    expect(hashFloat(10, 3)).not.toBe(hashFloat(10, 4));
    for (let i = 0; i < 1000; i++) {
      const v = hashFloat(99, i);
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});
