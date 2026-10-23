import type { ZodType } from "zod";

export type ModeId = "flow" | "packing" | "terrain" | "orbits" | "tree";
export type QualityTier = "high" | "medium" | "low";
export type Band = "bass" | "mid" | "treble";

export type ParamValue = number | boolean | string;
/** Params are flat key → primitive maps so they encode cleanly into a URL. */
export type BaseParams = Record<string, ParamValue>;

/** Per-frame audio snapshot. All levels are smoothed and normalised to 0..1. */
export interface AudioFeatures {
  /** True while a source is playing / listening. */
  active: boolean;
  bass: number;
  mid: number;
  treble: number;
  volume: number;
  /** True on the single frame a beat onset is detected (≤ 3 per second, see features.ts). */
  beat: boolean;
  /** 1 on a beat, decaying to 0 — handy for easing beat effects instead of flashing. */
  beatPulse: number;
  /** 32 log-spaced bands from ~30 Hz to ~16 kHz, 0..1. */
  spectrum: Float32Array;
}

/**
 * Where a sketch draws. Backed by p5's canvas in the studio, by a p5 graphics buffer for
 * posters, and by a plain <canvas> for gallery thumbnails and the landing background.
 * `width`/`height` are in CSS pixels; the context is already scaled for pixel density.
 */
export interface Surface {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

export interface Palette {
  id: string;
  name: string;
  background: string;
  colors: string[];
}

export interface SketchContext<P> {
  params: P;
  seed: number;
  tier: QualityTier;
  palette: Palette;
  reducedMotion: boolean;
  /** Frames since setup. */
  frame: number;
  /** Seconds since the previous frame (clamped). Offline renders use a fixed 1/60. */
  dt: number;
  /** Seconds of simulated time since setup. */
  time: number;
}

export type ControlSpec =
  | {
      kind: "number";
      label: string;
      min: number;
      max: number;
      step: number;
      /** Ties a control to a patch-cable colour in the panel. */
      band?: Band;
      /** Narrower range used by "Randomise", so random picks stay pleasant. */
      random?: [number, number];
      /** Excluded from "Randomise" (e.g. sensitivities). */
      noRandom?: boolean;
    }
  | { kind: "boolean"; label: string; noRandom?: boolean }
  | { kind: "palette"; label: string; noRandom?: boolean }
  | {
      kind: "select";
      label: string;
      options: { value: string; label: string }[];
      noRandom?: boolean;
    };

/**
 * The strategy interface every visual mode implements: one implementation per mode,
 * picked at runtime.
 *
 * `setup` builds the mode's state; `draw` advances and paints one frame from that state.
 * Sketches are pure with respect to the app: they read params + audio, and draw to the
 * surface. They never touch React state or the DOM.
 */
export interface Sketch<P extends BaseParams, S = unknown> {
  id: ModeId;
  name: string;
  /** One line for the panel and gallery. */
  blurb: string;
  defaults: P;
  /** Validates URL params; every field falls back to its default on bad input. */
  schema: ZodType<P>;
  controls: { [K in keyof P]: ControlSpec };
  /** Param keys whose change needs a fresh `setup` (others apply live). */
  resetOn: readonly (keyof P)[];
  /** Frames to simulate when rendering a still (poster, thumbnail). */
  stillFrames: number;
  setup(surface: Surface, ctx: SketchContext<P>): S;
  draw(surface: Surface, ctx: SketchContext<P>, audio: AudioFeatures, state: S): void;
  /** Resolves when async setup work (e.g. a worker job) has finished. */
  whenReady?(state: S): Promise<void>;
  dispose?(state: S): void;
  /** Vector modes only. */
  toSVG?(state: S, ctx: SketchContext<P>, width: number, height: number): string;
}

/** A sketch with its param type erased, for the mode registry. */
export type AnySketch = Sketch<BaseParams, unknown>;
