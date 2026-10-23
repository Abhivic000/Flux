import type p5 from "p5";

/**
 * A tiny handle to the live p5 instance, for imperative features that need it (poster
 * buffers, clip recording). Set by P5Canvas on mount and cleared on unmount.
 * Kept out of Zustand on purpose: it isn't UI state and must never trigger renders.
 */
export const studioRuntime: {
  p: p5 | null;
  canvas: HTMLCanvasElement | null;
  /** Smoothed FPS, written every frame, read by the panel readout. */
  fps: number;
  /** Smoothed time spent in sketch.draw() per frame, ms (the ~12 ms budget). */
  drawMs: number;
} = { p: null, canvas: null, fps: 0, drawMs: 0 };
