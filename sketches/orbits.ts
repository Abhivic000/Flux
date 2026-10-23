import { rgba } from "@/lib/palettes";
import { tierScale } from "@/lib/quality";
import { createRng } from "@/lib/random";
import { audioControls, audioDefaults, buildSchema } from "./params";
import type { ControlSpec, Sketch } from "./types";

/**
 * Orbits: particles tracing Lissajous / harmonic curves.
 *
 *   x = A·sin(a·t + δ) + A·h·sin(3a·t + φ)
 *   y = B·sin(b·t)     + B·h·sin(3b·t + φ)      t = time + this particle's place on the curve
 *
 * The ratio a : b decides the figure (1:1 ellipse, 1:2 figure-eight, 3:2 pretzel…).
 * Audio: the mid band nudges a off its integer ratio so the figure twists and precesses;
 * volume lengthens trails (a lighter fade veil).
 *
 * Cost: N particles × 4 sin() + one batched path per colour ≈ 1 ms for 900 particles.
 */

const MAX_PARTICLES = 1200;

const defaults = {
  palette: "aurora",
  density: 0.7,
  ratioA: 3,
  ratioB: 2,
  harmonic: 0.25,
  spread: 0.6,
  speed: 1,
  trail: 0.75,
  weight: 1.2,
  ...audioDefaults,
};

export type OrbitParams = typeof defaults;

const controls: { [K in keyof OrbitParams]: ControlSpec } = {
  palette: { kind: "palette", label: "Palette" },
  density: { kind: "number", label: "Density", min: 0.1, max: 1, step: 0.05 },
  ratioA: { kind: "number", label: "Ratio a", min: 1, max: 7, step: 1 },
  ratioB: { kind: "number", label: "Ratio b", min: 1, max: 7, step: 1 },
  harmonic: { kind: "number", label: "Harmonic", min: 0, max: 0.6, step: 0.01 },
  spread: { kind: "number", label: "Spread", min: 0, max: 1, step: 0.05 },
  speed: { kind: "number", label: "Speed", min: 0.1, max: 3, step: 0.05, random: [0.4, 1.6] },
  trail: { kind: "number", label: "Trail", min: 0, max: 1, step: 0.05 },
  weight: { kind: "number", label: "Line weight", min: 0.5, max: 4, step: 0.1 },
  ...audioControls,
};

interface OrbitState {
  n: number;
  amp: Float32Array; // per-particle scale of A and B
  phase: Float32Array;
  phase2: Float32Array;
  colour: Uint8Array;
  px: Float32Array;
  py: Float32Array;
  xs: Float32Array;
  ys: Float32Array;
  t: number;
  nudge: number;
  paletteId: string;
  first: boolean;
}

export const orbits: Sketch<OrbitParams, OrbitState> = {
  id: "orbits",
  name: "Orbits",
  blurb: "Particles on harmonic Lissajous orbits. Mids twist the ratio.",
  defaults,
  schema: buildSchema("orbits", defaults, controls),
  controls,
  resetOn: ["density", "spread"],
  stillFrames: 360,

  setup({ ctx, width, height }, { params, seed, tier, palette }) {
    const rng = createRng(seed);
    const n = Math.max(60, Math.round(MAX_PARTICLES * params.density * tierScale(tier)));
    const s: OrbitState = {
      n,
      amp: new Float32Array(n),
      phase: new Float32Array(n),
      phase2: new Float32Array(n),
      colour: new Uint8Array(n),
      px: new Float32Array(n),
      py: new Float32Array(n),
      xs: new Float32Array(n),
      ys: new Float32Array(n),
      t: 0,
      nudge: 0,
      paletteId: palette.id,
      first: true,
    };
    for (let i = 0; i < n; i++) {
      s.amp[i] = 1 - params.spread * rng.next() ** 1.5;
      s.phase[i] = rng.range(0, Math.PI * 2);
      s.phase2[i] = rng.range(0, Math.PI * 2);
      s.colour[i] = rng.int(0, 255);
    }
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);
    return s;
  },

  draw({ ctx, width, height }, { params, palette, dt, reducedMotion }, audio, s) {
    const step = Math.min(3, dt * 60) * (reducedMotion ? 0.4 : 1);
    if (palette.id !== s.paletteId) {
      s.paletteId = palette.id;
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
    }
    // Volume → trail length: louder = lighter veil = longer trails.
    const fade = Math.max(0.02, 0.25 * Math.pow(0.06, params.trail) * (1 - audio.volume * 0.6));
    ctx.fillStyle = rgba(palette.background, fade);
    ctx.fillRect(0, 0, width, height);

    // Mid band nudges the frequency ratio (eased so it doesn't jitter).
    s.nudge += (audio.mid * 0.35 - s.nudge) * Math.min(1, dt * 4);
    s.t += 0.008 * params.speed * step;
    const a = params.ratioA + s.nudge;
    const b = params.ratioB;
    const h = params.harmonic;
    const cx = width / 2;
    const cy = height / 2;
    const A = width * 0.42;
    const B = height * 0.42;
    const t = s.t;
    const nColours = palette.colors.length;

    ctx.lineWidth = params.weight;
    ctx.lineCap = "round";
    // Compute positions once, then batch one path per colour.
    const { xs, ys } = s;
    // δ sets the figure's shape; drifting it slowly makes the whole figure turn over.
    const delta = Math.PI / 2 + t * 0.06;
    const norm = 1 / (1 + h);
    for (let i = 0; i < s.n; i++) {
      const k = s.amp[i]!;
      // Each particle sits at its own point along the curve (phase), so together they
      // draw the whole figure rather than moving as one clump.
      const ti = t + s.phase[i]!;
      const p2 = s.phase2[i]!;
      xs[i] = cx + A * k * norm * (Math.sin(a * ti + delta) + h * Math.sin(3 * a * ti + p2));
      ys[i] = cy + B * k * norm * (Math.sin(b * ti) + h * Math.sin(3 * b * ti + p2));
    }
    if (!s.first) {
      for (let c = 0; c < nColours; c++) {
        ctx.beginPath();
        for (let i = 0; i < s.n; i++) {
          if (s.colour[i]! % nColours !== c) continue;
          ctx.moveTo(s.px[i]!, s.py[i]!);
          ctx.lineTo(xs[i]!, ys[i]!);
        }
        ctx.strokeStyle = rgba(palette.colors[c]!, 0.75);
        ctx.stroke();
      }
    }
    s.px.set(xs);
    s.py.set(ys);
    s.first = false;
  },
};
