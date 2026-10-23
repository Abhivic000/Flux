import { encodeState } from "@/lib/urlState";
import { getSketch } from "@/sketches";
import type { BaseParams, ModeId } from "@/sketches/types";

/** Curated seeds + params. Each one is just a URL: mode, seed and a few overrides. */
export interface Preset {
  id: string;
  title: string;
  mode: ModeId;
  seed: number;
  params: BaseParams;
}

export const PRESETS: Preset[] = [
  { id: "ember-drift", title: "Ember drift", mode: "flow", seed: 777, params: {} },
  {
    id: "tidal",
    title: "Tidal",
    mode: "flow",
    seed: 48213,
    params: { palette: "tide", noiseScale: 1.4, trail: 0.9 },
  },
  {
    id: "riso-wind",
    title: "Riso wind",
    mode: "flow",
    seed: 3141,
    params: { palette: "risograph", colourBy: "seed", density: 0.45, weight: 1.6 },
  },
  { id: "bauhaus-rings", title: "Bauhaus rings", mode: "packing", seed: 4242, params: {} },
  {
    id: "pebble-beach",
    title: "Pebble beach",
    mode: "packing",
    seed: 908,
    params: { palette: "pebble", style: "solid", maxSize: 110, padding: 3 },
  },
  { id: "survey", title: "Survey sheet", mode: "terrain", seed: 4242, params: { levels: 18 } },
  {
    id: "blueprint",
    title: "Blueprint",
    mode: "terrain",
    seed: 2024,
    params: { palette: "blueprint", levels: 24, noiseScale: 3.2, weight: 0.8 },
  },
  {
    id: "aurora-knot",
    title: "Aurora knot",
    mode: "orbits",
    seed: 61,
    params: { ratioA: 5, ratioB: 4, harmonic: 0.35 },
  },
  {
    id: "brass-figure",
    title: "Brass figure-eight",
    mode: "orbits",
    seed: 1209,
    params: { palette: "brass", ratioA: 1, ratioB: 2, spread: 0.3 },
  },
  { id: "spring-tree", title: "Spring", mode: "tree", seed: 4242, params: { depth: 10 } },
  {
    id: "autumn-tree",
    title: "Autumn",
    mode: "tree",
    seed: 87,
    params: { palette: "autumn", angle: 34, shrink: 0.7, depth: 10, jitter: 0.6 },
  },
];

export function presetParams(p: Preset): BaseParams {
  return { ...getSketch(p.mode).defaults, ...p.params };
}

export function presetHref(p: Preset): string {
  return `/studio?${encodeState({ mode: p.mode, seed: p.seed, params: presetParams(p) })}`;
}
