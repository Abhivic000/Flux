import { buildContext, renderStill, type ArtState } from "@/lib/render";
import { getSketch } from "@/sketches";

/**
 * Renders posters / SVGs on an OffscreenCanvas, off the main thread.
 *
 * Sketches only need a 2D context and never touch the DOM, so the exact same code that
 * draws the live canvas runs here. A 3000 px poster can take seconds of raster work;
 * on the main thread that froze the live canvas, here it costs the page nothing.
 */
export interface RenderRequest {
  id: number;
  kind: "png" | "svg";
  art: ArtState;
  /** Composition size in CSS px (the live canvas size). */
  width: number;
  height: number;
  /** Output pixels per CSS px. */
  scale: number;
}

export type RenderReply =
  { id: number; ok: true; png?: Blob; svg?: string } | { id: number; ok: false; error: string };

const ctx = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { id, kind, art, width, height, scale } = e.data;
  try {
    const sketch = getSketch(art.mode);
    const canvas = new OffscreenCanvas(Math.round(width * scale), Math.round(height * scale));
    // willReadFrequently → a CPU-backed canvas: raster happens on THIS worker thread
    // instead of the shared GPU process, so a heavy poster can't starve the page's frames.
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) throw new Error("No 2D context in worker");
    g.setTransform(scale, 0, 0, scale, 0, 0);
    // OffscreenCanvasRenderingContext2D has every drawing method the sketches use.
    const surface = { ctx: g as unknown as CanvasRenderingContext2D, width, height };
    // No live frame to protect in here, so render in one go.
    const state = await renderStill(sketch, surface, art, { budgetMs: Infinity });
    if (kind === "svg") {
      if (!sketch.toSVG) throw new Error(`${sketch.name} has no SVG export`);
      const svg = sketch.toSVG(
        state,
        buildContext(art, sketch.stillFrames, 1 / 60, 0),
        width,
        height,
      );
      ctx.postMessage({ id, ok: true, svg } satisfies RenderReply);
    } else {
      const png = await canvas.convertToBlob({ type: "image/png" });
      ctx.postMessage({ id, ok: true, png } satisfies RenderReply);
    }
  } catch (err) {
    ctx.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : "Render failed",
    } satisfies RenderReply);
  }
};
