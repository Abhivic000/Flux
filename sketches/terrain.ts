import { marchingSquaresLevels } from "@/lib/contours";
import { rgba } from "@/lib/palettes";
import { tierScale } from "@/lib/quality";
import { createNoise, type Noise } from "@/lib/random";
import { audioControls, audioDefaults, buildSchema } from "./params";
import { svgDocument } from "./svg";
import type { ControlSpec, Sketch } from "./types";

/**
 * Terrain: a noise height map drawn as contour lines, like a survey map.
 *
 *   height(x, y) = blend of 2 noise octaves, drifting over time
 *                + spectrum[band of x] × relief × ridge(y)
 *
 * The spectrum runs low → high frequencies from left to right, so a bass hit raises
 * hills on the left and hi-hats on the right. Contours via marching squares
 * (lib/contours.ts); every 5th level is drawn heavier, like an index contour.
 *
 * Cost: ~7k cells × 2 noise samples + ~14 marching-squares passes ≈ 3–5 ms at 1080p.
 */

const defaults = {
  palette: "survey",
  levels: 14,
  noiseScale: 1.8,
  detail: 0.5,
  drift: 0.25,
  relief: 1,
  weight: 1.2,
  resolution: 0.7,
  ...audioDefaults,
};

export type TerrainParams = typeof defaults;

const controls: { [K in keyof TerrainParams]: ControlSpec } = {
  palette: { kind: "palette", label: "Palette" },
  levels: { kind: "number", label: "Levels", min: 4, max: 32, step: 1, random: [8, 24] },
  noiseScale: {
    kind: "number",
    label: "Noise scale",
    min: 0.5,
    max: 6,
    step: 0.1,
    random: [0.8, 3.5],
  },
  detail: { kind: "number", label: "Detail", min: 0, max: 1, step: 0.05 },
  drift: { kind: "number", label: "Drift", min: 0, max: 1, step: 0.05 },
  relief: { kind: "number", label: "Audio relief", min: 0, max: 2, step: 0.05 },
  weight: { kind: "number", label: "Line weight", min: 0.5, max: 3, step: 0.1 },
  resolution: { kind: "number", label: "Resolution", min: 0.3, max: 1, step: 0.05, noRandom: true },
  ...audioControls,
};

interface TerrainState {
  noise: Noise;
  cell: number;
  cols: number;
  rows: number;
  field: Float32Array;
  z: number;
}

function heightField(
  s: TerrainState,
  params: TerrainParams,
  spectrum: Float32Array,
  height: number,
) {
  const { cols, rows, cell, field, noise } = s;
  const scale = params.noiseScale / Math.max(400, height);
  const d = params.detail;
  const bands = spectrum.length;
  const audioGain = params.relief * 0.35;
  for (let j = 0; j < rows; j++) {
    const y = j * cell;
    const ny = y / height - 0.5;
    const ridge = Math.exp(-((ny / 0.28) ** 2)); // strongest across the middle
    for (let i = 0; i < cols; i++) {
      const x = i * cell;
      const n1 = noise.noise3(x * scale, y * scale, s.z);
      const n2 = noise.noise3(x * scale * 2.7 + 31, y * scale * 2.7, s.z * 1.6);
      // Perlin values cluster around 0 (rarely past ±0.7), so stretch them to fill 0..1
      // and every contour level actually gets used.
      let h = (n1 + n2 * 0.45 * d) / (1 + 0.45 * d);
      h = 0.5 + h * 0.85;
      const band = Math.min(bands - 1, Math.floor((i / cols) * bands));
      h += (spectrum[band] ?? 0) * audioGain * ridge;
      field[j * cols + i] = h;
    }
  }
}

export const terrain: Sketch<TerrainParams, TerrainState> = {
  id: "terrain",
  name: "Terrain",
  blurb: "A drifting height map drawn as contour lines. The spectrum raises the hills.",
  defaults,
  schema: buildSchema("terrain", defaults, controls),
  controls,
  resetOn: ["resolution"],
  stillFrames: 1,

  setup({ width, height }, { params, seed, tier }) {
    const cell = (22 - 14 * params.resolution) / Math.sqrt(tierScale(tier));
    const cols = Math.ceil(width / cell) + 1;
    const rows = Math.ceil(height / cell) + 1;
    return {
      noise: createNoise(seed),
      cell,
      cols,
      rows,
      field: new Float32Array(cols * rows),
      z: 0,
    };
  },

  draw({ ctx, width, height }, { params, palette, dt, reducedMotion }, audio, s) {
    s.z += dt * 0.12 * params.drift * (reducedMotion ? 0.4 : 1);
    heightField(s, params, audio.spectrum, height);

    // One marching-squares pass fills one Path2D per level, then ~levels stroke() calls.
    const paths = Array.from({ length: params.levels + 1 }, () => new Path2D());
    marchingSquaresLevels(s.field, s.cols, s.rows, s.cell, params.levels, (k, x1, y1, x2, y2) => {
      const path = paths[k]!;
      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
    });

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);
    // Butt caps: segments meet end to end, and round caps on thousands of tiny segments
    // are a large share of raster cost.
    ctx.lineCap = "butt";
    const n = palette.colors.length;
    for (let k = 1; k <= params.levels; k++) {
      const index = k % 5 === 0;
      ctx.lineWidth = params.weight * (index ? 2 : 1);
      ctx.strokeStyle = rgba(palette.colors[k % n]!, index ? 1 : 0.85);
      ctx.stroke(paths[k]!);
    }
  },

  toSVG(s, { params, palette }, width, height) {
    const n = palette.colors.length;
    const ds: string[] = new Array(params.levels + 1).fill("");
    marchingSquaresLevels(s.field, s.cols, s.rows, s.cell, params.levels, (k, x1, y1, x2, y2) => {
      ds[k] += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    });
    const paths: string[] = [];
    for (let k = 1; k <= params.levels; k++) {
      const d = ds[k];
      if (!d) continue;
      const index = k % 5 === 0;
      paths.push(
        `<path d="${d}" fill="none" stroke="${palette.colors[k % n]}" stroke-width="${(params.weight * (index ? 2 : 1)).toFixed(2)}" stroke-linecap="round"/>`,
      );
    }
    return svgDocument(width, height, palette.background, paths.join("\n"));
  },
};
