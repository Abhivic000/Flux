import { buildContext, renderStill, type ArtState } from "@/lib/render";
import { getSketch } from "@/sketches";
import { offscreenSupported, renderOffThread } from "./offscreen";

/**
 * SVG export for the vector modes (terrain contours, circle packing, tree). The sketch
 * re-generates its geometry from the seed on a scratch canvas, then serialises that same
 * geometry as SVG elements. Flow field / orbits are thousands of fading strokes — pixels,
 * not shapes — so they have no useful vector form and offer PNG only.
 */
export function supportsSvg(art: Pick<ArtState, "mode">): boolean {
  return typeof getSketch(art.mode).toSVG === "function";
}

export async function exportSvg(art: ArtState, width: number, height: number): Promise<Blob> {
  const sketch = getSketch(art.mode);
  if (!sketch.toSVG) throw new Error(`${sketch.name} has no SVG export`);
  if (offscreenSupported()) {
    const reply = await renderOffThread({ kind: "svg", art, width, height, scale: 1 });
    if (reply.ok && reply.svg) return new Blob([reply.svg], { type: "image/svg+xml" });
  }
  const scratch = document.createElement("canvas");
  scratch.width = Math.max(1, Math.round(width));
  scratch.height = Math.max(1, Math.round(height));
  const ctx = scratch.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  const state = await renderStill(sketch, { ctx, width, height }, art);
  const svg = sketch.toSVG(state, buildContext(art, sketch.stillFrames, 1 / 60, 0), width, height);
  return new Blob([svg], { type: "image/svg+xml" });
}
