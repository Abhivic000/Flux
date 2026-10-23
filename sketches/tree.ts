import { rgba } from "@/lib/palettes";
import { createNoise, hashFloat, type Noise } from "@/lib/random";
import { audioControls, audioDefaults, buildSchema } from "./params";
import { svgDocument } from "./svg";
import type { ControlSpec, Palette, Sketch } from "./types";

/**
 * Recursive tree: branch(len, angle) draws a line, then calls itself twice with a shorter
 * length and rotated angles, until the depth runs out.
 *
 *            \ /   \ /
 *             Y     Y        depth d draws 2^d − 1 branches
 *              \   /         (depth 12 → 4 095 lines, depth 13 → 8 191)
 *                Y
 *                |
 *
 * Per-branch randomness uses hashFloat(seed, nodeIndex) — a stateless hash of the node's
 * position in the tree (heap index: children of i are 2i+1, 2i+2). So changing depth
 * doesn't reshuffle the branches that already exist.
 *
 * Audio: volume opens the branch angle; bass adds depth (fractional: the newest level
 * grows in smoothly instead of popping). Depth is capped per quality tier.
 */

const defaults = {
  palette: "spring",
  depth: 9,
  angle: 24,
  shrink: 0.72,
  trunk: 0.26,
  jitter: 0.35,
  sway: 0.4,
  weight: 9,
  leaves: true,
  ...audioDefaults,
};

export type TreeParams = typeof defaults;

const controls: { [K in keyof TreeParams]: ControlSpec } = {
  palette: { kind: "palette", label: "Palette" },
  depth: { kind: "number", label: "Depth", min: 3, max: 12, step: 1, random: [7, 11] },
  angle: { kind: "number", label: "Branch angle", min: 5, max: 70, step: 1, random: [14, 45] },
  shrink: {
    kind: "number",
    label: "Shrink",
    min: 0.55,
    max: 0.82,
    step: 0.01,
    random: [0.64, 0.78],
  },
  trunk: { kind: "number", label: "Trunk", min: 0.12, max: 0.36, step: 0.01 },
  jitter: { kind: "number", label: "Jitter", min: 0, max: 1, step: 0.05 },
  sway: { kind: "number", label: "Wind", min: 0, max: 1, step: 0.05 },
  weight: { kind: "number", label: "Trunk weight", min: 2, max: 24, step: 0.5 },
  leaves: { kind: "boolean", label: "Leaves" },
  ...audioControls,
};

/** Depth caps per quality tier (2^13 ≈ 8k lines on high, 2^10 ≈ 1k on low). */
const MAX_DEPTH: Record<string, number> = { high: 13, medium: 11, low: 10 };

interface TreeState {
  noise: Noise;
  t: number;
  depthNow: number;
  angleNow: number;
  /** Segments per depth level: [x1, y1, x2, y2, …]. Reused between frames. */
  levels: number[][];
  leaves: number[];
}

/** Builds the tree into s.levels / s.leaves. Pure geometry, shared by draw and toSVG. */
function grow(s: TreeState, params: TreeParams, seed: number, width: number, height: number) {
  for (const l of s.levels) l.length = 0;
  s.leaves.length = 0;
  const maxDepth = Math.ceil(s.depthNow);
  const frac = s.depthNow - Math.floor(s.depthNow) || 1; // growth of the newest level
  while (s.levels.length < maxDepth) s.levels.push([]);
  const spread = (s.angleNow * Math.PI) / 180;
  const jitter = params.jitter;
  const wind = params.sway;

  const branch = (x: number, y: number, len: number, ang: number, d: number, node: number) => {
    const grown = d === maxDepth - 1 ? frac : 1;
    // Wind: smooth noise over time, stronger towards the thin outer branches.
    const sway = wind * 0.25 * s.noise.noise2(s.t * 0.6 + node * 0.0005, d * 0.7) * (d / maxDepth);
    const a = ang + sway;
    const x2 = x + Math.cos(a) * len * grown;
    const y2 = y + Math.sin(a) * len * grown;
    s.levels[d]!.push(x, y, x2, y2);
    if (d + 1 >= maxDepth) {
      s.leaves.push(x2, y2, hashFloat(seed, node));
      return;
    }
    const j1 = (hashFloat(seed, node * 2 + 1) - 0.5) * jitter;
    const j2 = (hashFloat(seed, node * 2 + 2) - 0.5) * jitter;
    const l1 = len * params.shrink * (1 + j1 * 0.5);
    const l2 = len * params.shrink * (1 - j2 * 0.5);
    branch(x2, y2, l1, a - spread * (1 + j1), d + 1, node * 2 + 1);
    branch(x2, y2, l2, a + spread * (1 + j2), d + 1, node * 2 + 2);
  };
  branch(width / 2, height * 0.98, height * params.trunk, -Math.PI / 2, 0, 0);
}

function strokeWidth(params: TreeParams, d: number, unit: number) {
  return Math.max(0.5, params.weight * unit * Math.pow(0.68, d));
}

function leafColour(palette: Palette, h: number) {
  const n = palette.colors.length;
  // Trunk uses the first colour; leaves pick from the rest.
  return palette.colors[n > 2 ? 2 + Math.floor(h * (n - 2)) : n - 1]!;
}

export const tree: Sketch<TreeParams, TreeState> = {
  id: "tree",
  name: "Recursive tree",
  blurb: "Recursive branching. Volume opens the angle; bass grows extra levels.",
  defaults,
  schema: buildSchema("tree", defaults, controls),
  controls,
  resetOn: [],
  stillFrames: 1,

  setup(_surface, { params, seed }) {
    return {
      noise: createNoise(seed),
      t: 0,
      depthNow: params.depth,
      angleNow: params.angle,
      levels: [],
      leaves: [],
    };
  },

  draw({ ctx, width, height }, { params, seed, tier, palette, dt, reducedMotion }, audio, s) {
    s.t += dt * (reducedMotion ? 0.4 : 1);
    const cap = MAX_DEPTH[tier] ?? 11;
    const targetDepth = Math.min(cap, params.depth + audio.bass * 2);
    const targetAngle = params.angle + audio.volume * 22;
    // Ease towards the audio-driven targets so the tree breathes instead of twitching.
    const k = 1 - Math.exp(-dt / 0.15);
    s.depthNow += (targetDepth - s.depthNow) * k;
    s.angleNow += (targetAngle - s.angleNow) * k;
    if (Math.abs(s.depthNow - targetDepth) < 0.01) s.depthNow = targetDepth;

    grow(s, params, seed, width, height);

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = "round";
    const unit = height / 800;
    const trunkColour = palette.colors[0]!;
    const twig = palette.colors[1] ?? trunkColour;
    // One path per depth level → ~12 stroke() calls for thousands of branches.
    s.levels.forEach((segs, d) => {
      if (segs.length === 0) return;
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 4) {
        ctx.moveTo(segs[i]!, segs[i + 1]!);
        ctx.lineTo(segs[i + 2]!, segs[i + 3]!);
      }
      ctx.lineWidth = strokeWidth(params, d, unit);
      ctx.strokeStyle = d < s.levels.length * 0.5 ? trunkColour : twig;
      ctx.stroke();
    });
    if (params.leaves) {
      const r = Math.max(1.5, 3.2 * unit);
      for (let i = 0; i < s.leaves.length; i += 3) {
        ctx.fillStyle = rgba(leafColour(palette, s.leaves[i + 2]!), 0.85);
        ctx.beginPath();
        ctx.arc(s.leaves[i]!, s.leaves[i + 1]!, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  toSVG(s, { params, palette }, width, height) {
    const unit = height / 800;
    const parts: string[] = [];
    const trunkColour = palette.colors[0]!;
    const twig = palette.colors[1] ?? trunkColour;
    s.levels.forEach((segs, d) => {
      let path = "";
      for (let i = 0; i < segs.length; i += 4) {
        path += `M${segs[i]!.toFixed(1)} ${segs[i + 1]!.toFixed(1)}L${segs[i + 2]!.toFixed(1)} ${segs[i + 3]!.toFixed(1)}`;
      }
      if (!path) return;
      const colour = d < s.levels.length * 0.5 ? trunkColour : twig;
      parts.push(
        `<path d="${path}" fill="none" stroke="${colour}" stroke-width="${strokeWidth(params, d, unit).toFixed(2)}" stroke-linecap="round"/>`,
      );
    });
    if (params.leaves) {
      const r = Math.max(1.5, 3.2 * unit).toFixed(1);
      for (let i = 0; i < s.leaves.length; i += 3) {
        parts.push(
          `<circle cx="${s.leaves[i]!.toFixed(1)}" cy="${s.leaves[i + 1]!.toFixed(1)}" r="${r}" fill="${leafColour(palette, s.leaves[i + 2]!)}" fill-opacity="0.85"/>`,
        );
      }
    }
    return svgDocument(width, height, palette.background, parts.join("\n"));
  },
};
