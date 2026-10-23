import { rgba } from "@/lib/palettes";
import { tierScale } from "@/lib/quality";
import { createNoise, createRng, type Noise, type Rng } from "@/lib/random";
import { audioControls, audioDefaults, buildSchema } from "./params";
import type { ControlSpec, Sketch } from "./types";

/**
 * Flow field: a grid of angles sampled from smooth noise. Thousands of particles look up
 * the angle of the cell they're in and take a small step that way, leaving a trail.
 *
 *   noise(x·s, y·s, t) ──► angle per cell ──► particle.pos += (cos a, sin a) · speed
 *
 * Audio: bass → particle speed; treble → noise scale (busier, tighter swirls).
 */

const MAX_PARTICLES = 6000;
const CELL = 16; // px per field cell

const defaults = {
  palette: "ember",
  density: 0.65,
  speed: 1.4,
  noiseScale: 2.5,
  trail: 0.8,
  evolve: 0.3,
  weight: 1,
  colourBy: "angle",
  ...audioDefaults,
};

export type FlowParams = typeof defaults;

const controls: { [K in keyof FlowParams]: ControlSpec } = {
  palette: { kind: "palette", label: "Palette" },
  density: { kind: "number", label: "Density", min: 0.1, max: 1, step: 0.05 },
  speed: { kind: "number", label: "Speed", min: 0.2, max: 4, step: 0.1 },
  noiseScale: { kind: "number", label: "Noise scale", min: 0.5, max: 8, step: 0.1 },
  trail: { kind: "number", label: "Trail", min: 0, max: 1, step: 0.05 },
  evolve: { kind: "number", label: "Evolve", min: 0, max: 1, step: 0.05 },
  weight: { kind: "number", label: "Line weight", min: 0.5, max: 3, step: 0.1 },
  colourBy: {
    kind: "select",
    label: "Colour by",
    options: [
      { value: "angle", label: "Angle of travel" },
      { value: "seed", label: "Seeded" },
    ],
  },
  ...audioControls,
};

interface FlowState {
  n: number;
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  age: Float32Array;
  life: Float32Array;
  /** Seeded colour index per particle (used when colourBy = seed). */
  seedColour: Uint8Array;
  /** Colour index used this frame; 255 = don't draw (just respawned). */
  colour: Uint8Array;
  rng: Rng;
  noise: Noise;
  cols: number;
  rows: number;
  /** Unit direction per grid node, stored as (cos, sin) so it can be interpolated. */
  fx: Float32Array;
  fy: Float32Array;
  z: number;
  frame: number;
  paletteId: string;
  width: number;
  height: number;
}

function spawn(s: FlowState, i: number) {
  s.x[i] = s.rng.range(0, s.width);
  s.y[i] = s.rng.range(0, s.height);
  s.px[i] = s.x[i]!;
  s.py[i] = s.y[i]!;
  s.age[i] = 0;
  s.life[i] = s.rng.range(80, 260);
}

export const flowField: Sketch<FlowParams, FlowState> = {
  id: "flow",
  name: "Flow field",
  blurb: "Thousands of particles riding a noise-driven vector field.",
  defaults,
  schema: buildSchema("flow", defaults, controls),
  controls,
  resetOn: ["density"],
  stillFrames: 320,

  setup({ ctx, width, height }, { params, seed, tier, palette }) {
    const n = Math.max(200, Math.round(MAX_PARTICLES * params.density * tierScale(tier)));
    const cols = Math.ceil(width / CELL) + 1;
    const rows = Math.ceil(height / CELL) + 1;
    const s: FlowState = {
      n,
      x: new Float32Array(n),
      y: new Float32Array(n),
      px: new Float32Array(n),
      py: new Float32Array(n),
      age: new Float32Array(n),
      life: new Float32Array(n),
      seedColour: new Uint8Array(n),
      colour: new Uint8Array(n),
      rng: createRng(seed),
      noise: createNoise(seed),
      cols,
      rows,
      fx: new Float32Array(cols * rows),
      fy: new Float32Array(cols * rows),
      z: 0,
      frame: 0,
      paletteId: palette.id,
      width,
      height,
    };
    for (let i = 0; i < n; i++) {
      spawn(s, i);
      s.age[i] = s.rng.range(0, s.life[i]!); // stagger so they don't all respawn together
      s.seedColour[i] = s.rng.int(0, 255);
    }
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);
    return s;
  },

  draw({ ctx, width, height }, { params, palette, dt, reducedMotion }, audio, s) {
    const step = Math.min(3, dt * 60) * (reducedMotion ? 0.4 : 1);

    // Palette switched live: repaint the background once instead of resetting.
    if (palette.id !== s.paletteId) {
      s.paletteId = palette.id;
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
    }

    // Trails: a translucent veil over the previous frame instead of storing history.
    // trail 0 → alpha 0.3 (short), trail 1 → alpha 0.015 (long). Volume lengthens trails a bit.
    // The floor matters: with 8-bit colour, a tiny alpha can never fully reach the background,
    // which leaves a grey haze of old strokes.
    let fadeAlpha = Math.max(0.015, 0.3 * Math.pow(0.05, params.trail) * (1 - audio.volume * 0.3));
    // Every 20th frame a slightly stronger veil clears the residue that tiny alphas leave
    // (0.5 / 0.08 ≈ 6 levels instead of ≈ 33). It only darkens already-faded trails a
    // little, ~3×/s: no flash.
    s.frame++;
    if (s.frame % 20 === 0) fadeAlpha = Math.max(fadeAlpha, 0.08);
    ctx.fillStyle = rgba(palette.background, fadeAlpha);
    ctx.fillRect(0, 0, width, height);

    // 1. Rebuild the angle field. Treble tightens the noise (higher frequency swirls).
    const scale = (params.noiseScale / 1000) * (1 + audio.treble * 1.5);
    s.z += 0.004 * params.evolve * step;
    const { cols, rows, fx, fy, noise } = s;
    for (let r = 0; r < rows; r++) {
      const yy = r * CELL * scale;
      for (let c = 0; c < cols; c++) {
        // noise is ~[-1, 1]; ×3π lets angles wrap so the field curls instead of drifting one way
        const a = noise.noise3(c * CELL * scale, yy, s.z) * Math.PI * 3;
        fx[r * cols + c] = Math.cos(a);
        fy[r * cols + c] = Math.sin(a);
      }
    }

    // 2. Move particles. Bass pushes speed up to 4× on a loud kick.
    const v = params.speed * (1 + audio.bass * 3) * step;
    const nColours = palette.colors.length;
    const byAngle = params.colourBy === "angle";
    const TAU = Math.PI * 2;
    for (let i = 0; i < s.n; i++) {
      let x = s.x[i]!;
      let y = s.y[i]!;
      // Bilinear blend of the 4 surrounding grid vectors. Without it, every particle in a
      // cell gets the identical angle and they pile up along cell edges in hard blocks.
      const gx = Math.min(cols - 1.001, Math.max(0, x / CELL));
      const gy = Math.min(rows - 1.001, Math.max(0, y / CELL));
      const c0 = gx | 0;
      const r0 = gy | 0;
      const tx = gx - c0;
      const ty = gy - r0;
      const i00 = r0 * cols + c0;
      const i10 = i00 + 1;
      const i01 = i00 + cols;
      const i11 = i01 + 1;
      const dx =
        (fx[i00]! * (1 - tx) + fx[i10]! * tx) * (1 - ty) +
        (fx[i01]! * (1 - tx) + fx[i11]! * tx) * ty;
      const dy =
        (fy[i00]! * (1 - tx) + fy[i10]! * tx) * (1 - ty) +
        (fy[i01]! * (1 - tx) + fy[i11]! * tx) * ty;
      const a = Math.atan2(dy, dx);
      s.px[i] = x;
      s.py[i] = y;
      x += Math.cos(a) * v;
      y += Math.sin(a) * v;
      s.x[i] = x;
      s.y[i] = y;
      s.age[i]! += step;
      if (x < 0 || x > width || y < 0 || y > height || s.age[i]! > s.life[i]!) {
        spawn(s, i);
        s.colour[i] = 255;
        continue;
      }
      if (byAngle) {
        const norm = (((a % TAU) + TAU) % TAU) / TAU;
        s.colour[i] = Math.floor(norm * nColours) % nColours;
      } else {
        s.colour[i] = s.seedColour[i]! % nColours;
      }
    }

    // 3. Draw: one path per colour = a handful of stroke() calls instead of thousands.
    ctx.lineWidth = params.weight * (1 + (reducedMotion ? 0 : audio.beatPulse * 0.6));
    ctx.lineCap = "round";
    for (let k = 0; k < nColours; k++) {
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) {
        if (s.colour[i] !== k) continue;
        ctx.moveTo(s.px[i]!, s.py[i]!);
        ctx.lineTo(s.x[i]!, s.y[i]!);
      }
      ctx.strokeStyle = rgba(palette.colors[k]!, 0.7);
      ctx.stroke();
    }
  },
};
