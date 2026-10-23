/**
 * Seeded randomness. Every random decision in a sketch goes through here, so the same
 * seed always produces the same picture (and a URL can carry the whole artwork).
 *
 * mulberry32: a 32-bit state, one add + a few xor-shift-multiply mixes per call.
 * Tiny, fast, and good enough statistically for art (not for crypto).
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0, 1)
  };
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Normal distribution via Box–Muller. */
  gaussian(mean?: number, sd?: number): number;
  chance(probability: number): boolean;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  let spare: number | null = null;
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    pick: (items) => {
      if (items.length === 0) throw new Error("pick() from empty list");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    gaussian: (mean = 0, sd = 1) => {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return mean + sd * v;
      }
      // Box–Muller: two uniforms → two independent standard normals.
      const u = Math.max(next(), 1e-12);
      const v = next();
      const mag = Math.sqrt(-2 * Math.log(u));
      spare = mag * Math.sin(2 * Math.PI * v);
      return mean + sd * mag * Math.cos(2 * Math.PI * v);
    },
    chance: (probability) => next() < probability,
  };
}

/**
 * Stateless hash → [0, 1). Use when a value must be stable per index regardless of how
 * many other random numbers were drawn (e.g. per-branch jitter in the tree mode).
 */
export function hashFloat(seed: number, n: number): number {
  let h = Math.imul((seed ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul(n + 1, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Derive an independent sub-seed (e.g. "seed for palette choice" vs "seed for particles"). */
export function subSeed(seed: number, salt: number): number {
  return Math.floor(hashFloat(seed, salt) * 4294967296) >>> 0;
}

export const MAX_SEED = 999_999;

/**
 * A fresh seed for "Randomise". This is the one place we want real entropy, so it uses
 * crypto — it is never called from inside a sketch.
 */
export function newSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return ((buf[0] as number) % MAX_SEED) + 1;
}

// ── Seeded Perlin noise ─────────────────────────────────────────────────────
// Ken Perlin's "improved noise" with a permutation table shuffled by our PRNG.
// Smooth: nearby inputs give nearby outputs. Output roughly in [-1, 1].

export interface Noise {
  noise2(x: number, y: number): number;
  noise3(x: number, y: number, z: number): number;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + t * (b - a);

function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function createNoise(seed: number): Noise {
  const rng = mulberry32(subSeed(seed, 7));
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i] as number;
    p[i] = p[j] as number;
    p[j] = tmp;
  }
  // Doubled table avoids wrapping indices with modulo in the hot path.
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255] as number;

  function noise3(x: number, y: number, z: number): number {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    const X = fx & 255;
    const Y = fy & 255;
    const Z = fz & 255;
    x -= fx;
    y -= fy;
    z -= fz;
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = perm[X]! + Y;
    const AA = perm[A]! + Z;
    const AB = perm[A + 1]! + Z;
    const B = perm[X + 1]! + Y;
    const BA = perm[B]! + Z;
    const BB = perm[B + 1]! + Z;
    return lerp(
      lerp(
        lerp(grad3(perm[AA]!, x, y, z), grad3(perm[BA]!, x - 1, y, z), u),
        lerp(grad3(perm[AB]!, x, y - 1, z), grad3(perm[BB]!, x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(grad3(perm[AA + 1]!, x, y, z - 1), grad3(perm[BA + 1]!, x - 1, y, z - 1), u),
        lerp(grad3(perm[AB + 1]!, x, y - 1, z - 1), grad3(perm[BB + 1]!, x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  }

  return {
    noise3,
    noise2: (x, y) => noise3(x, y, 0.5),
  };
}
