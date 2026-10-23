import { rgba } from "@/lib/palettes";
import { packInWorker } from "@/lib/packingClient";
import { tierScale } from "@/lib/quality";
import { createRng, hashFloat, type Rng } from "@/lib/random";
import { SpatialGrid } from "@/lib/spatialGrid";
import { audioControls, audioDefaults, buildSchema } from "./params";
import { svgDocument } from "./svg";
import type { ControlSpec, Palette, Sketch } from "./types";

/**
 * Circle packing. The initial packing (thousands of circles) is generated in a Web
 * Worker so the canvas never freezes; the main thread then reveals it progressively.
 * Audio: each beat onset spawns new circles that grow until they touch a neighbour —
 * those few live collision checks use the same spatial grid on the main thread.
 *
 * Per-frame cost is tiny: only newly revealed / growing circles are drawn; the canvas
 * keeps everything else from previous frames.
 */

const MAX_CIRCLES = 4000;

const defaults = {
  palette: "bauhaus",
  density: 0.6,
  maxSize: 70,
  minSize: 2,
  padding: 2,
  style: "rings",
  weight: 1.2,
  reveal: 1,
  ...audioDefaults,
};

export type PackingParams = typeof defaults;

const controls: { [K in keyof PackingParams]: ControlSpec } = {
  palette: { kind: "palette", label: "Palette" },
  density: { kind: "number", label: "Density", min: 0.1, max: 1, step: 0.05 },
  maxSize: { kind: "number", label: "Max size", min: 10, max: 160, step: 1, random: [25, 120] },
  minSize: { kind: "number", label: "Min size", min: 1, max: 8, step: 0.5 },
  padding: { kind: "number", label: "Gap", min: 0, max: 8, step: 0.5 },
  style: {
    kind: "select",
    label: "Style",
    options: [
      { value: "rings", label: "Rings" },
      { value: "solid", label: "Solid" },
      { value: "outline", label: "Outline" },
    ],
  },
  weight: { kind: "number", label: "Line weight", min: 0.5, max: 4, step: 0.1 },
  reveal: { kind: "number", label: "Reveal speed", min: 0.2, max: 3, step: 0.1 },
  ...audioControls,
};

interface Growing {
  x: number;
  y: number;
  r: number;
  id: number;
}

interface PackingState {
  grid: SpatialGrid | null;
  revealed: number;
  growing: Growing[];
  ready: Promise<void>;
  disposed: boolean;
  rng: Rng;
  spawnId: number;
  sinceSpawn: number;
  look: string;
  /** Grid index → spawn id for beat-spawned circles, so they keep the colour they grew with. */
  colourIds: Map<number, number>;
}

function colourFor(seed: number, id: number, palette: Palette, s?: PackingState): string {
  const key = s?.colourIds.get(id) ?? id;
  return palette.colors[Math.floor(hashFloat(seed, key) * palette.colors.length)]!;
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colour: string,
  style: string,
  weight: number,
  background: string,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (style === "outline") {
    ctx.strokeStyle = colour;
    ctx.lineWidth = weight;
    ctx.stroke();
    return;
  }
  ctx.fillStyle = colour;
  ctx.fill();
  if (style === "rings" && r > 6) {
    ctx.strokeStyle = rgba(background, 0.55);
    ctx.lineWidth = weight * 0.8;
    ctx.beginPath();
    const gap = 4 + weight * 3;
    for (let rr = r - gap; rr > gap * 0.6; rr -= gap) {
      ctx.moveTo(x + rr, y);
      ctx.arc(x, y, rr, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
}

export const circlePacking: Sketch<PackingParams, PackingState> = {
  id: "packing",
  name: "Circle packing",
  blurb: "Circles grow until they touch. Beats plant new ones.",
  defaults,
  schema: buildSchema("packing", defaults, controls),
  controls,
  resetOn: ["density", "maxSize", "minSize", "padding"],
  stillFrames: 70,

  setup({ ctx, width, height }, { params, seed, tier, palette }) {
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);
    const state: PackingState = {
      grid: null,
      revealed: 0,
      growing: [],
      ready: Promise.resolve(),
      disposed: false,
      rng: createRng(seed ^ 0xbea7),
      spawnId: 1_000_000,
      sinceSpawn: 0,
      look: "",
      colourIds: new Map(),
    };
    // Scale sizes with the canvas so a phone and a poster look like the same piece.
    const unit = Math.min(width, height) / 800;
    const count = Math.round(MAX_CIRCLES * params.density * tierScale(tier));
    state.ready = packInWorker({
      width,
      height,
      seed,
      count,
      minR: params.minSize * unit,
      maxR: params.maxSize * unit,
      padding: params.padding * unit,
    }).then(({ circles, count: n }) => {
      if (state.disposed) return;
      const grid = new SpatialGrid(width, height, params.maxSize * unit * 2, n + 256);
      for (let i = 0; i < n; i++)
        grid.insert(circles[i * 3]!, circles[i * 3 + 1]!, circles[i * 3 + 2]!);
      state.grid = grid;
    });
    return state;
  },

  draw({ ctx, width, height }, { params, seed, palette, dt, reducedMotion }, audio, s) {
    const grid = s.grid;
    if (!grid) return; // worker still busy; the canvas just shows the background
    const step = Math.min(3, dt * 60) * (reducedMotion ? 0.4 : 1);
    const unit = Math.min(width, height) / 800;

    // Palette / style / weight changed live → repaint everything placed so far.
    const look = `${palette.id}|${params.style}|${params.weight}`;
    if (look !== s.look) {
      s.look = look;
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < s.revealed; i++) {
        drawCircle(
          ctx,
          grid.xs[i]!,
          grid.ys[i]!,
          grid.rs[i]!,
          colourFor(seed, i, palette, s),
          params.style,
          params.weight,
          palette.background,
        );
      }
    }

    // 1. Reveal the packing progressively (≈ 1 s at reveal speed 1).
    const rate = Math.max(
      10,
      Math.ceil(((grid.count - s.revealed) * params.reveal) / 30 + 30 * params.reveal),
    );
    const end = Math.min(grid.count, s.revealed + Math.ceil(rate * step));
    for (let i = s.revealed; i < end; i++) {
      drawCircle(
        ctx,
        grid.xs[i]!,
        grid.ys[i]!,
        grid.rs[i]!,
        colourFor(seed, i, palette, s),
        params.style,
        params.weight,
        palette.background,
      );
    }
    s.revealed = end;

    // 2. Spawn: on beats (more on loud bass), or slowly when there's no audio.
    s.sinceSpawn += step;
    let spawns = 0;
    if (audio.beat) spawns = 1 + Math.round(audio.bass * 3);
    else if (!audio.active && s.sinceSpawn > 90) spawns = 1;
    for (let k = 0; k < spawns; k++) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const x = s.rng.range(0, width);
        const y = s.rng.range(0, height);
        if (
          grid.freeRadius(x, y, params.minSize * unit * 2, params.padding * unit) >
          params.minSize * unit
        ) {
          s.growing.push({ x, y, r: params.minSize * unit, id: s.spawnId++ });
          s.sinceSpawn = 0;
          break;
        }
      }
    }

    // 3. Grow live circles until they touch something, then file them in the grid.
    const growth = (0.6 + audio.volume * 2) * unit * step;
    const maxR = params.maxSize * unit * 0.8;
    for (let i = s.growing.length - 1; i >= 0; i--) {
      const g = s.growing[i]!;
      const next = g.r + growth;
      const edge = Math.min(g.x, g.y, width - g.x, height - g.y) - params.padding * unit;
      let free = Math.min(edge, grid.freeRadius(g.x, g.y, next, params.padding * unit));
      for (const other of s.growing) {
        if (other === g) continue;
        free = Math.min(
          free,
          Math.hypot(other.x - g.x, other.y - g.y) - other.r - params.padding * unit,
        );
      }
      const done = free < next || next >= maxR;
      g.r = Math.max(g.r, Math.min(next, free));
      drawCircle(
        ctx,
        g.x,
        g.y,
        g.r,
        colourFor(seed, g.id, palette),
        params.style,
        params.weight,
        palette.background,
      );
      if (done) {
        s.growing.splice(i, 1);
        const idx = grid.insert(g.x, g.y, g.r);
        s.colourIds.set(idx, g.id);
        if (s.revealed === idx) s.revealed = idx + 1;
      }
    }
  },

  whenReady: (s) => s.ready,
  dispose(s) {
    s.disposed = true;
  },

  toSVG(s, { params, seed, palette }, width, height) {
    const grid = s.grid;
    const parts: string[] = [];
    if (grid) {
      for (let i = 0; i < grid.count; i++) {
        const x = grid.xs[i]!.toFixed(1);
        const y = grid.ys[i]!.toFixed(1);
        const r = grid.rs[i]!;
        const c = colourFor(seed, i, palette, s);
        if (params.style === "outline") {
          parts.push(
            `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="none" stroke="${c}" stroke-width="${params.weight}"/>`,
          );
          continue;
        }
        parts.push(`<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="${c}"/>`);
        if (params.style === "rings" && r > 6) {
          const gap = 4 + params.weight * 3;
          for (let rr = r - gap; rr > gap * 0.6; rr -= gap) {
            parts.push(
              `<circle cx="${x}" cy="${y}" r="${rr.toFixed(1)}" fill="none" stroke="${palette.background}" stroke-opacity="0.55" stroke-width="${(params.weight * 0.8).toFixed(2)}"/>`,
            );
          }
        }
      }
    }
    return svgDocument(width, height, palette.background, parts.join("\n"));
  },
};
